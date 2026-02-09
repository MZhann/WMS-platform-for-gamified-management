import { Router, Response } from "express"
import multer from "multer"
import { parse } from "csv-parse/sync"
import { GoogleGenAI } from "@google/genai"
import { Warehouse, IWarehouseInventoryItem } from "../models/Warehouse"
import { WarehouseFlow, IWarehouseFlowItem, WarehouseFlowOperation } from "../models/WarehouseFlow"
import { authenticate, AuthRequest } from "../middleware/auth"

const router = Router()

// Multer for CSV upload: memory storage, 1MB limit, single file field "file"
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 },
})

// All warehouse routes require authentication
router.use(authenticate)

function toListResponse(w: InstanceType<typeof Warehouse>) {
  const inventory = w.inventory || []
  const totalItems = inventory.reduce((sum, i) => sum + i.count, 0)
  const typeCount = inventory.length
  return {
    id: w._id.toString(),
    name: w.name,
    description: w.description,
    address: w.address,
    coordinates: [w.coordinates.lng, w.coordinates.lat] as [number, number],
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
    totalItems,
    typeCount,
  }
}

function toDetailResponse(w: InstanceType<typeof Warehouse>) {
  return {
    ...toListResponse(w),
    inventory: (w.inventory || []).map((i) => ({ typeName: i.typeName, count: i.count })),
  }
}

type PeriodBucket = {
  period: string
  periodLabel: string
  incomingCount: number
  outgoingCount: number
  incomingValue: number
  outgoingValue: number
}

export type WarehouseAnalyticsData = {
  summary: {
    totalItems: number
    typeCount: number
    totalIncomingValue: number
    totalOutgoingValue: number
    totalIncomingCount: number
    totalOutgoingCount: number
  }
  inventoryByType: { typeName: string; count: number }[]
  flowTimeSeries: PeriodBucket[]
  flowByType: { typeName: string; loaded: number; unloaded: number }[]
}

async function getWarehouseAnalyticsData(
  warehouse: InstanceType<typeof Warehouse>,
  period: string,
  periodsNum: number
): Promise<WarehouseAnalyticsData> {
  const now = new Date()
  const bucketMs: Record<string, number> = {
    day: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 30 * 24 * 60 * 60 * 1000,
  }
  const periodMs = bucketMs[period] ?? bucketMs.month
  const fromDate = new Date(now.getTime() - periodMs * periodsNum)

  const flows = await WarehouseFlow.find({
    warehouseId: warehouse._id,
    createdAt: { $gte: fromDate },
  })
    .sort({ createdAt: 1 })
    .lean()

  const inventory = warehouse.inventory || []
  const totalItems = inventory.reduce((sum, i) => sum + i.count, 0)
  const inventoryByType = inventory.map((i) => ({ typeName: i.typeName, count: i.count }))

  const periodBuckets = new Map<string, PeriodBucket>()
  const typeBuckets = new Map<string, { loaded: number; unloaded: number }>()

  function getPeriodKey(d: Date): string {
    if (period === "day") {
      return d.toISOString().slice(0, 10)
    }
    if (period === "week") {
      const t = new Date(d)
      const day = t.getDay()
      const diff = t.getDate() - day + (day === 0 ? -6 : 1)
      t.setDate(diff)
      return t.toISOString().slice(0, 10)
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
  }

  function getPeriodLabel(key: string): string {
    if (period === "day") {
      const d = new Date(key)
      return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })
    }
    if (period === "week") {
      const d = new Date(key)
      return `W${Math.ceil(d.getDate() / 7)} ${d.toLocaleDateString("en-US", { month: "short" })}`
    }
    const [y, m] = key.split("-")
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    return `${monthNames[parseInt(m, 10) - 1]} ${y}`
  }

  type FlowRow = { operation: WarehouseFlowOperation; items: IWarehouseFlowItem[]; createdAt: Date }
  for (const f of flows as FlowRow[]) {
    const key = getPeriodKey(f.createdAt)
    if (!periodBuckets.has(key)) {
      periodBuckets.set(key, {
        period: key,
        periodLabel: getPeriodLabel(key),
        incomingCount: 0,
        outgoingCount: 0,
        incomingValue: 0,
        outgoingValue: 0,
      })
    }
    const bucket = periodBuckets.get(key)!
    for (const item of f.items || []) {
      const value = item.count * item.unitPrice
      if (f.operation === "load") {
        bucket.incomingCount += item.count
        bucket.incomingValue += value
        const t = typeBuckets.get(item.typeName) || { loaded: 0, unloaded: 0 }
        t.loaded += item.count
        typeBuckets.set(item.typeName, t)
      } else {
        bucket.outgoingCount += item.count
        bucket.outgoingValue += value
        const t = typeBuckets.get(item.typeName) || { loaded: 0, unloaded: 0 }
        t.unloaded += item.count
        typeBuckets.set(item.typeName, t)
      }
    }
  }

  const flowTimeSeries = Array.from(periodBuckets.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, v]) => v)

  const flowByType = Array.from(typeBuckets.entries())
    .map(([typeName, v]) => ({ typeName, loaded: v.loaded, unloaded: v.unloaded }))
    .sort((a, b) => b.loaded + b.unloaded - (a.loaded + a.unloaded))
    .slice(0, 10)

  const summary = {
    totalItems,
    typeCount: inventory.length,
    totalIncomingValue: flowTimeSeries.reduce((s, x) => s + x.incomingValue, 0),
    totalOutgoingValue: flowTimeSeries.reduce((s, x) => s + x.outgoingValue, 0),
    totalIncomingCount: flowTimeSeries.reduce((s, x) => s + x.incomingCount, 0),
    totalOutgoingCount: flowTimeSeries.reduce((s, x) => s + x.outgoingCount, 0),
  }

  return { summary, inventoryByType, flowTimeSeries, flowByType }
}

