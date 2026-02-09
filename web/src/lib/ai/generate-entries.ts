import { completeWithFallback } from './client'
import { buildDailyEntryPrompt, type DailyActivityContext, type AIEntryResult } from './prompts'

export interface GenerationResult {
  entries: AIEntryResult[]
  modelUsed: string
  fallback: boolean
}

/**
 * Call AI to analyze daily activity and generate entry suggestions.
 * Tries local model first, falls back to Anthropic Haiku on error.
 */
export async function generateDailyEntries(
  ctx: DailyActivityContext,
  historicalStats?: {
    avgHoursPerDay: number
    avgProjectsPerDay: number
    confirmedDays: number
    periodDays: number
  },
): Promise<GenerationResult> {
  // If no activity, skip the AI call
  if (ctx.sessions.length === 0 && ctx.commits.length === 0) {
    return { entries: [], modelUsed: 'none', fallback: false }
  }

  const prompt = buildDailyEntryPrompt(ctx, historicalStats)
  const result = await completeWithFallback(prompt)

  const entries = parseAIResponse(result.text)

  return {
    entries,
    modelUsed: result.modelUsed,
    fallback: result.fallback,
  }
}

/**
 * Parse JSON entry array from AI response text.
 * Handles both raw JSON and ```json code blocks.
 */
function parseAIResponse(text: string): AIEntryResult[] {
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
