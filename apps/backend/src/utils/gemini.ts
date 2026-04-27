import { GoogleGenAI } from "@google/genai"

const GEMINI_MODEL = "gemini-2.0-flash"

export async function callGemini(
  contents: string,
  config: { temperature?: number; maxOutputTokens?: number } = {},
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw Object.assign(new Error("Missing GEMINI_API_KEY"), { noKey: true })

  const ai = new GoogleGenAI({ apiKey })
  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents,
      config: {
        temperature: config.temperature ?? 0.4,
        maxOutputTokens: config.maxOutputTokens ?? 3000,
      },
    })
    return response.text ?? ""
  } catch (err: any) {
    const status = err?.status ?? err?.code
    if (status === 429 || status === 503) {
      const rateLimitErr = new Error("Gemini API rate limit reached")
      Object.assign(rateLimitErr, { status: 429, rateLimited: true })
      throw rateLimitErr
    }
    throw err
  }
}