// Get all warehouses for the authenticated user
router.get("/", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const warehouses = await Warehouse.find({ userId: req.user.id }).sort({
      createdAt: -1,
    })

    res.json({
      warehouses: warehouses.map((w) => toListResponse(w)),
    })
  } catch (error: any) {
    console.error("Get warehouses error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Flow routes must be before /:id so that /:id/flow is matched correctly
function toFlowResponse(f: InstanceType<typeof WarehouseFlow>) {
  return {
    id: f._id.toString(),
    warehouseId: f.warehouseId.toString(),
    operation: f.operation,
    items: (f.items || []).map((i) => ({ typeName: i.typeName, count: i.count, unitPrice: i.unitPrice })),
    performedBy: f.performedBy?.toString(),
    createdAt: f.createdAt,
  }
}

// Get flow history for a warehouse
router.get("/:id/flow", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const warehouse = await Warehouse.findOne({
      _id: req.params.id,
      userId: req.user.id,
    })
    if (!warehouse) {
      res.status(404).json({ error: "Warehouse not found" })
      return
    }

    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 20))
    const skip = (page - 1) * limit

    const [flows, total] = await Promise.all([
      WarehouseFlow.find({ warehouseId: warehouse._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      WarehouseFlow.countDocuments({ warehouseId: warehouse._id }),
    ])

    res.json({
      flows: flows.map((f) => toFlowResponse(f as InstanceType<typeof WarehouseFlow>)),
      total,
      page,
      limit,
    })
  } catch (error: any) {
    console.error("Get flow error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Create a flow operation (load or unload)
router.post("/:id/flow", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const { operation, items: rawItems } = req.body

    if (!operation || (operation !== "load" && operation !== "unload")) {
      res.status(400).json({ error: "operation must be 'load' or 'unload'" })
      return
    }

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      res.status(400).json({ error: "items must be a non-empty array" })
      return
    }

    const items: IWarehouseFlowItem[] = []
    for (let i = 0; i < rawItems.length; i++) {
      const item = rawItems[i]
      const typeName = item?.typeName != null ? String(item.typeName).trim() : ""
      const count = typeof item?.count === "number" ? item.count : parseInt(String(item.count), 10)
      const unitPrice =
        typeof item?.unitPrice === "number" ? item.unitPrice : parseFloat(String(item?.unitPrice ?? ""))

      if (!typeName) {
        res.status(400).json({ error: `Row ${i + 1}: typeName is required` })
        return
      }
      if (!Number.isInteger(count) || count < 0) {
        res.status(400).json({ error: `Row ${i + 1}: count must be a non-negative integer` })
        return
      }
      if (typeof unitPrice !== "number" || Number.isNaN(unitPrice) || unitPrice < 0) {
        res.status(400).json({ error: `Row ${i + 1}: unitPrice is required and must be a non-negative number` })
        return
      }
      items.push({ typeName, count, unitPrice })
    }

    const warehouse = await Warehouse.findOne({
      _id: req.params.id,
      userId: req.user.id,
    })
    if (!warehouse) {
      res.status(404).json({ error: "Warehouse not found" })
      return
    }

    const inventoryMap = new Map<string, number>()
    for (const i of warehouse.inventory || []) {
      inventoryMap.set(i.typeName, i.count)
    }

    if (operation === "unload") {
      for (const item of items) {
        const current = inventoryMap.get(item.typeName) ?? 0
        if (current < item.count) {
          res.status(400).json({
            error: `Insufficient quantity for type "${item.typeName}": have ${current}, requested ${item.count}`,
          })
          return
        }
      }
    }

    if (operation === "load") {
      for (const item of items) {
        inventoryMap.set(item.typeName, (inventoryMap.get(item.typeName) ?? 0) + item.count)
      }
    } else {
      for (const item of items) {
        const next = (inventoryMap.get(item.typeName) ?? 0) - item.count
        if (next <= 0) inventoryMap.delete(item.typeName)
        else inventoryMap.set(item.typeName, next)
      }
    }

    warehouse.inventory = Array.from(inventoryMap.entries()).map(([typeName, count]) => ({
      typeName,
      count,
    }))
    await warehouse.save()

    const flow = new WarehouseFlow({
      warehouseId: warehouse._id,
      operation: operation as WarehouseFlowOperation,
      items,
      performedBy: req.user.id,
    })
    await flow.save()

    res.status(201).json({
      message: operation === "load" ? "Load operation recorded" : "Unload operation recorded",
      warehouse: toDetailResponse(warehouse),
      flow: toFlowResponse(flow),
    })
  } catch (error: any) {
    console.error("Post flow error:", error)
    if (error.name === "ValidationError") {
      res.status(400).json({ error: error.message })
      return
    }
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get warehouse analytics (inventory + flow aggregates)
router.get("/:id/analytics", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const warehouse = await Warehouse.findOne({
      _id: req.params.id,
      userId: req.user.id,
    })
    if (!warehouse) {
      res.status(404).json({ error: "Warehouse not found" })
      return
    }

    const period = (req.query.period as string) || "month"
    const periodsNum = Math.min(24, Math.max(1, parseInt(String(req.query.periods), 10) || 6))
    const data = await getWarehouseAnalyticsData(warehouse, period, periodsNum)
    res.json(data)
  } catch (error: any) {
    console.error("Get analytics error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// AI advice response shape for frontend
type AiAdviceTable = { title: string; headers: string[]; rows: string[][] }
type AiAdviceChartSeries = { name: string; values: number[] }
type AiAdviceChartSuggestion = {
  type: "bar" | "line"
  title: string
  data: { labels: string[]; series: AiAdviceChartSeries[] }
}
type AiAdviceParsed = {
  summary: string
  recommendations: string[]
  tables: AiAdviceTable[]
  chartSuggestions: AiAdviceChartSuggestion[]
}

function parseAiAdviceResponse(rawContent: string): AiAdviceParsed {
  const fallback: AiAdviceParsed = {
    summary: rawContent?.trim() || "No response from AI.",
    recommendations: [],
    tables: [],
    chartSuggestions: [],
  }
  let text = rawContent?.trim() || ""
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlockMatch) {
    text = codeBlockMatch[1].trim()
  }
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>
    const summary = typeof parsed.summary === "string" ? parsed.summary : fallback.summary
    const recommendations = Array.isArray(parsed.recommendations)
      ? (parsed.recommendations as unknown[]).filter((r): r is string => typeof r === "string")
      : []
    const tables: AiAdviceTable[] = []
    if (Array.isArray(parsed.tables)) {
      for (const t of parsed.tables as Record<string, unknown>[]) {
        if (t && typeof t.title === "string" && Array.isArray(t.headers) && Array.isArray(t.rows)) {
          tables.push({
            title: t.title,
            headers: (t.headers as unknown[]).map(String),
            rows: (t.rows as unknown[][]).map((row) => (Array.isArray(row) ? row.map(String) : [])),
          })
        }
      }
    }
    const chartSuggestions: AiAdviceChartSuggestion[] = []
    if (Array.isArray(parsed.chartSuggestions)) {
      for (const c of parsed.chartSuggestions as Record<string, unknown>[]) {
        if (
          c &&
          (c.type === "bar" || c.type === "line") &&
          typeof c.title === "string" &&
          c.data &&
          typeof c.data === "object" &&
          Array.isArray((c.data as { labels?: unknown }).labels) &&
          Array.isArray((c.data as { series?: unknown }).series)
        ) {
          const data = c.data as { labels: unknown[]; series: { name: string; values: number[] }[] }
          chartSuggestions.push({
            type: c.type,
            title: c.title,
            data: {
              labels: data.labels.map(String),
              series: data.series.map((s) => ({
                name: typeof s.name === "string" ? s.name : "Series",
                values: Array.isArray(s.values) ? s.values.map(Number).filter((n) => !Number.isNaN(n)) : [],
              })),
            },
          })
        }
      }
    }
    return { summary, recommendations, tables, chartSuggestions }
  } catch {
    return fallback
  }
}

// Get AI-generated buy/sell advice for a warehouse
router.get("/:id/ai-advice", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const warehouse = await Warehouse.findOne({
      _id: req.params.id,
      userId: req.user.id,
    })
    if (!warehouse) {
      res.status(404).json({ error: "Warehouse not found" })
      return
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      res.status(503).json({ error: "AI advice is not configured (missing GEMINI_API_KEY)" })
      return
    }

    const data = await getWarehouseAnalyticsData(warehouse, "month", 6)
    const now = new Date()
    const context = {
      warehouse: {
        name: warehouse.name,
        address: warehouse.address,
      },
      currentDate: now.toISOString().slice(0, 10),
      season: now.getMonth() + 1,
      summary: data.summary,
      flowTimeSeries: data.flowTimeSeries,
      inventoryByType: data.inventoryByType,
      flowByType: data.flowByType,
    }

    const systemPrompt = `You are an expert in warehouse and inventory management. Your task is to give short, actionable advice on what to BUY (restock) and what to SELL or REDUCE, based on the provided warehouse data and current date/season. Tie your reasoning to the numbers.`

    const userPrompt = `Analyze this warehouse and respond with a single JSON object only (no markdown, no other text). Use this exact structure:
{
  "summary": "1-2 sentence overview of the situation and main recommendation",
  "recommendations": ["bullet 1", "bullet 2", "..."],
  "tables": [{ "title": "optional table title", "headers": ["Col1", "Col2"], "rows": [["a","b"], ["c","d"]] }],
  "chartSuggestions": [{ "type": "bar" or "line", "title": "Chart title", "data": { "labels": ["A","B","C"], "series": [{ "name": "Series name", "values": [1,2,3] }] } }]
}
You may leave "tables" and "chartSuggestions" as empty arrays [] if you do not need them.

Warehouse and analytics data (JSON):
${JSON.stringify(context, null, 2)}`

    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: `${systemPrompt}\n\n${userPrompt}`,
      config: {
        temperature: 0.3,
        maxOutputTokens: 2000,
      },
    })

    const rawContent = response.text ?? ""
    const parsed = parseAiAdviceResponse(rawContent)
    res.json(parsed)
  } catch (error: any) {
    console.error("AI advice error:", error)
    if (error?.status === 429) {
      res.status(503).json({ error: "AI rate limit exceeded. Try again later." })
      return
    }
    res.status(500).json({ error: "Internal server error" })
  }
})

