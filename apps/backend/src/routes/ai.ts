import { Router, Response } from "express"
import { Warehouse } from "../models/Warehouse"
import { WarehouseFlow, IWarehouseFlowItem, WarehouseFlowOperation } from "../models/WarehouseFlow"
import { Zone, ZONE_TYPES, ZONE_TYPE_COLORS, ZoneType } from "../models/Zone"
import { Location } from "../models/Location"
import { authenticate, AuthRequest } from "../middleware/auth"
import { callGemini } from "../utils/gemini"

const router = Router()
router.use(authenticate)

// ──────────────────────────────────────────────────────────────
// 1. Demand Forecasting
// ──────────────────────────────────────────────────────────────

interface DailyBucket {
  date: string
  items: Map<string, { loaded: number; unloaded: number }>
}

function exponentialSmoothing(series: number[], alpha: number, forecastDays: number): number[] {
  if (series.length === 0) return Array(forecastDays).fill(0)
  let level = series[0]
  for (let i = 1; i < series.length; i++) {
    level = alpha * series[i] + (1 - alpha) * level
  }

  let trend = 0
  if (series.length >= 2) {
    const recentSlice = series.slice(-Math.min(14, series.length))
    trend = (recentSlice[recentSlice.length - 1] - recentSlice[0]) / recentSlice.length
  }

  const forecast: number[] = []
  for (let d = 1; d <= forecastDays; d++) {
    forecast.push(Math.max(0, Math.round((level + trend * d) * 100) / 100))
  }
  return forecast
}

function movingAverage(series: number[], window: number): number[] {
  if (series.length === 0) return []
  const result: number[] = []
  for (let i = 0; i < series.length; i++) {
    const start = Math.max(0, i - window + 1)
    const slice = series.slice(start, i + 1)
    result.push(Math.round((slice.reduce((a, b) => a + b, 0) / slice.length) * 100) / 100)
  }
  return result
}

