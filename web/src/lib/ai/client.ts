import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/prisma'

let _anthropicClient: Anthropic | null = null

function getAnthropicClient(): Anthropic {
  if (!_anthropicClient) {
    _anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }
  return _anthropicClient
}

export interface AICompletionResult {
  text: string
  modelUsed: string
  fallback: boolean
  inputTokens: number
  outputTokens: number
  retryCount: number     // how many retries were needed (0 = first attempt worked)
}

export interface CompletionOptions {
  maxTokens?: number   // default 2048
  jsonMode?: boolean   // default true
  targetDate?: string  // date being processed (for logging)
  prompt?: string      // prompt type: generation | classification | executive_summary
}

/**
 * Local model config — OpenAI-compatible API (LM Studio, Ollama, etc.)
 */
function getLocalConfig() {
  return {
    baseUrl: process.env.AI_LOCAL_URL ?? 'http://10.12.112.8:11434',
    model: process.env.AI_LOCAL_MODEL ?? 'qwen/qwen3-32b',
    enabled: process.env.AI_LOCAL_ENABLED !== 'false', // enabled by default
  }
}

const FALLBACK_MODEL = process.env.AI_FALLBACK_MODEL ?? 'claude-haiku-4-5-20251001'
const MAX_RETRIES = 3
const RETRY_DELAY_MS = 2000
const CIRCUIT_BREAKER_COOLDOWN_MS = 30 * 60 * 1000 // 30 minutes

/**
 * Circuit breaker: check if we should skip retries due to consecutive failures.
 *
 * Returns:
 * - 'normal'     → try local with full retries
 * - 'skip'       → skip retries, go straight to fallback (model appears down)
 * - 'probe'      → try local once (single attempt, no retries) to see if it recovered
 */
async function getCircuitState(promptType: string): Promise<'normal' | 'skip' | 'probe'> {
  try {
    const recentEvents = await prisma.modelEvent.findMany({
      where: {
        prompt: promptType,
        eventType: { in: ['success', 'fallback'] },
      },
      orderBy: { timestamp: 'desc' },
      take: 5,
      select: { eventType: true, timestamp: true },
    })

    // Not enough history — run normally
    if (recentEvents.length < 3) return 'normal'

    const consecutiveFallbacks = recentEvents.every(e => e.eventType === 'fallback')
    if (!consecutiveFallbacks) return 'normal'

    // All recent calls were fallbacks — check when the last attempt was
    const lastAttemptTime = recentEvents[0].timestamp.getTime()
    const elapsed = Date.now() - lastAttemptTime

    if (elapsed >= CIRCUIT_BREAKER_COOLDOWN_MS) {
      // Cooldown expired — probe once to see if local model recovered
      console.warn(`[model-health] ${recentEvents.length} consecutive fallbacks, but ${Math.round(elapsed / 60000)}min since last attempt — probing local model once`)
      return 'probe'
    }

    console.warn(`[model-health] ${recentEvents.length} consecutive fallbacks (last ${Math.round(elapsed / 60000)}min ago) — skipping retries, going straight to ${FALLBACK_MODEL}`)
    return 'skip'
  } catch {
    return 'normal'
  }
}

/**
 * Log a model event for health tracking.
 */
async function logModelEvent(event: {
  eventType: string
  modelAttempted: string
  modelUsed?: string
  targetDate?: string
  errorMessage?: string
  attempt?: number
  latencyMs?: number
  prompt?: string
}): Promise<void> {
  try {
    await prisma.modelEvent.create({
      data: {
        eventType: event.eventType,
        modelAttempted: event.modelAttempted,
        modelUsed: event.modelUsed ?? null,
        targetDate: event.targetDate ?? null,
        errorMessage: event.errorMessage ?? null,
        attempt: event.attempt ?? null,
        latencyMs: event.latencyMs ?? null,
        prompt: event.prompt ?? 'generation',
      },
    })
  } catch {
    // Non-critical — don't let logging failures break generation
  }
}

/**
 * Try local model first, fall back to Anthropic Haiku on error.
 * Returns the response text and metadata about which model was used.
 *
 * Smart fallback: If the local model has failed on 3+ consecutive calls,
 * skip retries and go straight to Haiku to avoid wasting time.
 */