// Get a single warehouse by ID
router.get("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const warehouse = await Warehouse.findOne({
      _id: req.params.id,
      userId: req.user.id,
    })

    if (!warehouse) {
      res.status(404).json({ error: "Warehouse not found" })
      return
    }

    res.json({
      warehouse: toDetailResponse(warehouse),
    })
  } catch (error: any) {
    console.error("Get warehouse error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Create a new warehouse
router.post("/", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const { name, description, address, coordinates } = req.body

    // Validation
    if (!name || !address || !coordinates) {
      res.status(400).json({
        error: "Name, address, and coordinates are required",
      })
      return
    }

    if (!Array.isArray(coordinates) || coordinates.length !== 2) {
      res.status(400).json({
        error: "Coordinates must be an array of [lng, lat]",
      })
      return
    }

    const [lng, lat] = coordinates

    if (typeof lng !== "number" || typeof lat !== "number") {
      res.status(400).json({
        error: "Coordinates must be numbers",
      })
      return
    }

    // Create warehouse
    const warehouse = new Warehouse({
      name,
      description: description || "",
      address,
      coordinates: { lat, lng },
      userId: req.user.id,
    })

    await warehouse.save()

    res.status(201).json({
      message: "Warehouse created successfully",
      warehouse: {
        id: warehouse._id.toString(),
        name: warehouse.name,
        description: warehouse.description,
        address: warehouse.address,
        coordinates: [warehouse.coordinates.lng, warehouse.coordinates.lat] as [
          number,
          number
        ],
        createdAt: warehouse.createdAt,
        updatedAt: warehouse.updatedAt,
      },
    })
  } catch (error: any) {
    console.error("Create warehouse error:", error)
    if (error.name === "ValidationError") {
      res.status(400).json({ error: error.message })
      return
    }
    res.status(500).json({ error: "Internal server error" })
  }
})

