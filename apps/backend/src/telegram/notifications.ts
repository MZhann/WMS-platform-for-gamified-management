import { Telegraf } from "telegraf"
import { BotContext } from "./types"
import { TelegramSession } from "../models/TelegramSession"
import {
  wmsEvents,
  WMS_EVENTS,
  OrderStatusEvent,
  ShipmentStatusEvent,
  PickListEvent,
} from "./events"

const STATUS_EMOJI: Record<string, string> = {
  draft: "📝",
  confirmed: "✅",
  in_progress: "🔄",
  completed: "✔️",
  cancelled: "❌",
  pending: "⏳",
  picking: "🔍",
  picked: "📋",
  packing: "📦",
  packed: "📦",
  shipped: "🚚",
  delivered: "✅",
}

export function setupNotifications(bot: Telegraf<BotContext>) {
  wmsEvents.on(
    WMS_EVENTS.ORDER_STATUS_CHANGED,
    async (event: OrderStatusEvent) => {
      try {
        const sessions = await TelegramSession.find({ userId: event.userId })
        if (sessions.length === 0) return

        const emoji = STATUS_EMOJI[event.toStatus] || "📋"
        const msg = [
          `${emoji} Order ${event.orderNumber} status changed`,
          `${event.fromStatus} → ${event.toStatus}`,
          event.note ? `Note: ${event.note}` : null,
          "",
          `View: /order ${event.orderNumber}`,
        ]
          .filter(Boolean)
          .join("\n")

        for (const session of sessions) {
          try {
            await bot.telegram.sendMessage(session.chatId, msg)
          } catch (err) {
            console.error(
              `Failed to send notification to chat ${session.chatId}:`,
              err
            )
          }
        }
      } catch (err) {
        console.error("Order notification error:", err)
      }
    }
  )

  wmsEvents.on(
    WMS_EVENTS.SHIPMENT_STATUS_CHANGED,
    async (event: ShipmentStatusEvent) => {
      try {
        const sessions = await TelegramSession.find({ userId: event.userId })
        if (sessions.length === 0) return

        const emoji = STATUS_EMOJI[event.toStatus] || "🚚"
        const msg = [
          `${emoji} Shipment ${event.shipmentNumber} status changed`,
          `${event.fromStatus} → ${event.toStatus}`,
          `Order: ${event.orderNumber}`,
          event.carrier ? `Carrier: ${event.carrier}` : null,
          event.trackingNumber
            ? `Tracking: ${event.trackingNumber}`
            : null,
          "",
          `View: /shipment ${event.shipmentNumber}`,
        ]
          .filter(Boolean)
          .join("\n")

        for (const session of sessions) {
          try {
            await bot.telegram.sendMessage(session.chatId, msg)
          } catch (err) {
            console.error(
              `Failed to send notification to chat ${session.chatId}:`,
              err
            )
          }
        }
      } catch (err) {
        console.error("Shipment notification error:", err)
      }
    }
  )

  wmsEvents.on(
    WMS_EVENTS.PICK_LIST_COMPLETED,
    async (event: PickListEvent) => {
      try {
        const sessions = await TelegramSession.find({ userId: event.userId })
        if (sessions.length === 0) return

        const msg = [
          `✅ Pick list ${event.pickListNumber} completed`,
          `${event.itemCount} items picked`,
          "",
          `View: /pick ${event.pickListNumber}`,
        ].join("\n")

        for (const session of sessions) {
          try {
            await bot.telegram.sendMessage(session.chatId, msg)
          } catch (err) {
            console.error(
              `Failed to send notification to chat ${session.chatId}:`,
              err
            )
          }
        }
      } catch (err) {
        console.error("Pick list notification error:", err)
      }
    }
  )

  console.log("📱 Telegram notifications initialized")
}