router.get("/:warehouseId/demand-forecast", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return }

    const warehouse = await Warehouse.findOne({ _id: req.params.warehouseId, userId: req.user.id })
    if (!warehouse) { res.status(404).json({ error: "Warehouse not found" }); return }

    const forecastDays = Math.min(90, Math.max(7, parseInt(String(req.query.days), 10) || 30))
    const historyDays = Math.max(forecastDays * 2, 90)

    const now = new Date()
    const fromDate = new Date(now.getTime() - historyDays * 24 * 60 * 60 * 1000)

    const flows = await WarehouseFlow.find({
      warehouseId: warehouse._id,
      createdAt: { $gte: fromDate },
    }).sort({ createdAt: 1 }).lean()

    const dailyMap = new Map<string, Map<string, { loaded: number; unloaded: number }>>()
    const allTypes = new Set<string>()

    type FlowRow = { operation: WarehouseFlowOperation; items: IWarehouseFlowItem[]; createdAt: Date }
    for (const f of flows as FlowRow[]) {
      const dayKey = f.createdAt.toISOString().slice(0, 10)
      if (!dailyMap.has(dayKey)) dailyMap.set(dayKey, new Map())
      const dayBucket = dailyMap.get(dayKey)!
      for (const item of f.items || []) {
        allTypes.add(item.typeName)
        if (!dayBucket.has(item.typeName)) dayBucket.set(item.typeName, { loaded: 0, unloaded: 0 })
        const entry = dayBucket.get(item.typeName)!
        if (f.operation === "load") entry.loaded += item.count
        else entry.unloaded += item.count
      }
    }

    const sortedDays: string[] = []
    const cursor = new Date(fromDate)
    while (cursor <= now) {
      sortedDays.push(cursor.toISOString().slice(0, 10))
      cursor.setDate(cursor.getDate() + 1)
    }

    const typeForecasts: {
      typeName: string
      currentStock: number
      avgDailyDemand: number
      avgDailySupply: number
      forecastedDemand: number[]
      forecastedSupply: number[]
      movingAvgDemand: number[]
      historicalDemand: number[]
      historicalSupply: number[]
      daysUntilStockout: number | null
      riskLevel: "low" | "medium" | "high" | "critical"
      recommendation: string
    }[] = []

    const inventory = warehouse.inventory || []
    const invMap = new Map<string, number>()
    for (const item of inventory) invMap.set(item.typeName, item.count)

    for (const typeName of allTypes) {
      const demandSeries: number[] = []
      const supplySeries: number[] = []
      for (const day of sortedDays) {
        const bucket = dailyMap.get(day)
        const entry = bucket?.get(typeName)
        demandSeries.push(entry?.unloaded ?? 0)
        supplySeries.push(entry?.loaded ?? 0)
      }

      const forecastDemand = exponentialSmoothing(demandSeries, 0.3, forecastDays)
      const forecastSupply = exponentialSmoothing(supplySeries, 0.3, forecastDays)
      const ma = movingAverage(demandSeries, 7)

      const avgDailyDemand = demandSeries.length > 0
        ? demandSeries.reduce((a, b) => a + b, 0) / demandSeries.length
        : 0
      const avgDailySupply = supplySeries.length > 0
        ? supplySeries.reduce((a, b) => a + b, 0) / supplySeries.length
        : 0

      const currentStock = invMap.get(typeName) ?? 0
      let daysUntilStockout: number | null = null
      if (avgDailyDemand > 0) {
        let stock = currentStock
        for (let d = 0; d < forecastDays; d++) {
          stock = stock - forecastDemand[d] + forecastSupply[d]
          if (stock <= 0) { daysUntilStockout = d + 1; break }
        }
      }

      let riskLevel: "low" | "medium" | "high" | "critical" = "low"
      let recommendation = ""
      if (daysUntilStockout !== null && daysUntilStockout <= 7) {
        riskLevel = "critical"
        recommendation = `Critical: Stock will run out in ~${daysUntilStockout} days. Reorder immediately.`
      } else if (daysUntilStockout !== null && daysUntilStockout <= 14) {
        riskLevel = "high"
        recommendation = `High risk: Stock may run out in ~${daysUntilStockout} days. Plan a reorder soon.`
      } else if (avgDailyDemand > avgDailySupply * 1.5) {
        riskLevel = "medium"
        recommendation = `Demand outpacing supply. Consider increasing order frequency.`
      } else if (currentStock > avgDailyDemand * 60 && avgDailyDemand > 0) {
        riskLevel = "low"
        recommendation = `Overstocked (~${Math.round(currentStock / avgDailyDemand)} days of supply). Consider reducing orders or running promotions.`
      } else {
        recommendation = `Stock levels are healthy.`
      }

      typeForecasts.push({
        typeName,
        currentStock,
        avgDailyDemand: Math.round(avgDailyDemand * 100) / 100,
        avgDailySupply: Math.round(avgDailySupply * 100) / 100,
        forecastedDemand: forecastDemand,
        forecastedSupply: forecastSupply,
        movingAvgDemand: ma,
        historicalDemand: demandSeries,
        historicalSupply: supplySeries,
        daysUntilStockout,
        riskLevel,
        recommendation,
      })
    }

    typeForecasts.sort((a, b) => {
      const riskOrder = { critical: 0, high: 1, medium: 2, low: 3 }
      return riskOrder[a.riskLevel] - riskOrder[b.riskLevel] || b.avgDailyDemand - a.avgDailyDemand
    })

    const forecastDates: string[] = []
    const c2 = new Date(now)
    for (let d = 1; d <= forecastDays; d++) {
      c2.setDate(c2.getDate() + 1)
      forecastDates.push(c2.toISOString().slice(0, 10))
    }

    res.json({
      warehouseId: warehouse._id.toString(),
      warehouseName: warehouse.name,
      historyDays,
      forecastDays,
      historicalDates: sortedDays,
      forecastDates,
      forecasts: typeForecasts,
      generatedAt: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error("Demand forecast error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// ──────────────────────────────────────────────────────────────
// 2. Smart Putaway
// ──────────────────────────────────────────────────────────────

router.post("/:warehouseId/smart-putaway", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return }

    const warehouse = await Warehouse.findOne({ _id: req.params.warehouseId, userId: req.user.id })
    if (!warehouse) { res.status(404).json({ error: "Warehouse not found" }); return }

    const { typeName, count } = req.body
    if (!typeName || typeof typeName !== "string") {
      res.status(400).json({ error: "typeName is required" }); return
    }
    const qty = typeof count === "number" ? count : parseInt(String(count), 10) || 1

    const zones = await Zone.find({ warehouseId: warehouse._id }).lean()
    const locations = await Location.find({
      warehouseId: warehouse._id,
      status: "active",
    }).lean()

    if (locations.length === 0) {
      res.status(400).json({ error: "No active locations found. Create zones and locations first." }); return
    }

    const flows90d = await WarehouseFlow.find({
      warehouseId: warehouse._id,
      createdAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
    }).lean()

    const turnoverMap = new Map<string, number>()
    const affinityMap = new Map<string, Map<string, number>>()

    type FlowRow = { operation: WarehouseFlowOperation; items: IWarehouseFlowItem[]; createdAt: Date }
    for (const f of flows90d as FlowRow[]) {
      const typeNames = f.items.map(i => i.typeName)
      for (const item of f.items) {
        turnoverMap.set(item.typeName, (turnoverMap.get(item.typeName) ?? 0) + item.count)
        if (!affinityMap.has(item.typeName)) affinityMap.set(item.typeName, new Map())
        const aff = affinityMap.get(item.typeName)!
        for (const other of typeNames) {
          if (other !== item.typeName) {
            aff.set(other, (aff.get(other) ?? 0) + 1)
          }
        }
      }
    }

    const turnover = turnoverMap.get(typeName) ?? 0
    const isFastMover = turnover > (Array.from(turnoverMap.values()).reduce((a, b) => a + b, 0) / Math.max(turnoverMap.size, 1)) * 1.5
    const affinities = affinityMap.get(typeName) ?? new Map<string, number>()

    const zoneMap = new Map<string, typeof zones[0]>()
    for (const z of zones) zoneMap.set(z._id.toString(), z)

    const scored = locations.map(loc => {
      const currentItems = loc.inventory.reduce((s, i) => s + i.count, 0)
      const availableSpace = loc.maxCapacity - currentItems
      if (availableSpace <= 0) return null

      const zone = zoneMap.get(loc.zoneId.toString())
      let score = 0

      if (availableSpace >= qty) score += 30
      else score += (availableSpace / qty) * 15

      score += Math.min(20, (availableSpace / loc.maxCapacity) * 20)

      if (isFastMover && zone && zone.type === "shipping") score += 25
      else if (!isFastMover && zone && zone.type === "storage") score += 15
      if (zone && zone.type === "cold_storage") score -= 5

      const hasSameType = loc.inventory.some(i => i.typeName === typeName)
      if (hasSameType) score += 20

      for (const inv of loc.inventory) {
        if (affinities.has(inv.typeName)) {
          score += Math.min(10, (affinities.get(inv.typeName)! / 5) * 10)
        }
      }

      return {
        locationId: loc._id.toString(),
        locationCode: loc.code,
        zoneId: loc.zoneId.toString(),
        zoneName: zone?.name ?? "Unknown",
        zoneType: zone?.type ?? "storage",
        aisle: loc.aisle,
        rack: loc.rack,
        currentItems,
        maxCapacity: loc.maxCapacity,
        availableSpace,
        score: Math.round(score * 100) / 100,
        reasons: [] as string[],
      }
    }).filter(Boolean) as {
      locationId: string; locationCode: string; zoneId: string; zoneName: string
      zoneType: string; aisle: string; rack: string; currentItems: number
      maxCapacity: number; availableSpace: number; score: number; reasons: string[]
    }[]

    scored.sort((a: { score: number }, b: { score: number }) => b.score - a.score)

    for (const s of scored.slice(0, 5)) {
      if (s.availableSpace >= qty) s.reasons.push("Sufficient space available")
      const zone = zoneMap.get(s.zoneId)
      if (isFastMover && zone?.type === "shipping") s.reasons.push("Fast mover — placed near shipping zone")
      if (s.score > 0 && scored[0] && s === scored[0]) s.reasons.push("Highest overall score")
      const hasSameType = locations.find(l => l._id.toString() === s.locationId)?.inventory.some(i => i.typeName === typeName)
      if (hasSameType) s.reasons.push("Consolidates with same product type")
    }

    res.json({
      typeName,
      count: qty,
      isFastMover,
      turnover90d: turnover,
      topAffinities: Array.from(affinities.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ typeName: name, coOccurrences: count })),
      recommendations: scored.slice(0, 5),
      totalLocationsEvaluated: locations.length,
    })
  } catch (error: any) {
    console.error("Smart putaway error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// ──────────────────────────────────────────────────────────────
// 3. Ergonomic Warehouse Layout Generation (AI + algorithmic fallback)
// ──────────────────────────────────────────────────────────────

type LayoutZone = {
  name: string; code: string; type: ZoneType; color: string
  x: number; y: number; w: number; h: number
  aisles: number; racksPerAisle: number; capacityPerSlot: number; rationale: string
}

function generateAlgorithmicLayout(cols: number, rows: number): LayoutZone[] {
  const gap = 1
  const zones: LayoutZone[] = []

  const recvW = Math.max(3, Math.floor(cols * 0.25))
  const recvH = Math.max(2, Math.floor(rows * 0.3))
  zones.push({
    name: "Receiving", code: "RECV", type: "receiving", color: ZONE_TYPE_COLORS["receiving"],
    x: 0, y: 0, w: recvW, h: recvH,
    aisles: Math.max(1, Math.floor(recvW / 2)),
    racksPerAisle: Math.max(1, Math.floor(recvH / 1.5)),
    capacityPerSlot: 150,
    rationale: "Receiving at top-left for incoming goods flow",
  })

  const retX = 0
  const retY = recvH + gap
  const retW = recvW
  const retH = Math.max(2, Math.floor(rows * 0.2))
  if (retY + retH <= rows) {
    zones.push({
      name: "Returns", code: "RTN", type: "returns", color: ZONE_TYPE_COLORS["returns"],
      x: retX, y: retY, w: retW, h: retH,
      aisles: Math.max(1, Math.floor(retW / 2)),
      racksPerAisle: Math.max(1, Math.floor(retH / 1.5)),
      capacityPerSlot: 80,
      rationale: "Returns near receiving for quick processing",
    })
  }

  const storX = recvW + gap
  const storW = Math.max(4, cols - recvW - gap * 2 - Math.floor(cols * 0.25))
  const storH = Math.max(3, Math.floor(rows * 0.55))
  zones.push({
    name: "Main Storage", code: "STOR", type: "storage", color: ZONE_TYPE_COLORS["storage"],
    x: storX, y: 0, w: storW, h: storH,
    aisles: Math.max(2, Math.floor(storW / 2)),
    racksPerAisle: Math.max(2, Math.floor(storH / 2)),
    capacityPerSlot: 200,
    rationale: "Large central storage zone for maximum capacity",
  })

  const shipW = Math.max(3, Math.floor(cols * 0.25))
  const shipX = cols - shipW
  const shipH = Math.max(2, Math.floor(rows * 0.3))
  const shipY = rows - shipH
  if (shipX >= storX + storW + gap || shipY >= storH + gap) {
    zones.push({
      name: "Shipping", code: "SHIP", type: "shipping", color: ZONE_TYPE_COLORS["shipping"],
      x: shipX, y: shipY, w: shipW, h: shipH,
      aisles: Math.max(1, Math.floor(shipW / 2)),
      racksPerAisle: Math.max(1, Math.floor(shipH / 1.5)),
      capacityPerSlot: 150,
      rationale: "Shipping at bottom-right, opposite receiving for flow-through",
    })
  }

  const stagY = storH + gap
  const stagW = Math.max(3, storW - gap)
  const stagH = Math.max(2, Math.min(3, rows - stagY - (shipH + gap)))
  if (stagY + stagH <= rows) {
    zones.push({
      name: "Staging", code: "STAGE", type: "staging", color: ZONE_TYPE_COLORS["staging"],
      x: storX, y: stagY, w: Math.min(stagW, shipX > storX ? shipX - storX - gap : stagW), h: stagH,
      aisles: Math.max(1, Math.floor(stagW / 3)),
      racksPerAisle: Math.max(1, Math.floor(stagH)),
      capacityPerSlot: 120,
      rationale: "Staging between storage and shipping for order prep",
    })
  }

  const coldX = 0
  const coldY = rows - Math.max(2, Math.floor(rows * 0.2))
  const coldW = Math.max(2, Math.floor(cols * 0.15))
  const coldH = rows - coldY
  const overlapsExisting = zones.some(z =>
    coldX < z.x + z.w && coldX + coldW > z.x && coldY < z.y + z.h && coldY + coldH > z.y
  )
  if (!overlapsExisting && coldY >= (retY ?? 0) + (retH ?? 0) + gap) {
    zones.push({
      name: "Cold Storage", code: "COLD", type: "cold_storage", color: ZONE_TYPE_COLORS["cold_storage"],
      x: coldX, y: coldY, w: coldW, h: coldH,
      aisles: Math.max(1, Math.floor(coldW / 2)),
      racksPerAisle: Math.max(1, Math.floor(coldH / 2)),
      capacityPerSlot: 80,
      rationale: "Cold storage in corner to minimize energy loss",
    })
  }

  return zones
}

function validateAndClampZones(zonesData: any[], cols: number, rows: number): LayoutZone[] {
  const validatedZones: LayoutZone[] = []
  const usedCodes = new Set<string>()
  const grid: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false))

  for (const z of zonesData) {
    const type = ZONE_TYPES.includes(z.type) ? z.type as ZoneType : "storage"
    let code = String(z.code || "").toUpperCase().slice(0, 6)
    if (!code || usedCodes.has(code)) code = type.toUpperCase().slice(0, 3) + String(validatedZones.length + 1)
    code = code.slice(0, 6)

    const x = Math.max(0, Math.min(cols - 1, Math.floor(Number(z.x) || 0)))
    const y = Math.max(0, Math.min(rows - 1, Math.floor(Number(z.y) || 0)))
    const w = Math.max(1, Math.min(cols - x, Math.floor(Number(z.w) || 3)))
    const h = Math.max(1, Math.min(rows - y, Math.floor(Number(z.h) || 2)))

    let overlap = false
    for (let ry = y; ry < y + h && !overlap; ry++) {
      for (let cx = x; cx < x + w && !overlap; cx++) {
        if (grid[ry]?.[cx]) overlap = true
      }
    }
    if (overlap) continue

    for (let ry = y; ry < y + h; ry++) {
      for (let cx = x; cx < x + w; cx++) {
        if (grid[ry]) grid[ry][cx] = true
      }
    }

    usedCodes.add(code)
    validatedZones.push({
      name: String(z.name || `${type} Zone`),
      code, type, color: ZONE_TYPE_COLORS[type],
      x, y, w, h,
      aisles: Math.max(1, Math.min(50, Math.floor(Number(z.aisles) || 2))),
      racksPerAisle: Math.max(1, Math.min(50, Math.floor(Number(z.racksPerAisle) || 3))),
      capacityPerSlot: Math.max(1, Math.floor(Number(z.capacityPerSlot) || 100)),
      rationale: String(z.rationale || ""),
    })
  }

  return validatedZones
}