// Update a warehouse
router.put("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const { name, description, address, coordinates } = req.body

    const warehouse = await Warehouse.findOne({
      _id: req.params.id,
      userId: req.user.id,
    })

    if (!warehouse) {
      res.status(404).json({ error: "Warehouse not found" })
      return
    }

    // Update fields
    if (name !== undefined) warehouse.name = name
    if (description !== undefined) warehouse.description = description
    if (address !== undefined) warehouse.address = address
    if (coordinates !== undefined) {
      if (!Array.isArray(coordinates) || coordinates.length !== 2) {
        res.status(400).json({
          error: "Coordinates must be an array of [lng, lat]",
        })
        return
      }
      const [lng, lat] = coordinates
      warehouse.coordinates = { lat, lng }
    }

    await warehouse.save()

    res.json({
      message: "Warehouse updated successfully",
      warehouse: {
        id: warehouse._id.toString(),
        name: warehouse.name,
        description: warehouse.description,
        address: warehouse.address,
        coordinates: [warehouse.coordinates.lng, warehouse.coordinates.lat] as [
          number,
          number
        ],
        createdAt: warehouse.createdAt,
        updatedAt: warehouse.updatedAt,
      },
    })
  } catch (error: any) {
    console.error("Update warehouse error:", error)
    if (error.name === "ValidationError") {
      res.status(400).json({ error: error.message })
      return
    }
    res.status(500).json({ error: "Internal server error" })
  }
})

