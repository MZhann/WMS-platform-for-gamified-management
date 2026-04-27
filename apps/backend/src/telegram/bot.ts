import { Telegraf } from "telegraf"
import type { Express } from "express"
import { BotContext, getConversation } from "./types"
import { TelegramSession } from "../models/TelegramSession"
import { registerAuthCommands } from "./commands/auth"
import { registerWarehouseCommands } from "./commands/warehouses"
import { registerOrderCommands, handleOrderConversation } from "./commands/orders"
import { registerShipmentCommands } from "./commands/shipments"
import { registerPickingCommands } from "./commands/picking"
import { registerFlowCommands, handleFlowConversation } from "./commands/flow"
import { registerAiCommands } from "./commands/ai"
import { registerMiscCommands } from "./commands/misc"
import { setupNotifications } from "./notifications"

let botInstance: Telegraf<BotContext> | null = null

export function getBotInstance(): Telegraf<BotContext> | null {
  return botInstance
}

export async function startTelegramBot(app?: Express): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    console.log("ℹ️  TELEGRAM_BOT_TOKEN not set — Telegram bot disabled")
    return
  }

  const bot = new Telegraf<BotContext>(token)
  botInstance = bot

  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id
    if (chatId) {
      try {
        const session = await TelegramSession.findOne({ chatId })
        if (session) {
          ctx.wmsUser = {
            id: session.userId.toString(),
            email: session.userEmail,
            name: session.userName,
          }
        }
      } catch (err) {
        console.error("Session lookup error:", err)
      }
    }
    return next()
  })

  registerAuthCommands(bot)
  registerWarehouseCommands(bot)
  registerOrderCommands(bot)
  registerShipmentCommands(bot)
  registerPickingCommands(bot)
  registerFlowCommands(bot)
  registerAiCommands(bot)
  registerMiscCommands(bot)

  bot.on("text", async (ctx) => {
    const text = ctx.message.text
    if (text.startsWith("/")) return

    const chatId = ctx.chat.id
    const state = getConversation(chatId)
    if (!state) return

    if (state.command === "neworder") {
      handleOrderConversation(ctx as any)
      return
    }
    if (state.command === "flow") {
      handleFlowConversation(ctx as any)
      return
    }
  })

  setupNotifications(bot)

  bot.catch((err, ctx) => {
    console.error("Telegram bot error:", err)
    ctx.reply("An error occurred. Please try again.").catch(() => {})
  })

  const webhookUrl = process.env.TELEGRAM_WEBHOOK_URL
  if (webhookUrl && app) {
    const webhookPath = `/telegram-webhook/${token}`
    app.use(webhookPath, bot.webhookCallback(webhookPath))
    await bot.telegram.setWebhook(`${webhookUrl}${webhookPath}`)
    console.log(`📱 Telegram bot started (webhook: ${webhookUrl})`)
  } else {
    bot.launch({ dropPendingUpdates: true })
    console.log("📱 Telegram bot started (long polling)")
  }

  const shutdown = () => {
    bot.stop("SIGTERM")
  }
  process.once("SIGINT", shutdown)
  process.once("SIGTERM", shutdown)
}
