import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

export interface SessionMetrics {
  sessionId: string
  projectPath: string
  startedAt: string | null
  endedAt: string | null
  durationSeconds: number | null
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  totalCacheCreateTokens: number
  messageCount: number
  toolUseCount: number
  model: string | null
  rawJsonlPath: string
}

interface JsonlRecord {
  type: string
  timestamp?: string
  message?: {
    role?: string
    content?: unknown
    model?: string
    usage?: {
      input_tokens?: number
      output_tokens?: number
      cache_read_input_tokens?: number
      cache_creation_input_tokens?: number
    }
  }
  isSidechain?: boolean
  [key: string]: unknown
}

/**
 * Stream-parse a Claude Code JSONL file and extract session metrics.
 * Only `user` and `assistant` records contribute to metrics.
 * Handles files up to 192MB+ by streaming line-by-line.
 */
export async function parseClaudeJsonl(filePath: string): Promise<SessionMetrics | null> {
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCacheReadTokens = 0
  let totalCacheCreateTokens = 0
  let messageCount = 0
  let toolUseCount = 0
  let model: string | null = null
  let minTimestamp: string | null = null
  let maxTimestamp: string | null = null
  let sessionId: string | null = null
  let projectPath: string | null = null
  let recordCount = 0

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  })

  for await (const line of rl) {
    if (!line.trim()) continue

    let record: JsonlRecord
    try {
      record = JSON.parse(line)
    } catch {
      continue // Skip malformed lines
    }

    recordCount++

    // Extract session ID from the file path (UUID portion of filename)
    if (!sessionId) {
      const match = filePath.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)
      sessionId = match?.[1] ?? filePath
    }

    // Extract project path from the directory structure
    // ~/.claude/projects/<encoded-path>/<session-id>.jsonl
    if (!projectPath) {
      const pathMatch = filePath.match(/\.claude\/projects\/([^/]+)\//)
      projectPath = pathMatch?.[1] ?? 'unknown'
    }

    // Only process user and assistant records for metrics
    if (record.type !== 'user' && record.type !== 'assistant') {
      continue
    }

    // Track timestamps
    if (record.timestamp) {
      if (!minTimestamp || record.timestamp < minTimestamp) {
        minTimestamp = record.timestamp
      }
      if (!maxTimestamp || record.timestamp > maxTimestamp) {
        maxTimestamp = record.timestamp
      }
    }

    if (record.type === 'user') {
      messageCount++
    }

    if (record.type === 'assistant') {
      messageCount++

      // Extract model
      if (record.message?.model && !model) {
        model = record.message.model
      }

      // Extract token usage
      const usage = record.message?.usage
      if (usage) {
        totalInputTokens += usage.input_tokens ?? 0
        totalOutputTokens += usage.output_tokens ?? 0
        totalCacheReadTokens += usage.cache_read_input_tokens ?? 0
        totalCacheCreateTokens += usage.cache_creation_input_tokens ?? 0
      }

      // Count tool_use blocks in content array
      const content = record.message?.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block && typeof block === 'object' && 'type' in block && block.type === 'tool_use') {
            toolUseCount++
          }
        }
      }
    }
  }

  // Empty or no meaningful records
  if (recordCount === 0 || messageCount === 0) {
    return null
  }

  // Calculate duration
  let durationSeconds: number | null = null
  if (minTimestamp && maxTimestamp) {
    const start = new Date(minTimestamp).getTime()
    const end = new Date(maxTimestamp).getTime()
    durationSeconds = Math.round((end - start) / 1000)
  }

  return {
    sessionId: sessionId!,
    projectPath: projectPath!,
    startedAt: minTimestamp,
    endedAt: maxTimestamp,
    durationSeconds,
    totalInputTokens,
    totalOutputTokens,
    totalCacheReadTokens,
    totalCacheCreateTokens,
    messageCount,
    toolUseCount,
    model,
    rawJsonlPath: filePath,
  }
}
