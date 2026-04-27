import { Telegraf, Markup } from "telegraf"
import { BotContext, setConversation, getConversation, clearConversation } from "../types"
import { Order, generateOrderNumber, canTransition, OrderType, IOrderItem } from "../../models/Order"
import { Warehouse } from "../../models/Warehouse"
import { wmsEvents, WMS_EVENTS, OrderStatusEvent } from "../events"
import { h, bold, code, money, HTML } from "../format"

const STATUS_EMOJI: Record<string, string> = {
  draft: "📝",
  confirmed: "✅",
  in_progress: "🔄",
  completed: "✔️",
  cancelled: "❌",
}

export function registerOrderCommands(bot: Telegraf<BotContext>) {
  bot.command("orders", async (ctx) => {
    if (!ctx.wmsUser) {
      await ctx.reply("Please log in first. Use /login <email> <password>")
      return
    }

    const orders = await Order.find({ userId: ctx.wmsUser.id })
      .sort({ createdAt: -1 })
      .limit(10)

    if (orders.length === 0) {
      await ctx.reply("No orders found. Use /neworder to create one.")
      return
    }

    const lines = orders.map((o) => {
      const emoji = STATUS_EMOJI[o.status] || "📋"
      const total = o.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
      return `${emoji} ${bold(o.orderNumber)} | ${h(o.orderType)} | ${h(o.status)}\n   ${h(o.counterparty)} | ${money(total)}`
    })

    const total = await Order.countDocuments({ userId: ctx.wmsUser.id })

    await ctx.reply(
      [
        `📋 ${bold("Recent Orders")} (showing ${orders.length} of ${total})`,
        "",
        ...lines,
        "",
        "View details: /order &lt;number&gt;",
      ].join("\n"),
      HTML
    )
  })

  bot.command("order", async (ctx) => {
    if (!ctx.wmsUser) {
      await ctx.reply("Please log in first. Use /login <email> <password>")
      return
    }

    const parts = ctx.message.text.split(/\s+/)
    const orderNumber = parts[1]?.toUpperCase()

    if (!orderNumber) {
      await ctx.reply("Usage: /order <order-number>\nExample: /order PO-00001")
      return
    }

    const order = await Order.findOne({
      userId: ctx.wmsUser.id,
      orderNumber: { $regex: new RegExp(`^${orderNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
    })

    if (!order) {
      await ctx.reply(`Order "${orderNumber}" not found.`)
      return
    }

    const total = order.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
    const itemLines = order.items.map(
      (i) => `  • ${h(i.typeName)}: ${i.fulfilledQty}/${i.quantity} @ $${i.unitPrice}`
    )

    const statusSteps = ["draft", "confirmed", "in_progress", "completed"]
    const currentIdx = statusSteps.indexOf(order.status)
    const statusBar = statusSteps.map((_, i) => (i <= currentIdx ? "●" : "○")).join("─")

    const msg = [
      `📋 ${bold("Order " + order.orderNumber)}`,
      "",
      `Type: ${h(order.orderType)}`,
      `Status: ${STATUS_EMOJI[order.status] || ""} ${h(order.status)}`,
      `Progress: ${statusBar}`,
      `Counterparty: ${h(order.counterparty)}`,
      `Total: ${money(total)}`,
      "",
      `${bold("Items:")}`,
      ...itemLines,
    ].join("\n")

    const buttons: ReturnType<typeof Markup.button.callback>[][] = []

    if (order.status === "draft") {
      buttons.push([
        Markup.button.callback("✅ Confirm", `ord:confirm:${order._id}`),
        Markup.button.callback("❌ Cancel", `ord:cancel:${order._id}`),
      ])
    } else if (order.status === "confirmed") {
      buttons.push([
        Markup.button.callback("🔄 Start Processing", `ord:in_progress:${order._id}`),
        Markup.button.callback("❌ Cancel", `ord:cancel:${order._id}`),
      ])
    } else if (order.status === "in_progress") {
      buttons.push([
        Markup.button.callback("❌ Cancel", `ord:cancel:${order._id}`),
      ])
    }

    await ctx.reply(
      msg,
      buttons.length > 0
        ? { ...Markup.inlineKeyboard(buttons), ...HTML }
        : HTML
    )
  })

  bot.action(/^ord:(confirm|in_progress|cancel):(.+)$/, async (ctx) => {
    if (!ctx.wmsUser) {
      await ctx.answerCbQuery("Not logged in")
      return
    }

    const newStatus = ctx.match[1] === "cancel" ? "cancelled" : ctx.match[1]
    const orderId = ctx.match[2]

    const order = await Order.findOne({ _id: orderId, userId: ctx.wmsUser.id })

    if (!order) {
      await ctx.answerCbQuery("Order not found")
      return
    }

    if (!canTransition(order.status, newStatus as any)) {
      await ctx.answerCbQuery(`Cannot change status to ${newStatus}`)
      return
    }

    const fromStatus = order.status
    order.status = newStatus as any
    order.audit.push({
      action: "status_change",
      fromStatus,
      toStatus: newStatus,
      performedBy: ctx.wmsUser.id as any,
      timestamp: new Date(),
      note: "Changed via Telegram bot",
    })
    await order.save()

    wmsEvents.emit(WMS_EVENTS.ORDER_STATUS_CHANGED, {
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
      userId: ctx.wmsUser.id,
      fromStatus,
      toStatus: newStatus,
    } as OrderStatusEvent)

    await ctx.answerCbQuery(`Order ${order.orderNumber} → ${newStatus}`)
    await ctx.editMessageText(`✅ Order ${order.orderNumber} status changed: ${fromStatus} → ${newStatus}`)
  })

  // /neworder conversation flow
  bot.command("neworder", async (ctx) => {
    if (!ctx.wmsUser) {
      await ctx.reply("Please log in first. Use /login <email> <password>")
      return
    }

    const warehouses = await Warehouse.find({ userId: ctx.wmsUser.id })
    if (warehouses.length === 0) {
      await ctx.reply("You need at least one warehouse to create an order.")
      return
    }

    await ctx.reply(
      "Select order type:",
      Markup.inlineKeyboard([
        Markup.button.callback("📥 Purchase Order", "neworder:type:purchase"),
        Markup.button.callback("📤 Sales Order", "neworder:type:sales"),
      ])
    )
  })

  bot.action(/^neworder:type:(purchase|sales)$/, async (ctx) => {
    if (!ctx.wmsUser) {
      await ctx.answerCbQuery("Not logged in")
      return
    }

    const orderType = ctx.match[1] as OrderType
    await ctx.answerCbQuery()

    const warehouses = await Warehouse.find({ userId: ctx.wmsUser.id })
    const buttons = warehouses.map((w) =>
      Markup.button.callback(w.name, `neworder:wh:${orderType}:${w._id}`)
    )
    const rows: ReturnType<typeof Markup.button.callback>[][] = []
    for (let i = 0; i < buttons.length; i += 2) {
      rows.push(buttons.slice(i, i + 2))
    }

    await ctx.editMessageText(`Order type: ${orderType}\n\nSelect warehouse:`, Markup.inlineKeyboard(rows))
  })

  bot.action(/^neworder:wh:(purchase|sales):(.+)$/, async (ctx) => {
    if (!ctx.wmsUser) {
      await ctx.answerCbQuery("Not logged in")
      return
    }

    const orderType = ctx.match[1]
    const warehouseId = ctx.match[2]
    await ctx.answerCbQuery()

    setConversation(ctx.chat!.id, "neworder", 1, { orderType, warehouseId })

    await ctx.editMessageText(
      `Order type: ${orderType}\nWarehouse selected.\n\nNow type the counterparty name (supplier or customer):`
    )
  })

  bot.action("neworder:confirm", async (ctx) => {
    if (!ctx.wmsUser) {
      await ctx.answerCbQuery("Not logged in")
      return
    }

    const state = getConversation(ctx.chat!.id)
    if (!state || state.command !== "neworder") {
      await ctx.answerCbQuery("Session expired. Start over with /neworder")
      return
    }

    await ctx.answerCbQuery()

    try {
      const { orderType, warehouseId, counterparty, items } = state.data

      const warehouse = await Warehouse.findOne({ _id: warehouseId, userId: ctx.wmsUser.id })
      if (!warehouse) {
        await ctx.editMessageText("Warehouse not found. Please try again with /neworder")
        clearConversation(ctx.chat!.id)
        return
      }

      const orderNumber = await generateOrderNumber(orderType)

      const order = new Order({
        orderNumber,
        orderType,
        status: "draft",
        warehouseId: warehouse._id,
        userId: ctx.wmsUser.id,
        counterparty,
        items,
        notes: "",
        audit: [{
          action: "created",
          toStatus: "draft",
          performedBy: ctx.wmsUser.id,
          timestamp: new Date(),
          note: "Created via Telegram bot",
        }],
      })

      await order.save()
      clearConversation(ctx.chat!.id)

      const total = items.reduce((sum: number, i: IOrderItem) => sum + i.quantity * i.unitPrice, 0)

      await ctx.editMessageText(
        [
          `✅ Order ${orderNumber} created!`,
          "",
          `Type: ${orderType}`,
          `Counterparty: ${counterparty}`,
          `Items: ${items.length}`,
          `Total: ${money(total)}`,
          `Status: draft`,
          "",
          `View: /order ${orderNumber}`,
        ].join("\n")
      )
    } catch (err: any) {
      console.error("Telegram create order error:", err)
      await ctx.editMessageText(`Failed to create order: ${err.message}`)
      clearConversation(ctx.chat!.id)
    }
  })

  bot.action("neworder:cancel", async (ctx) => {
    clearConversation(ctx.chat!.id)
    await ctx.answerCbQuery("Order creation cancelled")
    await ctx.editMessageText("Order creation cancelled.")
  })
}

export function handleOrderConversation(
  ctx: BotContext & { message: { text: string } }
): boolean {
  const chatId = ctx.chat!.id
  const state = getConversation(chatId)
  if (!state || state.command !== "neworder") return false

  const text = ctx.message.text.trim()

  if (state.step === 1) {
    if (!text) {
      ctx.reply("Please enter a counterparty name:")
      return true
    }
    state.data.counterparty = text
    state.step = 2
    state.data.items = []

    ctx.reply(
      [
        `Counterparty: ${text}`,
        "",
        "Now add items. Send each item on a new line in this format:",
        "  <name> <quantity> <unit_price>",
        "",
        "Example:",
        "  Widget 100 5.99",
        "  Bolt 500 0.50",
        "",
        "Send all items in one message, then I'll ask for confirmation.",
      ].join("\n")
    )
    return true
  }

  if (state.step === 2) {
    const lines = text.split("\n").filter((l) => l.trim())
    const items: IOrderItem[] = []

    for (const line of lines) {
      const match = line.trim().match(/^(.+?)\s+(\d+)\s+([\d.]+)$/)
      if (!match) {
        ctx.reply(`Could not parse line: "${line}"\nFormat: <name> <quantity> <unit_price>\n\nTry again:`)
        return true
      }
      items.push({
        typeName: match[1].trim(),
        quantity: parseInt(match[2]),
        unitPrice: parseFloat(match[3]),
        fulfilledQty: 0,
      })
    }

    if (items.length === 0) {
      ctx.reply("No items parsed. Please send items in the format: <name> <quantity> <unit_price>")
      return true
    }

    state.data.items = items
    state.step = 3

    const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0)
    const itemLines = items.map((i) => `  • ${i.typeName}: ${i.quantity} x $${i.unitPrice}`)

    ctx.reply(
      [
        "📋 Order Summary:",
        "",
        `Type: ${state.data.orderType}`,
        `Counterparty: ${state.data.counterparty}`,
        "",
        "Items:",
        ...itemLines,
        "",
        `Total: ${money(total)}`,
      ].join("\n"),
      Markup.inlineKeyboard([
        Markup.button.callback("✅ Create Order", "neworder:confirm"),
        Markup.button.callback("❌ Cancel", "neworder:cancel"),
      ])
    )
    return true
  }

  return false
}
