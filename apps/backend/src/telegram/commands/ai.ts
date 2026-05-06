import { Telegraf, Markup } from "telegraf"
import { BotContext } from "../types"
import { Warehouse } from "../../models/Warehouse"
import { WarehouseFlow, IWarehouseFlowItem, WarehouseFlowOperation } from "../../models/WarehouseFlow"
import { Zone } from "../../models/Zone"
import { Location } from "../../models/Location"
import { h, bold, HTML } from "../format"
import { callGemini } from "../../utils/gemini"

// In-memory cache for putaway item names keyed by chatId.
// Telegram callback data is limited to 64 bytes, so we can't embed the
// full typeName. Instead we store it here and reference it by chatId.
const putawayCache = new Map<number, string>()

// Telegram messages cap at 4096 chars. Keep AI text well below that.
const MAX_AI_CHARS = 1500

function trimAi(text: string): string {
  const t = text.trim()
  if (t.length <= MAX_AI_CHARS) return t
  return t.slice(0, MAX_AI_CHARS - 1).trimEnd() + "…"
}

async function tryGeminiText(
  prompt: string,
  config: { temperature?: number; maxOutputTokens?: number } = {},
): Promise<string | null> {
  try {
    const raw = await callGemini(prompt, {
      temperature: config.temperature ?? 0.4,
      maxOutputTokens: config.maxOutputTokens ?? 600,
    })
    const text = raw.trim()
    return text.length > 0 ? text : null
  } catch (err: any) {
    console.warn("Telegram AI call failed:", err?.message || err)
    return null
  }
}

