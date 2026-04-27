import { Telegraf, Markup } from "telegraf"
import { BotContext } from "../types"
import { PickList } from "../../models/PickList"
import { Shipment } from "../../models/Shipment"
import { h, bold, HTML } from "../format"

const STATUS_EMOJI: Record<string, string> = {
  pending: "⏳", in_progress: "🔄", completed: "✅", cancelled: "❌",
}

export function registerPickingCommands(bot: Telegraf<BotContext>) {
  bot.command("picks", async (ctx) => {
    if (!ctx.wmsUser) {
      await ctx.reply("Please log in first. Use /login <email> <password>")
      return
    }

    const pickLists = await PickList.find({
      userId: ctx.wmsUser.id,
      status: { $in: ["pending", "in_progress"] },
    }).sort({ createdAt: -1 }).limit(10)

    if (pickLists.length === 0) {
      await ctx.reply("No active pick lists.")
      return
    }

    const lines = pickLists.map((pl) => {
      const emoji = STATUS_EMOJI[pl.status] || "📋"
      const pickedCount = pl.items.filter((i) => i.status === "picked").length
      return `${emoji} ${bold(pl.pickListNumber)} | ${h(pl.type)} | ${h(pl.status)}\n   Items: ${pickedCount}/${pl.items.length} picked`
    })

    await ctx.reply(
      [`📋 ${bold("Active Pick Lists")}`, "", ...lines, "", "View details: /pick &lt;number&gt;"].join("\n"),
      HTML
    )
  })

  bot.command("pick", async (ctx) => {
    if (!ctx.wmsUser) {
      await ctx.reply("Please log in first. Use /login <email> <password>")
      return
    }

    const num = ctx.message.text.split(/\s+/)[1]?.toUpperCase()
    if (!num) {
      await ctx.reply("Usage: /pick <number>\nExample: /pick PK-00001")
      return
    }

    const pl = await PickList.findOne({
      userId: ctx.wmsUser.id,
      pickListNumber: { $regex: new RegExp(`^${num.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    })

    if (!pl) {
      await ctx.reply(`Pick list "${num}" not found.`)
      return
    }

    const pickedCount = pl.items.filter((i) => i.status === "picked").length
    const itemLines = pl.items.map((item) => {
      const icon = item.status === "picked" ? "✅" : item.status === "short" ? "⚠️" : "⏳"
      const loc = item.locationCode || "N/A"
      return `${icon} ${h(item.typeName)} | Qty: ${item.pickedQty}/${item.quantity}\n   Order: ${h(item.orderNumber)} | Loc: ${h(loc)}`
    })

    const msg = [
      `📋 ${bold("Pick List " + pl.pickListNumber)}`,
      "",
      `Type: ${h(pl.type)}`,
      `Status: ${STATUS_EMOJI[pl.status] || ""} ${h(pl.status)}`,
      `Progress: ${pickedCount}/${pl.items.length} items picked`,
      "",
      `${bold("Items:")}`,
      ...itemLines,
    ].join("\n")

    const buttons: ReturnType<typeof Markup.button.callback>[][] = []
    if (pl.status === "pending" || pl.status === "in_progress") {
      buttons.push([Markup.button.callback("✅ Confirm All Picked", `pkl:confirm:${pl._id}`)])
      buttons.push([Markup.button.callback("❌ Cancel Pick List", `pkl:cancel:${pl._id}`)])
    }

    await ctx.reply(msg, buttons.length > 0 ? { ...Markup.inlineKeyboard(buttons), ...HTML } : HTML)
  })

  bot.action(/^pkl:confirm:(.+)$/, async (ctx) => {
    if (!ctx.wmsUser) { await ctx.answerCbQuery("Not logged in"); return }

    const pl = await PickList.findOne({ _id: ctx.match[1], userId: ctx.wmsUser.id })
    if (!pl) { await ctx.answerCbQuery("Pick list not found"); return }

    if (pl.status !== "pending" && pl.status !== "in_progress") {
      await ctx.answerCbQuery("Pick list is not active")
      return
    }

    if (pl.status === "pending") {
      pl.status = "in_progress"
      pl.startedAt = new Date()
    }

    for (const item of pl.items) {
      item.pickedQty = item.quantity
      item.status = "picked"
    }
    pl.status = "completed"
    pl.completedAt = new Date()
    await pl.save()

    const shipmentMap = new Map<string, { typeName: string; pickedQty: number }[]>()
    for (const item of pl.items) {
      const sid = item.shipmentId.toString()
      if (!shipmentMap.has(sid)) shipmentMap.set(sid, [])
      shipmentMap.get(sid)!.push({ typeName: item.typeName, pickedQty: item.pickedQty })
    }

    for (const [sid, itemPicks] of shipmentMap) {
      const shipment = await Shipment.findById(sid)
      if (!shipment) continue
      for (const pick of itemPicks) {
        const si = shipment.items.find((i) => i.typeName === pick.typeName)
        if (si) si.pickedQty = pick.pickedQty
      }
      const allPicked = shipment.items.every((i) => i.pickedQty >= i.quantity)
      if (allPicked && shipment.status === "picking") {
        shipment.status = "picked"
        shipment.audit.push({
          action: "pick_completed",
          fromStatus: "picking",
          toStatus: "picked",
          performedBy: ctx.wmsUser.id as any,
          timestamp: new Date(),
          note: `Via pick list ${pl.pickListNumber} (Telegram)`,
        })
      }
      await shipment.save()
    }

    await ctx.answerCbQuery("All items confirmed as picked")
    await ctx.editMessageText(`✅ Pick list ${pl.pickListNumber} completed! All ${pl.items.length} items picked.`)
  })

  bot.action(/^pkl:cancel:(.+)$/, async (ctx) => {
    if (!ctx.wmsUser) { await ctx.answerCbQuery("Not logged in"); return }
    const pl = await PickList.findOne({ _id: ctx.match[1], userId: ctx.wmsUser.id })
    if (!pl) { await ctx.answerCbQuery("Pick list not found"); return }
    if (pl.status === "completed" || pl.status === "cancelled") {
      await ctx.answerCbQuery("Cannot cancel this pick list")
      return
    }
    pl.status = "cancelled"
    await pl.save()
    await ctx.answerCbQuery("Pick list cancelled")
    await ctx.editMessageText(`❌ Pick list ${pl.pickListNumber} cancelled.`)
  })
}
