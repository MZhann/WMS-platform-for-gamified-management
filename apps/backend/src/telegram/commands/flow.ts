import { Telegraf, Markup } from "telegraf"
import {
  BotContext,
  setConversation,
  getConversation,
  clearConversation,
} from "../types"
import { Warehouse } from "../../models/Warehouse"
import {
  WarehouseFlow,
  IWarehouseFlowItem,
  WarehouseFlowOperation,
} from "../../models/WarehouseFlow"
import { h, bold, money, HTML } from "../format"

export function registerFlowCommands(bot: Telegraf<BotContext>) {
  bot.command("load", async (ctx) => {
    await startFlowCommand(ctx, "load")
  })

  bot.command("unload", async (ctx) => {
    await startFlowCommand(ctx, "unload")
  })

  bot.action(/^flow:(load|unload):wh:(.+)$/, async (ctx) => {
    if (!ctx.wmsUser) { await ctx.answerCbQuery("Not logged in"); return }

    const operation = ctx.match[1]
    const warehouseId = ctx.match[2]
    await ctx.answerCbQuery()

    setConversation(ctx.chat!.id, "flow", 1, { operation, warehouseId })

    const label = operation === "load" ? "incoming" : "outgoing"
    await ctx.editMessageText(
      [
        `Recording ${label} goods.`,
        "",
        "Send items, one per line:",
        "  <name> <quantity> <unit_price>",
        "",
        "Example:",
        "  Widget 100 5.99",
        "  Bolt 250 0.50",
      ].join("\n")
    )
  })

  bot.action("flow:confirm", async (ctx) => {
    if (!ctx.wmsUser) { await ctx.answerCbQuery("Not logged in"); return }

    const state = getConversation(ctx.chat!.id)
    if (!state || state.command !== "flow") {
      await ctx.answerCbQuery("Session expired. Start over.")
      return
    }

    await ctx.answerCbQuery()

    try {
      const { operation, warehouseId, items } = state.data

      const warehouse = await Warehouse.findOne({ _id: warehouseId, userId: ctx.wmsUser.id })
      if (!warehouse) {
        await ctx.editMessageText("Warehouse not found.")
        clearConversation(ctx.chat!.id)
        return
      }

      const inventoryMap = new Map<string, number>()
      for (const i of warehouse.inventory || []) inventoryMap.set(i.typeName, i.count)

      if (operation === "unload") {
        for (const item of items) {
          const current = inventoryMap.get(item.typeName) ?? 0
          if (current < item.count) {
            await ctx.editMessageText(
              `Insufficient stock for "${item.typeName}": have ${current}, need ${item.count}. Flow cancelled.`
            )
            clearConversation(ctx.chat!.id)
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

      warehouse.inventory = Array.from(inventoryMap.entries()).map(([typeName, count]) => ({ typeName, count }))
      await warehouse.save()

      const flow = new WarehouseFlow({
        warehouseId: warehouse._id,
        operation: operation as WarehouseFlowOperation,
        items,
        performedBy: ctx.wmsUser.id,
      })
      await flow.save()

      clearConversation(ctx.chat!.id)

      const totalQty = items.reduce((s: number, i: IWarehouseFlowItem) => s + i.count, 0)
      const totalValue = items.reduce((s: number, i: IWarehouseFlowItem) => s + i.count * i.unitPrice, 0)

      await ctx.editMessageText(
        [
          `✅ ${operation === "load" ? "Load" : "Unload"} recorded!`,
          "",
          `Warehouse: ${warehouse.name}`,
          `Items: ${items.length} types, ${totalQty} total units`,
          `Value: ${money(totalValue)}`,
        ].join("\n")
      )
    } catch (err: any) {
      console.error("Telegram flow error:", err)
      await ctx.editMessageText(`Failed to record flow: ${err.message}`)
      clearConversation(ctx.chat!.id)
    }
  })

  bot.action("flow:cancel", async (ctx) => {
    clearConversation(ctx.chat!.id)
    await ctx.answerCbQuery("Flow cancelled")
    await ctx.editMessageText("Flow operation cancelled.")
  })
}

async function startFlowCommand(ctx: BotContext, operation: "load" | "unload") {
  if (!ctx.wmsUser) {
    await ctx.reply!("Please log in first. Use /login <email> <password>")
    return
  }

  const warehouses = await Warehouse.find({ userId: ctx.wmsUser.id })
  if (warehouses.length === 0) {
    await ctx.reply!("You have no warehouses.")
    return
  }

  const buttons = warehouses.map((w) =>
    Markup.button.callback(w.name, `flow:${operation}:wh:${w._id}`)
  )
  const rows: ReturnType<typeof Markup.button.callback>[][] = []
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2))
  }

  const label = operation === "load" ? "📥 Load (Receive)" : "📤 Unload (Ship)"
  await ctx.reply!(`${label}\n\nSelect warehouse:`, Markup.inlineKeyboard(rows))
}

export function handleFlowConversation(
  ctx: BotContext & { message: { text: string } }
): boolean {
  const chatId = ctx.chat!.id
  const state = getConversation(chatId)
  if (!state || state.command !== "flow") return false

  const text = ctx.message.text.trim()

  if (state.step === 1) {
    const lines = text.split("\n").filter((l) => l.trim())
    const items: IWarehouseFlowItem[] = []

    for (const line of lines) {
      const match = line.trim().match(/^(.+?)\s+(\d+)\s+([\d.]+)$/)
      if (!match) {
        ctx.reply(`Could not parse: "${line}"\nFormat: <name> <quantity> <unit_price>\n\nTry again:`)
        return true
      }
      items.push({
        typeName: match[1].trim(),
        count: parseInt(match[2]),
        unitPrice: parseFloat(match[3]),
      })
    }

    if (items.length === 0) {
      ctx.reply("No items parsed. Format: <name> <quantity> <unit_price>")
      return true
    }

    state.data.items = items
    state.step = 2

    const totalQty = items.reduce((s, i) => s + i.count, 0)
    const totalVal = items.reduce((s, i) => s + i.count * i.unitPrice, 0)
    const op = state.data.operation === "load" ? "📥 Load" : "📤 Unload"

    const itemLines = items.map((i) => `  • ${i.typeName}: ${i.count} x $${i.unitPrice}`)

    ctx.reply(
      [
        `${op} Summary:`,
        "",
        ...itemLines,
        "",
        `Total: ${totalQty} items, ${money(totalVal)}`,
      ].join("\n"),
      Markup.inlineKeyboard([
        Markup.button.callback("✅ Confirm", "flow:confirm"),
        Markup.button.callback("❌ Cancel", "flow:cancel"),
      ])
    )
    return true
  }

  return false
}
