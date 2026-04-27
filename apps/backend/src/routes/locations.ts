import { Router, Response } from "express"
import { Zone, IZone, ZONE_TYPES, ZONE_TYPE_COLORS, ZoneType } from "../models/Zone"
import { Location, ILocation } from "../models/Location"
import { authenticate, AuthRequest } from "../middleware/auth"

const router = Router()
router.use(authenticate)

function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0")
}

function zoneToJson(z: InstanceType<typeof Zone>) {
  return {
    id: z._id.toString(),
    warehouseId: z.warehouseId.toString(),
    name: z.name,
    code: z.code,
    type: z.type,
    color: z.color,
    x: z.x,
    y: z.y,
    w: z.w,
    h: z.h,
    aisles: z.aisles,
    racksPerAisle: z.racksPerAisle,
    capacityPerSlot: z.capacityPerSlot,
    createdAt: z.createdAt,
    updatedAt: z.updatedAt,
  }
}

function locationToJson(l: InstanceType<typeof Location>) {
  const totalItems = (l.inventory || []).reduce((s, i) => s + i.count, 0)
  return {
    id: l._id.toString(),
    warehouseId: l.warehouseId.toString(),
    zoneId: l.zoneId.toString(),
    code: l.code,
    aisle: l.aisle,
    rack: l.rack,
    maxCapacity: l.maxCapacity,
    currentUtilization: totalItems,
    utilizationPercent: l.maxCapacity > 0 ? Math.round((totalItems / l.maxCapacity) * 100) : 0,
    inventory: (l.inventory || []).map((i) => ({ typeName: i.typeName, count: i.count })),
    status: l.status,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  }
}

// ---------- ZONES ----------