// Delete a warehouse
router.delete("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const warehouse = await Warehouse.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.id,
    })

    if (!warehouse) {
      res.status(404).json({ error: "Warehouse not found" })
      return
    }

    res.json({ message: "Warehouse deleted successfully" })
  } catch (error: any) {
    console.error("Delete warehouse error:", error)
    res.status(500).json({ error: "Internal server error" })
  }
})

// Update warehouse inventory
router.patch("/:id/inventory", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: "Unauthorized" })
      return
    }

    const { inventory: rawInventory } = req.body
    if (!Array.isArray(rawInventory)) {
      res.status(400).json({ error: "inventory must be an array" })
      return
    }

    const inventory: IWarehouseInventoryItem[] = []
    for (let i = 0; i < rawInventory.length; i++) {
      const item = rawInventory[i]
      const typeName = item?.typeName != null ? String(item.typeName).trim() : ""
      const count = typeof item?.count === "number" ? item.count : parseInt(String(item.count), 10)
      if (!typeName) {
        res.status(400).json({ error: `Row ${i + 1}: typeName is required` })
        return
      }
      if (!Number.isInteger(count) || count < 0) {
        res.status(400).json({ error: `Row ${i + 1}: count must be a non-negative integer` })
        return
      }
      inventory.push({ typeName, count })
    }

    const warehouse = await Warehouse.findOne({
      _id: req.params.id,
      userId: req.user.id,
    })

    if (!warehouse) {
      res.status(404).json({ error: "Warehouse not found" })
      return
    }

    warehouse.inventory = inventory
    await warehouse.save()

    res.json({
      message: "Inventory updated successfully",
      warehouse: toDetailResponse(warehouse),
    })
  } catch (error: any) {
    console.error("Update inventory error:", error)
    if (error.name === "ValidationError") {
      res.status(400).json({ error: error.message })
      return
    }
    res.status(500).json({ error: "Internal server error" })
  }
})