export async function completeWithFallback(prompt: string, options?: CompletionOptions): Promise<AICompletionResult> {
  const local = getLocalConfig()
  const maxTokens = options?.maxTokens ?? 2048
  const jsonMode = options?.jsonMode ?? true
  const targetDate = options?.targetDate
  const promptType = options?.prompt ?? 'generation'

  // Try local model first (with retry on transient failures)
  if (local.enabled) {
    const circuitState = await getCircuitState(promptType)

    if (circuitState === 'skip') {
      // Model appears down and cooldown hasn't expired — go straight to fallback
      await logModelEvent({
        eventType: 'fallback',
        modelAttempted: local.model,
        modelUsed: FALLBACK_MODEL,
        targetDate,
        errorMessage: 'Circuit breaker open — skipped retries',
        prompt: promptType,
      })
    } else {
      // 'normal' = full retries, 'probe' = single attempt to test recovery
      const maxAttempts = circuitState === 'probe' ? 1 : MAX_RETRIES

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const startTime = Date.now()
        try {
          const result = await callLocalModel(prompt, local.baseUrl, local.model, maxTokens, jsonMode)

          await logModelEvent({
            eventType: 'success',
            modelAttempted: local.model,
            modelUsed: local.model,
            targetDate,
            attempt,
            latencyMs: Date.now() - startTime,
            prompt: promptType,
          })

          if (circuitState === 'probe') {
            console.log(`[model-health] Probe succeeded — local model is back online`)
          }

          return { ...result, retryCount: attempt - 1 }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          const latencyMs = Date.now() - startTime
          const isLastAttempt = attempt === maxAttempts

          await logModelEvent({
            eventType: isLastAttempt ? 'fallback' : 'retry',
            modelAttempted: local.model,
            modelUsed: isLastAttempt ? FALLBACK_MODEL : undefined,
            targetDate,
            errorMessage: errMsg,
            attempt,
            latencyMs,
            prompt: promptType,
          })

          if (isLastAttempt) {
            const context = circuitState === 'probe' ? 'Probe failed' : `Local model failed after ${maxAttempts} attempts`
            console.warn(
              `${context} (${local.model} at ${local.baseUrl}): ${errMsg}. Falling back to ${FALLBACK_MODEL}.`
            )
          } else {
            console.warn(
              `Local model attempt ${attempt}/${maxAttempts} failed: ${errMsg}. Retrying in ${RETRY_DELAY_MS / 1000}s...`
            )
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
          }
        }
      }
    }
  }

  // Fallback to Anthropic Haiku
  const startTime = Date.now()
  const result = await callAnthropicModel(prompt, FALLBACK_MODEL, maxTokens)

  if (local.enabled) {
    // Only log if we actually tried local first (not just disabled)
    // The fallback event was already logged above in the retry loop
  }

  return { ...result, retryCount: 0 }
}

/**
 * Call a local OpenAI-compatible model (LM Studio, Ollama, vLLM, etc.)
 */
async function callLocalModel(
  prompt: string,
  baseUrl: string,
  model: string,
  maxTokens: number = 2048,
  jsonMode: boolean = true,
): Promise<AICompletionResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 180_000) // 3 min timeout

  try {
    // Don't send response_format — many local model APIs (vLLM, Ollama) don't support
    // json_object mode. We validate JSON output below and fall back to Haiku if invalid.
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      throw new Error(`HTTP ${response.status}: ${errText.slice(0, 200)}`)
    }

    const data = await response.json()
    let text = data.choices?.[0]?.message?.content ?? ''

    if (!text.trim()) {
      throw new Error('Empty response from local model')
    }

    // Strip <think>...</think> blocks (Qwen3, DeepSeek-R1, etc.)
    text = text.replace(/<think>[\s\S]*?<\/think>\s*/g, '').trim()

    // Strip <|...|> special tokens (gpt-oss, vLLM control tokens)
    text = text.replace(/<\|[^|]*\|>/g, '').trim()

    // Validate that we got parseable JSON back (skip when not in JSON mode)
    if (jsonMode) {
      const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\[[\s\S]*\]/) || text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) {
        throw new Error('Local model did not return valid JSON — triggering fallback')
      }
    }

    return {
      text,
      modelUsed: model,
      fallback: false,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      retryCount: 0,
    }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Call Anthropic API (Haiku fallback or any Anthropic model).
 */
async function callAnthropicModel(
  prompt: string,
  model: string,
  maxTokens: number = 2048,
): Promise<AICompletionResult> {
  const client = getAnthropicClient()

  const response = await client.messages.create({
    model,
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }],
  })

  const textBlock = response.content.find((b) => b.type === 'text')
  const text = textBlock?.type === 'text' ? textBlock.text : ''

  return {
    text,
    modelUsed: model,
    fallback: true,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    retryCount: 0,
  }
}