// GET /api/locations/zones?warehouseId=...
router.get("/zones", async (req: AuthRequest, res: Response) => {
  try {
    const { warehouseId } = req.query
    if (!warehouseId) {
      res.status(400).json({ error: "warehouseId query param is required" })
      return
    }
    const zones = await Zone.find({ warehouseId, userId: req.user!.id }).sort({ createdAt: 1 })
    const locationCounts = await Location.aggregate([
      { $match: { warehouseId: zones[0]?.warehouseId ?? null } },
      { $group: { _id: "$zoneId", count: { $sum: 1 }, totalItems: { $sum: { $sum: "$inventory.count" } } } },
    ])
    const countMap = new Map(locationCounts.map((c: any) => [c._id.toString(), { count: c.count, totalItems: c.totalItems }]))

    res.json({
      zones: zones.map((z) => {
        const stats = countMap.get(z._id.toString()) || { count: 0, totalItems: 0 }
        return { ...zoneToJson(z), locationCount: stats.count, totalItems: stats.totalItems }
      }),
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch zones" })
  }
})

// POST /api/locations/zones — create zone + auto-generate locations
router.post("/zones", async (req: AuthRequest, res: Response) => {
  try {
    const { warehouseId, name, code, type, x, y, w, h, aisles, racksPerAisle, capacityPerSlot } = req.body

    if (!warehouseId || !name || !code || !type) {
      res.status(400).json({ error: "warehouseId, name, code, and type are required" })
      return
    }

    if (!ZONE_TYPES.includes(type)) {
      res.status(400).json({ error: `type must be one of: ${ZONE_TYPES.join(", ")}` })
      return
    }

    // Check for overlapping zones
    const existing = await Zone.find({ warehouseId, userId: req.user!.id })
    const newRect = { x1: x, y1: y, x2: x + w - 1, y2: y + h - 1 }
    for (const ez of existing) {
      const ezRect = { x1: ez.x, y1: ez.y, x2: ez.x + ez.w - 1, y2: ez.y + ez.h - 1 }
      if (newRect.x1 <= ezRect.x2 && newRect.x2 >= ezRect.x1 && newRect.y1 <= ezRect.y2 && newRect.y2 >= ezRect.y1) {
        res.status(400).json({ error: `Zone overlaps with existing zone "${ez.name}"` })
        return
      }
    }

    const color = ZONE_TYPE_COLORS[type as ZoneType] || "#3b82f6"
    const zone = await Zone.create({
      warehouseId,
      userId: req.user!.id,
      name,
      code: code.toUpperCase(),
      type,
      color,
      x: x ?? 0,
      y: y ?? 0,
      w: w ?? 4,
      h: h ?? 3,
      aisles: aisles ?? 2,
      racksPerAisle: racksPerAisle ?? 4,
      capacityPerSlot: capacityPerSlot ?? 100,
    })

    // Auto-generate locations
    const numAisles = zone.aisles
    const numRacks = zone.racksPerAisle
    const locations = []
    for (let a = 1; a <= numAisles; a++) {
      for (let r = 1; r <= numRacks; r++) {
        const locCode = `${zone.code}-A${pad(a)}-R${pad(r)}`
        locations.push({
          warehouseId: zone.warehouseId,
          zoneId: zone._id,
          userId: req.user!.id,
          code: locCode,
          aisle: pad(a),
          rack: pad(r),
          maxCapacity: zone.capacityPerSlot,
          inventory: [],
          status: "active",
        })
      }
    }
    if (locations.length > 0) {
      await Location.insertMany(locations)
    }

    res.status(201).json({
      zone: { ...zoneToJson(zone), locationCount: locations.length, totalItems: 0 },
      locationsCreated: locations.length,
      message: `Zone "${name}" created with ${locations.length} locations`,
    })
  } catch (err: any) {
    if (err.code === 11000) {
      res.status(400).json({ error: "Zone code already exists for this warehouse" })
      return
    }
    res.status(500).json({ error: err.message || "Failed to create zone" })
  }
})

// GET /api/locations/zones/:id — zone details + locations
router.get("/zones/:id", async (req: AuthRequest, res: Response) => {
  try {
    const zone = await Zone.findOne({ _id: req.params.id, userId: req.user!.id })
    if (!zone) {
      res.status(404).json({ error: "Zone not found" })
      return
    }
    const locations = await Location.find({ zoneId: zone._id }).sort({ code: 1 })
    res.json({ zone: zoneToJson(zone), locations: locations.map(locationToJson) })
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch zone" })
  }
})

// PUT /api/locations/zones/:id — update zone
router.put("/zones/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { name, type, x, y, w, h } = req.body
    const zone = await Zone.findOne({ _id: req.params.id, userId: req.user!.id })
    if (!zone) {
      res.status(404).json({ error: "Zone not found" })
      return
    }

    // Check overlap if position changed
    if (x !== undefined || y !== undefined || w !== undefined || h !== undefined) {
      const nx = x ?? zone.x
      const ny = y ?? zone.y
      const nw = w ?? zone.w
      const nh = h ?? zone.h
      const newRect = { x1: nx, y1: ny, x2: nx + nw - 1, y2: ny + nh - 1 }
      const others = await Zone.find({ warehouseId: zone.warehouseId, userId: req.user!.id, _id: { $ne: zone._id } })
      for (const ez of others) {
        const ezRect = { x1: ez.x, y1: ez.y, x2: ez.x + ez.w - 1, y2: ez.y + ez.h - 1 }
        if (newRect.x1 <= ezRect.x2 && newRect.x2 >= ezRect.x1 && newRect.y1 <= ezRect.y2 && newRect.y2 >= ezRect.y1) {
          res.status(400).json({ error: `Zone would overlap with "${ez.name}"` })
          return
        }
      }
      zone.x = nx
      zone.y = ny
      zone.w = nw
      zone.h = nh
    }

    if (name) zone.name = name
    if (type && ZONE_TYPES.includes(type)) {
      zone.type = type
      zone.color = ZONE_TYPE_COLORS[type as ZoneType] || zone.color
    }

    await zone.save()
    res.json({ zone: zoneToJson(zone), message: "Zone updated" })
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update zone" })
  }
})

// DELETE /api/locations/zones/:id — delete zone + all its locations
router.delete("/zones/:id", async (req: AuthRequest, res: Response) => {
  try {
    const zone = await Zone.findOne({ _id: req.params.id, userId: req.user!.id })
    if (!zone) {
      res.status(404).json({ error: "Zone not found" })
      return
    }
    await Location.deleteMany({ zoneId: zone._id })
    await zone.deleteOne()
    res.json({ message: `Zone "${zone.name}" and all its locations deleted` })
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete zone" })
  }
})

