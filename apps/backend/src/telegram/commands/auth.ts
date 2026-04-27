import { Telegraf } from "telegraf"
import { BotContext } from "../types"
import { User } from "../../models/User"
import { TelegramSession } from "../../models/TelegramSession"
import { h, bold, HTML } from "../format"

export function registerAuthCommands(bot: Telegraf<BotContext>) {
  bot.command("start", async (ctx) => {
    const session = await TelegramSession.findOne({ chatId: ctx.chat.id })
    if (session) {
      await ctx.reply(
        `Welcome back, ${bold(session.userName)}!\n\nYou are already logged in. Use /help to see available commands.`,
        HTML
      )
      return
    }

    await ctx.reply(
      [
        "Welcome to the WMS Bot! 📦",
        "",
        "This bot lets you manage your warehouse operations on the go.",
        "",
        "To get started, link your WMS account:",
        "  /login &lt;email&gt; &lt;password&gt;",
        "",
        "Example:",
        "  /login user@example.com mypassword",
      ].join("\n"),
      HTML
    )
  })

  bot.command("login", async (ctx) => {
    const existing = await TelegramSession.findOne({ chatId: ctx.chat.id })
    if (existing) {
      await ctx.reply(
        `You are already logged in as ${h(existing.userEmail)}. Use /logout first to switch accounts.`
      )
      return
    }

    const parts = ctx.message.text.split(/\s+/)
    const email = parts[1]
    const password = parts.slice(2).join(" ")

    if (!email || !password) {
      await ctx.reply("Usage: /login <email> <password>")
      return
    }

    try {
      try { await ctx.deleteMessage() } catch { /* may not have permission */ }

      const user = await User.findOne({ email: email.toLowerCase() }).select("+password")
      if (!user) {
        await ctx.reply("Invalid email or password.")
        return
      }

      const valid = await user.comparePassword(password)
      if (!valid) {
        await ctx.reply("Invalid email or password.")
        return
      }

      await TelegramSession.findOneAndUpdate(
        { chatId: ctx.chat.id },
        {
          chatId: ctx.chat.id,
          userId: user._id,
          userName: user.name,
          userEmail: user.email,
        },
        { upsert: true, new: true }
      )

      await ctx.reply(
        `Logged in as ${h(user.name)} (${h(user.email)}).\n\nUse /help to see available commands.`
      )
    } catch (err) {
      console.error("Telegram login error:", err)
      await ctx.reply("Login failed. Please try again.")
    }
  })

  bot.command("logout", async (ctx) => {
    const result = await TelegramSession.deleteOne({ chatId: ctx.chat.id })
    if (result.deletedCount > 0) {
      await ctx.reply("You have been logged out. Use /login to sign in again.")
    } else {
      await ctx.reply("You are not logged in.")
    }
  })

  bot.command("whoami", async (ctx) => {
    if (!ctx.wmsUser) {
      await ctx.reply("You are not logged in. Use /login to sign in.")
      return
    }

    await ctx.reply(
      [
        `Name: ${h(ctx.wmsUser.name)}`,
        `Email: ${h(ctx.wmsUser.email)}`,
        `Role: ${ctx.wmsUser.isAdmin ? "Admin" : "User"}`,
      ].join("\n")
    )
  })

  bot.command("help", async (ctx) => {
    await ctx.reply(
      [
        "📦 <b>WMS Bot Commands</b>",
        "",
        "<b>Auth</b>",
        "/login - Link your WMS account",
        "/logout - Unlink your account",
        "/whoami - Show your profile",
        "",
        "<b>Warehouses</b>",
        "/warehouses - List your warehouses",
        "/inventory - Check warehouse inventory",
        "",
        "<b>Goods Movement</b>",
        "/load - Record incoming goods",
        "/unload - Record outgoing goods",
        "",
        "<b>Orders</b>",
        "/orders - List recent orders",
        "/order &lt;number&gt; - View order details",
        "/neworder - Create a new order",
        "",
        "<b>Shipments</b>",
        "/shipments - List shipments",
        "/shipment &lt;number&gt; - View shipment details",
        "/ship &lt;number&gt; - Mark shipped",
        "/deliver &lt;number&gt; - Mark delivered",
        "",
        "<b>Picking</b>",
        "/picks - List active pick lists",
        "/pick &lt;number&gt; - View and confirm picks",
        "",
        "<b>AI &amp; Analytics</b>",
        "/forecast - Demand forecast summary",
        "/advice - AI warehouse advice",
        "/putaway &lt;item&gt; - Smart putaway suggestion",
        "/zones - Zone utilization summary",
        "/analytics - KPI snapshot",
        "",
        "<b>Other</b>",
        "/support &lt;message&gt; - Send support request",
        "/help - Show this help",
      ].join("\n"),
      HTML
    )
  })
}
