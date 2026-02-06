import { getAIClient } from './client'
import { buildDailyEntryPrompt, type DailyActivityContext, type AIEntryResult } from './prompts'

/**
 * Call Claude to analyze daily activity and generate entry suggestions.
 */
export async function generateDailyEntries(
  ctx: DailyActivityContext
): Promise<AIEntryResult[]> {
  // If no activity, skip the AI call
  if (ctx.sessions.length === 0 && ctx.commits.length === 0) {
    return []
  }

  const client = getAIClient()
  const prompt = buildDailyEntryPrompt(ctx)

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  // Extract text content
  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    return []
  }

  // Parse JSON from response (may be wrapped in ```json blocks)
  const text = textBlock.text
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    return []
  }

  const jsonStr = jsonMatch[1] ?? jsonMatch[0]
  try {
    const entries = JSON.parse(jsonStr) as AIEntryResult[]
    return Array.isArray(entries) ? entries : []
  } catch {
    return []
  }
}