// ---------- LOCATIONS ----------

// GET /api/locations?warehouseId=...&zoneId=...
router.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const { warehouseId, zoneId } = req.query
    const filter: any = { userId: req.user!.id }
    if (warehouseId) filter.warehouseId = warehouseId
    if (zoneId) filter.zoneId = zoneId
    const locations = await Location.find(filter).sort({ code: 1 })
    res.json({ locations: locations.map(locationToJson), total: locations.length })
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch locations" })
  }
})

// GET /api/locations/:id
router.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const loc = await Location.findOne({ _id: req.params.id, userId: req.user!.id })
    if (!loc) {
      res.status(404).json({ error: "Location not found" })
      return
    }
    res.json({ location: locationToJson(loc) })
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch location" })
  }
})

// PUT /api/locations/:id — update location
router.put("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { maxCapacity, status } = req.body
    const loc = await Location.findOne({ _id: req.params.id, userId: req.user!.id })
    if (!loc) {
      res.status(404).json({ error: "Location not found" })
      return
    }
    if (maxCapacity !== undefined) loc.maxCapacity = maxCapacity
    if (status !== undefined) loc.status = status
    await loc.save()
    res.json({ location: locationToJson(loc), message: "Location updated" })
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update location" })
  }
})

// PATCH /api/locations/:id/inventory — set inventory at location
router.patch("/:id/inventory", async (req: AuthRequest, res: Response) => {
  try {
    const { inventory } = req.body
    if (!Array.isArray(inventory)) {
      res.status(400).json({ error: "inventory must be an array of { typeName, count }" })
      return
    }
    const loc = await Location.findOne({ _id: req.params.id, userId: req.user!.id })
    if (!loc) {
      res.status(404).json({ error: "Location not found" })
      return
    }
    if (loc.status === "inactive") {
      res.status(400).json({ error: "Cannot assign inventory to an inactive location" })
      return
    }

    const totalCount = inventory.reduce((s: number, i: any) => s + (i.count || 0), 0)
    if (totalCount > loc.maxCapacity) {
      res.status(400).json({
        error: `Total items (${totalCount}) exceeds location capacity (${loc.maxCapacity})`,
      })
      return
    }

    loc.inventory = inventory.map((i: any) => ({
      typeName: String(i.typeName).trim(),
      count: Math.max(0, Number(i.count) || 0),
    }))
    await loc.save()
    res.json({ location: locationToJson(loc), message: "Location inventory updated" })
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update inventory" })
  }
})

// DELETE /api/locations/:id
router.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const loc = await Location.findOne({ _id: req.params.id, userId: req.user!.id })
    if (!loc) {
      res.status(404).json({ error: "Location not found" })
      return
    }
    await loc.deleteOne()
    res.json({ message: `Location ${loc.code} deleted` })
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to delete location" })
  }
})

// GET /api/locations/warehouse/:warehouseId/summary — warehouse location utilization summary
router.get("/warehouse/:warehouseId/summary", async (req: AuthRequest, res: Response) => {
  try {
    const { warehouseId } = req.params
    const zones = await Zone.find({ warehouseId, userId: req.user!.id })
    const locations = await Location.find({ warehouseId, userId: req.user!.id })

    const totalLocations = locations.length
    const activeLocations = locations.filter((l) => l.status === "active").length
    const totalCapacity = locations.reduce((s, l) => s + l.maxCapacity, 0)
    const totalUtilized = locations.reduce((s, l) => s + l.inventory.reduce((si, i) => si + i.count, 0), 0)
    const utilizationPercent = totalCapacity > 0 ? Math.round((totalUtilized / totalCapacity) * 100) : 0

    res.json({
      summary: {
        totalZones: zones.length,
        totalLocations,
        activeLocations,
        totalCapacity,
        totalUtilized,
        utilizationPercent,
      },
    })
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch summary" })
  }
})

export default router
