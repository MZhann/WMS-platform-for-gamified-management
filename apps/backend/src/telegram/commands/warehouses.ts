import { Telegraf, Markup } from "telegraf"
import { BotContext } from "../types"
import { Warehouse } from "../../models/Warehouse"
import { h, bold, HTML } from "../format"

export function registerWarehouseCommands(bot: Telegraf<BotContext>) {
  bot.command("warehouses", async (ctx) => {
    if (!ctx.wmsUser) {
      await ctx.reply("Please log in first. Use /login <email> <password>")
      return
    }

    const warehouses = await Warehouse.find({ userId: ctx.wmsUser.id }).sort({ createdAt: -1 })

    if (warehouses.length === 0) {
      await ctx.reply("You have no warehouses yet. Create one from the web dashboard.")
      return
    }

    const lines = warehouses.map((w, i) => {
      const totalItems = (w.inventory || []).reduce((sum, item) => sum + item.count, 0)
      const types = (w.inventory || []).length
      return `${i + 1}. ${bold(w.name)}\n   📍 ${h(w.address)}\n   📦 ${totalItems} items (${types} types)`
    })

    await ctx.reply(
      [`🏭 ${bold("Your Warehouses")} (${warehouses.length})`, "", ...lines].join("\n"),
      HTML
    )
  })

  bot.command("inventory", async (ctx) => {
    if (!ctx.wmsUser) {
      await ctx.reply("Please log in first. Use /login <email> <password>")
      return
    }

    const warehouses = await Warehouse.find({ userId: ctx.wmsUser.id }).sort({ createdAt: -1 })

    if (warehouses.length === 0) {
      await ctx.reply("You have no warehouses yet.")
      return
    }

    const buttons = warehouses.map((w) =>
      Markup.button.callback(w.name, `inv:${w._id.toString()}`)
    )
    const rows: ReturnType<typeof Markup.button.callback>[][] = []
    for (let i = 0; i < buttons.length; i += 2) {
      rows.push(buttons.slice(i, i + 2))
    }

    await ctx.reply("Select a warehouse to view inventory:", Markup.inlineKeyboard(rows))
  })

  bot.action(/^inv:(.+)$/, async (ctx) => {
    if (!ctx.wmsUser) {
      await ctx.answerCbQuery("Not logged in")
      return
    }

    const warehouseId = ctx.match[1]
    const warehouse = await Warehouse.findOne({ _id: warehouseId, userId: ctx.wmsUser.id })

    if (!warehouse) {
      await ctx.answerCbQuery("Warehouse not found")
      return
    }

    await ctx.answerCbQuery()

    const inventory = warehouse.inventory || []
    if (inventory.length === 0) {
      await ctx.editMessageText(`📦 ${bold(warehouse.name)}\n\nNo inventory items.`, HTML)
      return
    }

    const totalItems = inventory.reduce((sum, i) => sum + i.count, 0)
    const lines = inventory
      .sort((a, b) => b.count - a.count)
      .slice(0, 20)
      .map((item) => `  • ${h(item.typeName)}: ${bold(item.count)}`)

    const msg = [
      `📦 ${bold(warehouse.name)}`,
      `Total: ${totalItems} items (${inventory.length} types)`,
      "",
      ...lines,
      inventory.length > 20 ? `\n<i>...and ${inventory.length - 20} more</i>` : "",
    ]
      .filter(Boolean)
      .join("\n")

    await ctx.editMessageText(msg, HTML)
  })
}
