import { Telegraf, Markup } from "telegraf"
import { BotContext } from "../types"
import { Warehouse } from "../../models/Warehouse"
import { Zone } from "../../models/Zone"
import { Location } from "../../models/Location"
import { WarehouseFlow, IWarehouseFlowItem, WarehouseFlowOperation } from "../../models/WarehouseFlow"
import { SupportComment } from "../../models/SupportComment"
import { h, bold, pctBar, HTML } from "../format"

export function registerMiscCommands(bot: Telegraf<BotContext>) {
  // ── /zones ────────────────────────────────────────────────
  bot.command("zones", async (ctx) => {
    if (!ctx.wmsUser) {
      await ctx.reply("Please log in first. Use /login <email> <password>")
      return
    }

    const warehouses = await Warehouse.find({ userId: ctx.wmsUser.id })
    if (warehouses.length === 0) { await ctx.reply("You have no warehouses."); return }

    if (warehouses.length === 1) {
      await showZoneSummary(ctx, warehouses[0]._id.toString(), false)
      return
    }

    const buttons = warehouses.map((w) => Markup.button.callback(w.name, `misc:zn:${w._id}`))
    const rows: ReturnType<typeof Markup.button.callback>[][] = []
    for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2))

    await ctx.reply("🏗 Select warehouse to view zones:", Markup.inlineKeyboard(rows))
  })

  bot.action(/^misc:zn:(.+)$/, async (ctx) => {
    if (!ctx.wmsUser) { await ctx.answerCbQuery("Not logged in"); return }
    await ctx.answerCbQuery()
    await showZoneSummary(ctx, ctx.match[1], true)
  })

  // ── /analytics ────────────────────────────────────────────
  bot.command("analytics", async (ctx) => {
    if (!ctx.wmsUser) {
      await ctx.reply("Please log in first. Use /login <email> <password>")
      return
    }

    const warehouses = await Warehouse.find({ userId: ctx.wmsUser.id })
    if (warehouses.length === 0) { await ctx.reply("You have no warehouses."); return }

    if (warehouses.length === 1) {
      await showAnalytics(ctx, warehouses[0]._id.toString(), false)
      return
    }

    const buttons = warehouses.map((w) => Markup.button.callback(w.name, `misc:an:${w._id}`))
    const rows: ReturnType<typeof Markup.button.callback>[][] = []
    for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2))

    await ctx.reply("📊 Select warehouse for analytics:", Markup.inlineKeyboard(rows))
  })

  bot.action(/^misc:an:(.+)$/, async (ctx) => {
    if (!ctx.wmsUser) { await ctx.answerCbQuery("Not logged in"); return }
    await ctx.answerCbQuery()
    await showAnalytics(ctx, ctx.match[1], true)
  })

  // ── /support ──────────────────────────────────────────────
  bot.command("support", async (ctx) => {
    if (!ctx.wmsUser) {
      await ctx.reply("Please log in first. Use /login <email> <password>")
      return
    }

    const message = ctx.message.text.replace(/^\/support\s*/, "").trim()
    if (!message) {
      await ctx.reply("Usage: /support <your message>\nExample: /support I need help with order tracking")
      return
    }

    try {
      const comment = new SupportComment({
        name: ctx.wmsUser.name,
        email: ctx.wmsUser.email,
        message,
        userId: ctx.wmsUser.id,
      })
      await comment.save()
      await ctx.reply("✅ Support request submitted. Our team will review it.")
    } catch (err) {
      console.error("Telegram support error:", err)
      await ctx.reply("Failed to submit support request. Try again later.")
    }
  })

  // ── helpers ───────────────────────────────────────────────
  async function showZoneSummary(ctx: BotContext, warehouseId: string, edit: boolean) {
    const send = async (text: string, opts?: object) => {
      if (edit) await ctx.editMessageText!(text, opts)
      else await ctx.reply!(text, opts)
    }

    const warehouse = await Warehouse.findOne({ _id: warehouseId, userId: ctx.wmsUser!.id })
    if (!warehouse) { await send("Warehouse not found."); return }

    const zones = await Zone.find({ warehouseId: warehouse._id, userId: ctx.wmsUser!.id })
    const locations = await Location.find({ warehouseId: warehouse._id, userId: ctx.wmsUser!.id })

    const totalCap = locations.reduce((s, l) => s + l.maxCapacity, 0)
    const totalUsed = locations.reduce(
      (s, l) => s + l.inventory.reduce((si, i) => si + i.count, 0), 0
    )
    const utilPct = totalCap > 0 ? Math.round((totalUsed / totalCap) * 100) : 0

    const zoneLines = zones.map((z) => {
      const zoneLocs = locations.filter((l) => l.zoneId.toString() === z._id.toString())
      const cap = zoneLocs.reduce((s, l) => s + l.maxCapacity, 0)
      const used = zoneLocs.reduce(
        (s, l) => s + l.inventory.reduce((si, i) => si + i.count, 0), 0
      )
      const pct = cap > 0 ? Math.round((used / cap) * 100) : 0
      return `  ${h(z.name)} (${h(z.type)})\n  ${pctBar(pct)} ${pct}% | ${zoneLocs.length} bins`
    })

    const msg = [
      `🏗 ${bold("Zones - " + warehouse.name)}`,
      "",
      `Zones: ${zones.length} | Locations: ${locations.length}`,
      `Overall: ${utilPct}% utilized (${totalUsed}/${totalCap})`,
      "",
      ...zoneLines,
    ].join("\n")

    await send(msg, HTML)
  }

  async function showAnalytics(ctx: BotContext, warehouseId: string, edit: boolean) {
    const send = async (text: string, opts?: object) => {
      if (edit) await ctx.editMessageText!(text, opts)
      else await ctx.reply!(text, opts)
    }

    const warehouse = await Warehouse.findOne({ _id: warehouseId, userId: ctx.wmsUser!.id })
    if (!warehouse) { await send("Warehouse not found."); return }

    const inventory = warehouse.inventory || []
    const totalItems = inventory.reduce((s, i) => s + i.count, 0)

    const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000)
    const flows = await WarehouseFlow.find({
      warehouseId: warehouse._id,
      createdAt: { $gte: sixMonthsAgo },
    }).lean()

    let totalInValue = 0, totalOutValue = 0, totalInCount = 0, totalOutCount = 0

    type FlowRow = { operation: WarehouseFlowOperation; items: IWarehouseFlowItem[] }
    for (const f of flows as FlowRow[]) {
      for (const item of f.items) {
        if (f.operation === "load") {
          totalInCount += item.count
          totalInValue += item.count * item.unitPrice
        } else {
          totalOutCount += item.count
          totalOutValue += item.count * item.unitPrice
        }
      }
    }

    const topItems = inventory
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((i) => `  • ${h(i.typeName)}: ${i.count}`)

    const msg = [
      `📊 ${bold("Analytics - " + warehouse.name)}`,
      `Period: Last 6 months`,
      "",
      `📦 Total Items: ${totalItems}`,
      `📋 Product Types: ${inventory.length}`,
      "",
      `📥 Incoming: ${totalInCount} items ($${totalInValue.toLocaleString()})`,
      `📤 Outgoing: ${totalOutCount} items ($${totalOutValue.toLocaleString()})`,
      `📊 Flow Operations: ${flows.length}`,
      "",
      `${bold("Top Products:")}`,
      ...topItems,
    ].join("\n")

    await send(msg, HTML)
  }
}