// Upload CSV to merge into warehouse inventory
router.post(
  "/:id/inventory/upload",
  upload.single("file"),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" })
        return
      }

      const file = req.file
      if (!file || !file.buffer) {
        res.status(400).json({ error: "No file uploaded" })
        return
      }

      const warehouse = await Warehouse.findOne({
        _id: req.params.id,
        userId: req.user.id,
      })

      if (!warehouse) {
        res.status(404).json({ error: "Warehouse not found" })
        return
      }

      const content = file.buffer.toString("utf-8").trim()
      if (!content) {
        res.status(400).json({ error: "CSV file is empty" })
        return
      }

      let records: Record<string, string>[]
      try {
        records = parse(content, {
          columns: true,
          skip_empty_lines: true,
          trim: true,
          relax_column_count: true,
          bom: true,
        })
      } catch (parseError: any) {
        res.status(400).json({ error: "Invalid CSV: " + (parseError?.message || "parse failed") })
        return
      }

      if (records.length === 0) {
        res.json({
          message: "No rows to import",
          warehouse: toDetailResponse(warehouse),
        })
        return
      }

      const headerKeys = Object.keys(records[0]).map((k) => k.toLowerCase().trim())
      const typeCol = headerKeys.find((k) => k === "type" || k === "typename")
      const countCol = headerKeys.find((k) => k === "count" || k === "quantity")
      const typeKey = typeCol ? Object.keys(records[0]).find((k) => k.toLowerCase().trim() === typeCol)! : null
      const countKey = countCol ? Object.keys(records[0]).find((k) => k.toLowerCase().trim() === countCol)! : null

      if (!typeKey || !countKey) {
        res.status(400).json({
          error: "CSV must have columns for type (or typeName) and count (or quantity)",
        })
        return
      }

      const existingMap = new Map<string, number>()
      for (const item of warehouse.inventory || []) {
        existingMap.set(item.typeName, item.count)
      }

      for (let i = 0; i < records.length; i++) {
        const row = records[i]
        const typeName = String(row[typeKey] ?? "").trim()
        const countRaw = row[countKey]
        const count = parseInt(String(countRaw).trim(), 10)
        if (!typeName) continue
        if (!Number.isInteger(count) || count < 0) {
          res.status(400).json({
            error: `Row ${i + 2}: count must be a non-negative integer`,
          })
          return
        }
        existingMap.set(typeName, (existingMap.get(typeName) ?? 0) + count)
      }

      warehouse.inventory = Array.from(existingMap.entries()).map(([typeName, count]) => ({
        typeName,
        count,
      }))
      await warehouse.save()

      res.json({
        message: "CSV imported successfully",
        warehouse: toDetailResponse(warehouse),
      })
    } catch (error: any) {
      console.error("Upload inventory CSV error:", error)
      res.status(500).json({ error: "Internal server error" })
    }
  }
)

export default router
