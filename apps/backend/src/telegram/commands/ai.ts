import { Telegraf, Markup } from "telegraf"
import { BotContext } from "../types"
import { Warehouse } from "../../models/Warehouse"
import { WarehouseFlow, IWarehouseFlowItem, WarehouseFlowOperation } from "../../models/WarehouseFlow"
import { Zone } from "../../models/Zone"
import { Location } from "../../models/Location"
import { h, bold, HTML } from "../format"

// In-memory cache for putaway item names keyed by chatId.
// Telegram callback data is limited to 64 bytes, so we can't embed the
// full typeName. Instead we store it here and reference it by chatId.
const putawayCache = new Map<number, string>()

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

    const msg = [
      `📊 ${bold("Demand Forecast - " + warehouse.name)}`,
      `Period: ${forecastDays} day forecast, ${historyDays} day history`,
      "",
      `🔴 Critical: ${critCount} | 🟠 High: ${highCount} | Total: ${items.length} products`,
      "",
      `${bold("Top items by risk:")}`,
      ...topItems,
    ].join("\n")

    await ctx.editMessageText(msg, HTML)
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

      const flowByType = new Map<string, { loaded: number; unloaded: number }>()
      let totalInValue = 0
      let totalOutValue = 0

      type FlowRow = { operation: WarehouseFlowOperation; items: IWarehouseFlowItem[] }
      for (const f of flows as FlowRow[]) {
        for (const item of f.items) {
          const s = flowByType.get(item.typeName) || { loaded: 0, unloaded: 0 }
          if (f.operation === "load") {
            s.loaded += item.count
            totalInValue += item.count * item.unitPrice
          } else {
            s.unloaded += item.count
            totalOutValue += item.count * item.unitPrice
          }
          flowByType.set(item.typeName, s)
        }
      }

      const recommendations: string[] = []

      if (totalItems === 0) {
        recommendations.push("Warehouse is empty. Start by stocking essential items.")
      } else {
        if (totalOutValue > totalInValue * 1.3) {
          recommendations.push(
            `Outgoing ($${totalOutValue.toLocaleString()}) > Incoming ($${totalInValue.toLocaleString()}). Consider restocking.`
          )
        }
        const highDemand = Array.from(flowByType.entries())
          .filter(([, s]) => s.unloaded > s.loaded * 1.5 && s.unloaded > 0)
          .sort((a, b) => b[1].unloaded - a[1].unloaded)
          .slice(0, 3)

        for (const [name, stats] of highDemand) {
          recommendations.push(
            `"${name}" demand exceeds supply (${stats.unloaded} out vs ${stats.loaded} in). Reorder soon.`
          )
        }

        if (recommendations.length === 0) {
          recommendations.push("Inventory levels appear balanced. Continue monitoring.")
        }
      }

      const recLines = recommendations.map((r) => `• ${h(r)}`)

      const msg = [
        `💡 ${bold("AI Advice - " + warehouse.name)}`,
        "",
        `📦 ${totalItems} items | ${inventory.length} types`,
        `💰 In: $${totalInValue.toLocaleString()} | Out: $${totalOutValue.toLocaleString()}`,
        "",
        `${bold("Recommendations:")}`,
        ...recLines,
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
      Markup.button.callback(w.name, `ai:pw:${w._id}`)
    )
    const rows: ReturnType<typeof Markup.button.callback>[][] = []
    for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2))

    await ctx.reply(
      `📍 Smart putaway for "${h(typeName)}"\n\nSelect warehouse:`,
      { ...Markup.inlineKeyboard(rows), ...HTML }
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
    editMessage: boolean
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

    // Score locations
    const scored = locations
      .map((loc) => {
        const currentItems = loc.inventory.reduce((s, i) => s + i.count, 0)
        const available = loc.maxCapacity - currentItems
        if (available <= 0) return null

        const zone = zoneMap.get(loc.zoneId.toString())
        let score = Math.min(20, (available / loc.maxCapacity) * 20)

        if (loc.inventory.some((i) => i.typeName === typeName)) score += 25
        if (zone?.type === "storage") score += 10
        if (available >= 1) score += 15

        return {
          code: loc.code,
          zone: zone?.name || "Unknown",
          zoneType: zone?.type || "storage",
          available,
          score: Math.round(score * 100) / 100,
        }
      })
      .filter(Boolean)
      .sort((a, b) => b!.score - a!.score)
      .slice(0, 5) as { code: string; zone: string; zoneType: string; available: number; score: number }[]

    if (scored.length === 0) { await send("No available locations with space."); return }

    const lines = scored.map(
      (s, i) => `${i + 1}. ${bold(s.code)} (${h(s.zone)} - ${h(s.zoneType)})\n   Space: ${s.available} | Score: ${s.score}`
    )

    const msg = [
      `📍 ${bold("Putaway: " + typeName)}`,
      `Warehouse: ${h(warehouse.name)}`,
      "",
      `${bold("Recommended locations:")}`,
      ...lines,
    ].join("\n")

    await send(msg, HTML)
  }
}
