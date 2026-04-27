import { Telegraf, Markup } from "telegraf"
import { BotContext } from "../types"
import { Shipment, canTransitionShipment, ShipmentStatus } from "../../models/Shipment"
import { Warehouse } from "../../models/Warehouse"
import { Order } from "../../models/Order"
import { wmsEvents, WMS_EVENTS, ShipmentStatusEvent } from "../events"
import { h, bold, HTML } from "../format"

const STATUS_EMOJI: Record<string, string> = {
  pending: "⏳", picking: "🔍", picked: "📋", packing: "📦",
  packed: "📦", shipped: "🚚", delivered: "✅", cancelled: "❌",
}

export function registerShipmentCommands(bot: Telegraf<BotContext>) {
  bot.command("shipments", async (ctx) => {
    if (!ctx.wmsUser) {
      await ctx.reply("Please log in first. Use /login <email> <password>")
      return
    }

    const shipments = await Shipment.find({ userId: ctx.wmsUser.id }).sort({ createdAt: -1 }).limit(10)

    if (shipments.length === 0) {
      await ctx.reply("No shipments found.")
      return
    }

    const lines = shipments.map((s) => {
      const emoji = STATUS_EMOJI[s.status] || "📋"
      return `${emoji} ${bold(s.shipmentNumber)} | ${h(s.status)}\n   Order: ${h(s.orderNumber)}${s.carrier ? ` | ${h(s.carrier)}` : ""}`
    })

    const total = await Shipment.countDocuments({ userId: ctx.wmsUser.id })

    await ctx.reply(
      [
        `🚚 ${bold("Recent Shipments")} (showing ${shipments.length} of ${total})`,
        "",
        ...lines,
        "",
        "View details: /shipment &lt;number&gt;",
      ].join("\n"),
      HTML
    )
  })

  bot.command("shipment", async (ctx) => {
    if (!ctx.wmsUser) {
      await ctx.reply("Please log in first. Use /login <email> <password>")
      return
    }

    const parts = ctx.message.text.split(/\s+/)
    const num = parts[1]?.toUpperCase()
    if (!num) {
      await ctx.reply("Usage: /shipment <number>\nExample: /shipment SH-00001")
      return
    }

    const shipment = await Shipment.findOne({
      userId: ctx.wmsUser.id,
      shipmentNumber: { $regex: new RegExp(`^${num.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    })
    if (!shipment) {
      await ctx.reply(`Shipment "${num}" not found.`)
      return
    }
    await sendShipmentDetail(ctx, shipment)
  })

  bot.command("ship", async (ctx) => {
    await quickTransition(ctx, "shipped")
  })

  bot.command("deliver", async (ctx) => {
    await quickTransition(ctx, "delivered")
  })

  bot.action(/^shp:(shipped|delivered|cancelled):(.+)$/, async (ctx) => {
    if (!ctx.wmsUser) { await ctx.answerCbQuery("Not logged in"); return }

    const newStatus = ctx.match[1] as ShipmentStatus
    const shipmentId = ctx.match[2]

    const shipment = await Shipment.findOne({ _id: shipmentId, userId: ctx.wmsUser.id })
    if (!shipment) { await ctx.answerCbQuery("Shipment not found"); return }

    if (!canTransitionShipment(shipment.status, newStatus)) {
      await ctx.answerCbQuery(`Cannot change to ${newStatus} from ${shipment.status}`)
      return
    }

    const fromStatus = shipment.status
    await applyTransition(shipment, newStatus, ctx.wmsUser.id)

    await ctx.answerCbQuery(`${shipment.shipmentNumber} → ${newStatus}`)
    await ctx.editMessageText(`✅ Shipment ${shipment.shipmentNumber}: ${fromStatus} → ${newStatus}`)
  })

  async function quickTransition(ctx: BotContext & { message: any }, target: ShipmentStatus) {
    if (!ctx.wmsUser) {
      await ctx.reply("Please log in first. Use /login <email> <password>")
      return
    }
    const num = ctx.message.text.split(/\s+/)[1]?.toUpperCase()
    if (!num) {
      await ctx.reply(`Usage: /${target === "shipped" ? "ship" : "deliver"} <number>`)
      return
    }
    const shipment = await Shipment.findOne({
      userId: ctx.wmsUser.id,
      shipmentNumber: { $regex: new RegExp(`^${num.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    })
    if (!shipment) { await ctx.reply(`Shipment "${num}" not found.`); return }
    if (!canTransitionShipment(shipment.status, target)) {
      await ctx.reply(`Cannot ${target}: current status is "${shipment.status}".`)
      return
    }
    const fromStatus = shipment.status
    await applyTransition(shipment, target, ctx.wmsUser.id)
    await ctx.reply(`✅ Shipment ${shipment.shipmentNumber}: ${fromStatus} → ${target}`)
  }
}

async function sendShipmentDetail(ctx: BotContext, shipment: InstanceType<typeof Shipment>) {
  const steps = ["pending", "picking", "picked", "packing", "packed", "shipped", "delivered"]
  const idx = steps.indexOf(shipment.status)
  const bar = steps.map((_, i) => (i <= idx ? "●" : "○")).join("─")

  const itemLines = shipment.items.map(
    (i) => `  • ${h(i.typeName)}: ${i.quantity} (picked: ${i.pickedQty}, packed: ${i.packedQty})`
  )

  const msg = [
    `🚚 ${bold("Shipment " + shipment.shipmentNumber)}`,
    "",
    `Order: ${h(shipment.orderNumber)}`,
    `Status: ${STATUS_EMOJI[shipment.status] || ""} ${h(shipment.status)}`,
    `Progress: ${bar}`,
    shipment.carrier ? `Carrier: ${h(shipment.carrier)}` : null,
    shipment.trackingNumber ? `Tracking: ${h(shipment.trackingNumber)}` : null,
    shipment.shippedAt ? `Shipped: ${shipment.shippedAt.toISOString().slice(0, 10)}` : null,
    shipment.deliveredAt ? `Delivered: ${shipment.deliveredAt.toISOString().slice(0, 10)}` : null,
    "",
    `${bold("Items:")}`,
    ...itemLines,
  ].filter(Boolean).join("\n")

  const buttons: ReturnType<typeof Markup.button.callback>[][] = []
  if (canTransitionShipment(shipment.status, "shipped"))
    buttons.push([Markup.button.callback("🚚 Mark Shipped", `shp:shipped:${shipment._id}`)])
  if (canTransitionShipment(shipment.status, "delivered"))
    buttons.push([Markup.button.callback("✅ Mark Delivered", `shp:delivered:${shipment._id}`)])
  if (canTransitionShipment(shipment.status, "cancelled"))
    buttons.push([Markup.button.callback("❌ Cancel", `shp:cancelled:${shipment._id}`)])

  await ctx.reply!(
    msg,
    buttons.length > 0 ? { ...Markup.inlineKeyboard(buttons), ...HTML } : HTML
  )
}

async function applyTransition(
  shipment: InstanceType<typeof Shipment>,
  newStatus: ShipmentStatus,
  userId: string
) {
  const fromStatus = shipment.status
  shipment.status = newStatus

  if (newStatus === "shipped" && !shipment.shippedAt) shipment.shippedAt = new Date()
  if (newStatus === "delivered") shipment.deliveredAt = new Date()

  shipment.audit.push({
    action: "status_change",
    fromStatus,
    toStatus: newStatus,
    performedBy: userId as any,
    timestamp: new Date(),
    note: "Changed via Telegram bot",
  })
  await shipment.save()

  if (newStatus === "shipped") await deductInventory(shipment, userId)
  if (newStatus === "delivered") await updateOrderOnDelivery(shipment, userId)

  wmsEvents.emit(WMS_EVENTS.SHIPMENT_STATUS_CHANGED, {
    shipmentId: shipment._id.toString(),
    shipmentNumber: shipment.shipmentNumber,
    orderNumber: shipment.orderNumber,
    userId,
    fromStatus,
    toStatus: newStatus,
    carrier: shipment.carrier,
    trackingNumber: shipment.trackingNumber,
  } as ShipmentStatusEvent)
}

async function deductInventory(shipment: InstanceType<typeof Shipment>, userId: string) {
  const warehouse = await Warehouse.findById(shipment.warehouseId)
  if (!warehouse) return
  for (const item of shipment.items) {
    const qty = item.packedQty || item.pickedQty || item.quantity
    const inv = warehouse.inventory.find((i) => i.typeName === item.typeName)
    if (inv) inv.count = Math.max(0, inv.count - qty)
  }
  await warehouse.save()
}

async function updateOrderOnDelivery(shipment: InstanceType<typeof Shipment>, userId: string) {
  const order = await Order.findById(shipment.orderId)
  if (!order) return
  for (const sItem of shipment.items) {
    const oItem = order.items.find((i) => i.typeName === sItem.typeName)
    if (oItem) {
      const fulfilled = sItem.packedQty || sItem.pickedQty || sItem.quantity
      oItem.fulfilledQty = Math.min(oItem.quantity, oItem.fulfilledQty + fulfilled)
    }
  }
  const allFulfilled = order.items.every((i) => i.fulfilledQty >= i.quantity)
  if (allFulfilled && order.status === "in_progress") {
    order.status = "completed"
    order.audit.push({
      action: "status_change",
      fromStatus: "in_progress",
      toStatus: "completed",
      performedBy: userId as any,
      timestamp: new Date(),
      note: `Auto-completed via shipment ${shipment.shipmentNumber} (Telegram)`,
    })
  }
  await order.save()
}