router.post("/:warehouseId/generate-layout", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return }

    const warehouse = await Warehouse.findOne({ _id: req.params.warehouseId, userId: req.user.id })
    if (!warehouse) { res.status(404).json({ error: "Warehouse not found" }); return }

    const { gridCols, gridRows, preferences } = req.body
    const cols = Math.min(40, Math.max(10, parseInt(String(gridCols), 10) || 20))
    const rows = Math.min(30, Math.max(8, parseInt(String(gridRows), 10) || 14))

    let validatedZones: LayoutZone[] = []
    let source: "ai" | "algorithm" = "algorithm"

    try {
      const inventory = warehouse.inventory || []
      const totalItems = inventory.reduce((s, i) => s + i.count, 0)

      const flows90d = await WarehouseFlow.find({
        warehouseId: warehouse._id,
        createdAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
      }).lean()

      const typeVolume = new Map<string, number>()
      type FlowRow = { operation: WarehouseFlowOperation; items: IWarehouseFlowItem[]; createdAt: Date }
      for (const f of flows90d as FlowRow[]) {
        for (const item of f.items) {
          typeVolume.set(item.typeName, (typeVolume.get(item.typeName) ?? 0) + item.count)
        }
      }

      const existingZones = await Zone.find({ warehouseId: warehouse._id }).lean()
      const existingLocations = await Location.find({ warehouseId: warehouse._id }).lean()

      const context = {
        warehouse: { name: warehouse.name, address: warehouse.address },
        gridDimensions: { cols, rows },
        totalGridCells: cols * rows,
        currentInventory: {
          totalItems,
          typeCount: inventory.length,
          topProducts: inventory.sort((a, b) => b.count - a.count).slice(0, 10).map(i => ({ typeName: i.typeName, count: i.count })),
        },
        flowVolume90d: Array.from(typeVolume.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, vol]) => ({ typeName: name, totalMoved: vol })),
        existingZoneCount: existingZones.length,
        existingLocationCount: existingLocations.length,
        preferences: preferences || "general-purpose warehouse",
        validZoneTypes: ZONE_TYPES,
      }

      const prompt = `You are an expert warehouse layout designer. Design an optimal ergonomic warehouse floor plan.

Principles: Receiving on one side, shipping opposite (flow-through). Fast movers near shipping. Cold storage in a corner. Staging between storage and shipping. Returns near receiving. Leave walkway gaps between zones.

Warehouse context:
${JSON.stringify(context, null, 2)}

Return ONLY a JSON array (no markdown, no text):
[{"name":"Zone Name","code":"CODE","type":"receiving|storage|shipping|staging|cold_storage|returns","x":0,"y":0,"w":4,"h":3,"aisles":3,"racksPerAisle":4,"capacityPerSlot":100,"rationale":"Why here"}]

Rules: No overlaps. x+w<=${cols}, y+h<=${rows}. Code 1-6 uppercase unique. 5-8 zones. At least 1 cell gap between zones.`

      const rawContent = await callGemini(prompt, { temperature: 0.4, maxOutputTokens: 3000 })

      let text = rawContent.trim()
      const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (codeBlockMatch) text = codeBlockMatch[1].trim()
      const zonesData = JSON.parse(text)
      if (!Array.isArray(zonesData)) throw new Error("Expected array")

      validatedZones = validateAndClampZones(zonesData, cols, rows)
      if (validatedZones.length > 0) source = "ai"
    } catch (aiErr: any) {
      console.warn("AI layout generation failed, using algorithmic fallback:", aiErr?.message || aiErr)
    }

    if (validatedZones.length === 0) {
      validatedZones = generateAlgorithmicLayout(cols, rows)
      source = "algorithm"
    }

    res.json({
      warehouseId: warehouse._id.toString(),
      warehouseName: warehouse.name,
      gridDimensions: { cols, rows },
      zones: validatedZones,
      totalLocations: validatedZones.reduce((s, z) => s + z.aisles * z.racksPerAisle, 0),
      generatedAt: new Date().toISOString(),
      source,
    })
  } catch (error: any) {
    console.error("Generate layout error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// ──────────────────────────────────────────────────────────────
// 4. Apply generated layout (create zones + locations)
// ──────────────────────────────────────────────────────────────

router.post("/:warehouseId/apply-layout", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) { res.status(401).json({ error: "Unauthorized" }); return }

    const warehouse = await Warehouse.findOne({ _id: req.params.warehouseId, userId: req.user.id })
    if (!warehouse) { res.status(404).json({ error: "Warehouse not found" }); return }

    const { zones: zoneData, clearExisting } = req.body

    if (!Array.isArray(zoneData) || zoneData.length === 0) {
      res.status(400).json({ error: "zones array is required" }); return
    }

    if (clearExisting) {
      await Location.deleteMany({ warehouseId: warehouse._id, userId: req.user.id })
      await Zone.deleteMany({ warehouseId: warehouse._id, userId: req.user.id })
    }

    const createdZones: any[] = []
    let totalLocationsCreated = 0

    for (const z of zoneData) {
      const type = ZONE_TYPES.includes(z.type) ? z.type as ZoneType : "storage"

      const zone = new Zone({
        warehouseId: warehouse._id,
        userId: req.user.id,
        name: z.name,
        code: z.code,
        type,
        color: ZONE_TYPE_COLORS[type],
        x: z.x,
        y: z.y,
        w: z.w,
        h: z.h,
        aisles: z.aisles || 2,
        racksPerAisle: z.racksPerAisle || 3,
        capacityPerSlot: z.capacityPerSlot || 100,
      })

      await zone.save()

      const locDocs: any[] = []
      for (let a = 1; a <= zone.aisles; a++) {
        for (let r = 1; r <= zone.racksPerAisle; r++) {
          locDocs.push({
            warehouseId: warehouse._id,
            zoneId: zone._id,
            userId: req.user.id,
            code: `${zone.code}-A${String(a).padStart(2, "0")}-R${String(r).padStart(2, "0")}`,
            aisle: `A${String(a).padStart(2, "0")}`,
            rack: `R${String(r).padStart(2, "0")}`,
            maxCapacity: zone.capacityPerSlot,
            inventory: [],
            status: "active",
          })
        }
      }

      if (locDocs.length > 0) {
        await Location.insertMany(locDocs)
        totalLocationsCreated += locDocs.length
      }

      createdZones.push({
        id: zone._id.toString(),
        name: zone.name,
        code: zone.code,
        type: zone.type,
        locationsCreated: locDocs.length,
      })
    }

    res.status(201).json({
      message: `Layout applied: ${createdZones.length} zones, ${totalLocationsCreated} locations created`,
      zones: createdZones,
      totalLocationsCreated,
    })
  } catch (error: any) {
    console.error("Apply layout error:", error)
    if (error.code === 11000) {
      res.status(400).json({ error: "Duplicate zone code. Clear existing zones first or use unique codes." }); return
    }
    res.status(500).json({ error: "Internal server error" })
  }
})

export default router
