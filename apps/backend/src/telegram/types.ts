import { Context } from "telegraf"

export interface BotContext extends Context {
  wmsUser?: {
    id: string
    email: string
    name: string
    isAdmin?: boolean
  }
}

export interface ConversationState {
  command: string
  step: number
  data: Record<string, any>
  expiresAt: number
}

export const conversations = new Map<number, ConversationState>()

const CONVERSATION_TTL = 10 * 60 * 1000 // 10 min

export function setConversation(
  chatId: number,
  command: string,
  step: number,
  data: Record<string, any> = {}
) {
  conversations.set(chatId, {
    command,
    step,
    data,
    expiresAt: Date.now() + CONVERSATION_TTL,
  })
}

export function getConversation(chatId: number): ConversationState | null {
  const state = conversations.get(chatId)
  if (!state) return null
  if (Date.now() > state.expiresAt) {
    conversations.delete(chatId)
    return null
  }
  return state
}

export function clearConversation(chatId: number) {
  conversations.delete(chatId)
}
