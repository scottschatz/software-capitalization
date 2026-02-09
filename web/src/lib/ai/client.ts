import Anthropic from '@anthropic-ai/sdk'

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
}

export interface CompletionOptions {
  maxTokens?: number   // default 2048
  jsonMode?: boolean   // default true
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

/**
 * Try local model first, fall back to Anthropic Haiku on error.
 * Returns the response text and metadata about which model was used.
 */
export async function completeWithFallback(prompt: string, options?: CompletionOptions): Promise<AICompletionResult> {
  const local = getLocalConfig()
  const maxTokens = options?.maxTokens ?? 2048
  const jsonMode = options?.jsonMode ?? true

  // Try local model first
  if (local.enabled) {
    try {
      const result = await callLocalModel(prompt, local.baseUrl, local.model, maxTokens, jsonMode)
      return result
    } catch (err) {
      console.warn(
        `Local model failed (${local.model} at ${local.baseUrl}): ${err instanceof Error ? err.message : err}. Falling back to ${FALLBACK_MODEL}.`
      )
    }
  }

  // Fallback to Anthropic Haiku
  return callAnthropicModel(prompt, FALLBACK_MODEL, maxTokens)
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
  }
}