export function registerAiCommands(bot: Telegraf<BotContext>) {
  // ── /forecast ─────────────────────────────────────────────
  bot.command("forecast", async (ctx) => {
    if (!ctx.wmsUser) {
      await ctx.reply("Please log in first. Use /login <email> <password>")
      return
    }

    const warehouses = await Warehouse.find({ userId: ctx.wmsUser.id })
    if (warehouses.length === 0) { await ctx.reply("You have no warehouses."); return }

    const buttons = warehouses.map((w) => Markup.button.callback(w.name, `ai:fc:${w._id}`))
    const rows: ReturnType<typeof Markup.button.callback>[][] = []
    for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2))

    await ctx.reply("📊 Select warehouse for demand forecast:", Markup.inlineKeyboard(rows))
  })

  bot.action(/^ai:fc:(.+)$/, async (ctx) => {
    if (!ctx.wmsUser) { await ctx.answerCbQuery("Not logged in"); return }

    const warehouseId = ctx.match[1]
    await ctx.answerCbQuery("Generating forecast...")

    const warehouse = await Warehouse.findOne({ _id: warehouseId, userId: ctx.wmsUser.id })
    if (!warehouse) { await ctx.editMessageText("Warehouse not found."); return }

    const forecastDays = 30
    const historyDays = 90
    const fromDate = new Date(Date.now() - historyDays * 24 * 60 * 60 * 1000)

    const flows = await WarehouseFlow.find({
      warehouseId: warehouse._id,
      createdAt: { $gte: fromDate },
    }).sort({ createdAt: 1 }).lean()

    const typeStats = new Map<string, { loaded: number; unloaded: number; stock: number }>()

    type FlowRow = { operation: WarehouseFlowOperation; items: IWarehouseFlowItem[] }
    for (const f of flows as FlowRow[]) {
      for (const item of f.items) {
        const s = typeStats.get(item.typeName) || { loaded: 0, unloaded: 0, stock: 0 }
        if (f.operation === "load") s.loaded += item.count
        else s.unloaded += item.count
        typeStats.set(item.typeName, s)
      }
    }

    for (const inv of warehouse.inventory || []) {
      const s = typeStats.get(inv.typeName) || { loaded: 0, unloaded: 0, stock: 0 }
      s.stock = inv.count
      typeStats.set(inv.typeName, s)
    }

    const items = Array.from(typeStats.entries())
      .map(([typeName, stats]) => {
        const avgDailyDemand = stats.unloaded / historyDays
        const daysUntilStockout = avgDailyDemand > 0 ? Math.round(stats.stock / avgDailyDemand) : null
        let risk = "low"
        if (daysUntilStockout !== null && daysUntilStockout <= 7) risk = "critical"
        else if (daysUntilStockout !== null && daysUntilStockout <= 14) risk = "high"
        else if (avgDailyDemand > (stats.loaded / historyDays) * 1.5) risk = "medium"
        return { typeName, ...stats, avgDailyDemand, daysUntilStockout, risk }
      })
      .sort((a, b) => {
        const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
        return (order[a.risk] ?? 3) - (order[b.risk] ?? 3) || b.avgDailyDemand - a.avgDailyDemand
      })

    const riskEmoji: Record<string, string> = { critical: "🔴", high: "🟠", medium: "🟡", low: "🟢" }
    const critCount = items.filter((i) => i.risk === "critical").length
    const highCount = items.filter((i) => i.risk === "high").length

    const topItems = items.slice(0, 10).map((i) => {
      const days = i.daysUntilStockout !== null ? `~${i.daysUntilStockout}d supply` : "stable"
      return `${riskEmoji[i.risk]} ${h(i.typeName)}\n   Stock: ${i.stock} | Demand: ${i.avgDailyDemand.toFixed(1)}/day | ${days}`
    })

    // ── Gemini AI narrative on top of the statistics ──
    const aiContext = {
      warehouse: warehouse.name,
      forecastDays,
      historyDays,
      summary: { totalProducts: items.length, critical: critCount, high: highCount },
      topItems: items.slice(0, 12).map((i) => ({
        typeName: i.typeName,
        stock: i.stock,
        avgDailyDemand: Math.round(i.avgDailyDemand * 100) / 100,
        daysUntilStockout: i.daysUntilStockout,
        risk: i.risk,
      })),
    }

    const aiPrompt = `You are a warehouse demand forecasting expert. Based on the data, write a SHORT (3-5 sentences, max 600 chars) plain-text summary for a warehouse manager. Highlight the most urgent reorder needs, any overstock concerns, and one concrete next-step recommendation. No markdown, no JSON, no headers — just plain prose. Use simple Telegram-friendly text.

Data:
${JSON.stringify(aiContext, null, 2)}`

    const aiText = await tryGeminiText(aiPrompt, { temperature: 0.4, maxOutputTokens: 400 })

    const lines = [
      `📊 ${bold("Demand Forecast - " + warehouse.name)}`,
      `Period: ${forecastDays} day forecast, ${historyDays} day history`,
      "",
      `🔴 Critical: ${critCount} | 🟠 High: ${highCount} | Total: ${items.length} products`,
    ]

    if (aiText) {
      lines.push("")
      lines.push(`🤖 ${bold("AI summary")}`)
      lines.push(h(trimAi(aiText)))
    }

    lines.push("")
    lines.push(bold("Top items by risk:"))
    lines.push(...topItems)

    await ctx.editMessageText(lines.join("\n"), HTML)
  })

  // ── /advice ───────────────────────────────────────────────
  bot.command("advice", async (ctx) => {
    if (!ctx.wmsUser) {
      await ctx.reply("Please log in first. Use /login <email> <password>")
      return
    }

    const warehouses = await Warehouse.find({ userId: ctx.wmsUser.id })
    if (warehouses.length === 0) { await ctx.reply("You have no warehouses."); return }

    const buttons = warehouses.map((w) => Markup.button.callback(w.name, `ai:adv:${w._id}`))
    const rows: ReturnType<typeof Markup.button.callback>[][] = []
    for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2))

    await ctx.reply("💡 Select warehouse for AI advice:", Markup.inlineKeyboard(rows))
  })

  bot.action(/^ai:adv:(.+)$/, async (ctx) => {
    if (!ctx.wmsUser) { await ctx.answerCbQuery("Not logged in"); return }

    const warehouseId = ctx.match[1]
    await ctx.answerCbQuery("Generating advice...")

    try {
      const warehouse = await Warehouse.findOne({ _id: warehouseId, userId: ctx.wmsUser.id })
      if (!warehouse) { await ctx.editMessageText("Warehouse not found."); return }

      const inventory = warehouse.inventory || []
      const totalItems = inventory.reduce((s, i) => s + i.count, 0)

      const flows = await WarehouseFlow.find({
        warehouseId: warehouse._id,
        createdAt: { $gte: new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000) },
      }).lean()

      const flowByType = new Map<string, { loaded: number; unloaded: number; inValue: number; outValue: number }>()
      let totalInValue = 0
      let totalOutValue = 0

      type FlowRow = { operation: WarehouseFlowOperation; items: IWarehouseFlowItem[] }
      for (const f of flows as FlowRow[]) {
        for (const item of f.items) {
          const s = flowByType.get(item.typeName) || { loaded: 0, unloaded: 0, inValue: 0, outValue: 0 }
          if (f.operation === "load") {
            s.loaded += item.count
            s.inValue += item.count * item.unitPrice
            totalInValue += item.count * item.unitPrice
          } else {
            s.unloaded += item.count
            s.outValue += item.count * item.unitPrice
            totalOutValue += item.count * item.unitPrice
          }
          flowByType.set(item.typeName, s)
        }
      }

      // ── Try Gemini AI advice first ──
      const aiContext = {
        warehouse: { name: warehouse.name, address: warehouse.address },
        currentDate: new Date().toISOString().slice(0, 10),
        summary: {
          totalItems,
          typeCount: inventory.length,
          totalInValue: Math.round(totalInValue),
          totalOutValue: Math.round(totalOutValue),
        },
        inventoryByType: inventory.slice(0, 20).map((i) => ({ typeName: i.typeName, count: i.count })),
        flowByType: Array.from(flowByType.entries())
          .sort((a, b) => (b[1].loaded + b[1].unloaded) - (a[1].loaded + a[1].unloaded))
          .slice(0, 15)
          .map(([typeName, s]) => ({
            typeName,
            loaded: s.loaded,
            unloaded: s.unloaded,
            net: s.loaded - s.unloaded,
            inValue: Math.round(s.inValue),
            outValue: Math.round(s.outValue),
          })),
      }

      const aiPrompt = `You are an expert warehouse and inventory advisor. Based on the data, give SHORT actionable advice (3-6 bullet points, max 1000 chars total) on what to BUY MORE OF and what to REDUCE/SELL OFF. Tie each recommendation to specific numbers from the data. No markdown formatting, no JSON, no headers. Output plain text bullets each starting with "• ". Telegram-friendly.

Data:
${JSON.stringify(aiContext, null, 2)}`

      const aiText = await tryGeminiText(aiPrompt, { temperature: 0.3, maxOutputTokens: 600 })

      let recommendationsBlock: string[]
      let source: "ai" | "algorithm"

      if (aiText) {
        recommendationsBlock = [h(trimAi(aiText))]
        source = "ai"
      } else {
        // Algorithmic fallback
        const recommendations: string[] = []

        if (totalItems === 0) {
          recommendations.push("Warehouse is empty. Start by stocking essential items.")
        } else {
          if (totalOutValue > totalInValue * 1.3) {
            recommendations.push(
              `Outgoing ($${totalOutValue.toLocaleString()}) > Incoming ($${totalInValue.toLocaleString()}). Consider restocking.`,
            )
          }
          const highDemand = Array.from(flowByType.entries())
            .filter(([, s]) => s.unloaded > s.loaded * 1.5 && s.unloaded > 0)
            .sort((a, b) => b[1].unloaded - a[1].unloaded)
            .slice(0, 3)

          for (const [name, stats] of highDemand) {
            recommendations.push(
              `"${name}" demand exceeds supply (${stats.unloaded} out vs ${stats.loaded} in). Reorder soon.`,
            )
          }

          if (recommendations.length === 0) {
            recommendations.push("Inventory levels appear balanced. Continue monitoring.")
          }
        }

        recommendationsBlock = recommendations.map((r) => `• ${h(r)}`)
        source = "algorithm"
      }

      const heading = source === "ai" ? "🤖 AI Recommendations:" : "Recommendations (offline):"

      const msg = [
        `💡 ${bold("AI Advice - " + warehouse.name)}`,
        "",
        `📦 ${totalItems} items | ${inventory.length} types`,
        `💰 In: $${totalInValue.toLocaleString()} | Out: $${totalOutValue.toLocaleString()}`,
        "",
        bold(heading),
        ...recommendationsBlock,
      ].join("\n")

      await ctx.editMessageText(msg, HTML)
    } catch (err: any) {
      console.error("AI advice Telegram error:", err)
      await ctx.editMessageText("Failed to generate advice. Try again later.")
    }
  })

  // ── /putaway ──────────────────────────────────────────────
  bot.command("putaway", async (ctx) => {
    if (!ctx.wmsUser) {
      await ctx.reply("Please log in first. Use /login <email> <password>")
      return
    }

    const typeName = ctx.message.text.replace(/^\/putaway\s*/i, "").trim()
    if (!typeName) {
      await ctx.reply("Usage: /putaway <item name>\nExample: /putaway Widget A")
      return
    }

    const warehouses = await Warehouse.find({ userId: ctx.wmsUser.id })
    if (warehouses.length === 0) { await ctx.reply("You have no warehouses."); return }

    // Store the item name for later retrieval (callback data has 64-byte limit)
    putawayCache.set(ctx.chat.id, typeName)

    if (warehouses.length === 1) {
      await handlePutaway(ctx, warehouses[0]._id.toString(), typeName, false)
      return
    }

    const buttons = warehouses.map((w) =>
      Markup.button.callback(w.name, `ai:pw:${w._id}`),
    )
    const rows: ReturnType<typeof Markup.button.callback>[][] = []
    for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2))

    await ctx.reply(
      `📍 Smart putaway for "${h(typeName)}"\n\nSelect warehouse:`,
      { ...Markup.inlineKeyboard(rows), ...HTML },
    )
  })

  bot.action(/^ai:pw:(.+)$/, async (ctx) => {
    if (!ctx.wmsUser) { await ctx.answerCbQuery("Not logged in"); return }

    const warehouseId = ctx.match[1]
    const typeName = putawayCache.get(ctx.chat!.id)
    if (!typeName) {
      await ctx.answerCbQuery("Session expired. Use /putaway <item> again.")
      return
    }

    await ctx.answerCbQuery("Calculating...")
    await handlePutaway(ctx, warehouseId, typeName, true)
  })

  async function handlePutaway(
    ctx: BotContext,
    warehouseId: string,
    typeName: string,
    editMessage: boolean,
  ) {
    const send = async (text: string, opts?: object) => {
      if (editMessage) await ctx.editMessageText!(text, opts)
      else await ctx.reply!(text, opts)
    }

    const warehouse = await Warehouse.findOne({ _id: warehouseId, userId: ctx.wmsUser!.id })
    if (!warehouse) { await send("Warehouse not found."); return }

    const locations = await Location.find({ warehouseId: warehouse._id, status: "active" }).lean()
    if (locations.length === 0) { await send("No active locations. Create zones first."); return }

    const zones = await Zone.find({ warehouseId: warehouse._id }).lean()
    const zoneMap = new Map(zones.map((z) => [z._id.toString(), z]))

    // Compute turnover (90d) to detect fast movers — same heuristic as web /smart-putaway
    const flows90d = await WarehouseFlow.find({
      warehouseId: warehouse._id,
      createdAt: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
    }).lean()

    const turnoverMap = new Map<string, number>()
    type FlowRow = { operation: WarehouseFlowOperation; items: IWarehouseFlowItem[] }
    for (const f of flows90d as FlowRow[]) {
      for (const item of f.items) {
        turnoverMap.set(item.typeName, (turnoverMap.get(item.typeName) ?? 0) + item.count)
      }
    }
    const turnoverValues = Array.from(turnoverMap.values())
    const avgTurnover = turnoverValues.length > 0 ? turnoverValues.reduce((a, b) => a + b, 0) / turnoverValues.length : 0
    const itemTurnover = turnoverMap.get(typeName) ?? 0
    const isFastMover = itemTurnover > avgTurnover * 1.5

    // Score locations
    const scored = locations
      .map((loc) => {
        const currentItems = loc.inventory.reduce((s, i) => s + i.count, 0)
        const available = loc.maxCapacity - currentItems
        if (available <= 0) return null

        const zone = zoneMap.get(loc.zoneId.toString())
        let score = Math.min(20, (available / loc.maxCapacity) * 20)

        if (loc.inventory.some((i) => i.typeName === typeName)) score += 25
        if (isFastMover && zone?.type === "shipping") score += 20
        else if (!isFastMover && zone?.type === "storage") score += 10
        if (available >= 1) score += 15

        return {
          code: loc.code,
          zone: zone?.name || "Unknown",
          zoneType: zone?.type || "storage",
          available,
          score: Math.round(score * 100) / 100,
          hasSameType: loc.inventory.some((i) => i.typeName === typeName),
        }
      })
      .filter(Boolean)
      .sort((a, b) => b!.score - a!.score)
      .slice(0, 5) as { code: string; zone: string; zoneType: string; available: number; score: number; hasSameType: boolean }[]

    if (scored.length === 0) { await send("No available locations with space."); return }

    const lines = scored.map(
      (s, i) => `${i + 1}. ${bold(s.code)} (${h(s.zone)} - ${h(s.zoneType)})\n   Space: ${s.available} | Score: ${s.score}`,
    )

    // ── Gemini AI rationale ──
    const aiContext = {
      item: typeName,
      isFastMover,
      itemTurnover90d: itemTurnover,
      averageTurnover: Math.round(avgTurnover * 100) / 100,
      candidates: scored.map((s) => ({
        code: s.code,
        zone: s.zone,
        zoneType: s.zoneType,
        availableSpace: s.available,
        score: s.score,
        alreadyContainsSameType: s.hasSameType,
      })),
    }

    const aiPrompt = `You are a warehouse layout optimization expert. The system scored 5 candidate locations to put away "${typeName}". Write a SHORT plain-text rationale (2-4 sentences, max 500 chars) for a warehouse worker explaining why the TOP location is the best choice. Mention: zone type fit, available space, fast-mover proximity rules if relevant, and consolidation with same-type stock. No markdown, no JSON, no headers.

Data:
${JSON.stringify(aiContext, null, 2)}`

    const aiText = await tryGeminiText(aiPrompt, { temperature: 0.3, maxOutputTokens: 300 })

    const out: string[] = [
      `📍 ${bold("Putaway: " + typeName)}`,
      `Warehouse: ${h(warehouse.name)}`,
      isFastMover ? `🚀 Fast mover (90d turnover: ${itemTurnover})` : `🐢 Standard mover (90d turnover: ${itemTurnover})`,
    ]

    if (aiText) {
      out.push("")
      out.push(`🤖 ${bold("AI rationale")}`)
      out.push(h(trimAi(aiText)))
    }

    out.push("")
    out.push(bold("Recommended locations:"))
    out.push(...lines)

    await send(out.join("\n"), HTML)
  }
}
