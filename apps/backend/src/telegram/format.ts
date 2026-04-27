/** Escape HTML special characters for Telegram HTML parse mode */
export function h(text: string | number): string {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

export function bold(text: string | number): string {
  return `<b>${h(text)}</b>`
}

export function italic(text: string | number): string {
  return `<i>${h(text)}</i>`
}

export function code(text: string | number): string {
  return `<code>${h(text)}</code>`
}

export function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function pctBar(pct: number): string {
  const filled = Math.round(pct / 10)
  return "▓".repeat(filled) + "░".repeat(10 - filled)
}

export const HTML = { parse_mode: "HTML" as const }
