import { createReadStream } from 'node:fs'
import { createInterface } from 'node:readline'

// Day boundaries use the developer's local timezone so "Feb 6" means
// midnight-to-midnight Eastern, not UTC. Configurable via CAP_TIMEZONE env var.
const DAY_TZ = process.env.CAP_TIMEZONE ?? 'America/New_York'

/** Convert a UTC ISO timestamp to a YYYY-MM-DD string in the configured timezone. */
function utcToLocalDate(isoTimestamp: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DAY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(isoTimestamp))
}

export interface DailyBreakdown {
  date: string              // YYYY-MM-DD (in local timezone)
  firstTimestamp: string    // ISO UTC — first message this calendar day
  lastTimestamp: string     // ISO UTC — last message this calendar day
  activeMinutes: number     // gap-aware active time (only intervals < 15min between messages)
  wallClockMinutes: number  // total span from first to last message
  messageCount: number
  toolUseCount: number
  userPromptCount: number   // real human prompts (not system-injected)
  userPromptSamples: string[] // legacy — kept for backward compat
  userPrompts: Array<{ time: string; text: string }> // every real human prompt with UTC timestamp
}

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
  // Enhanced fields (Phase 5)
  toolBreakdown: Record<string, number>  // e.g. { "Edit": 12, "Bash": 8 }
  filesReferenced: string[]              // unique file paths from tool_use inputs
  userPromptCount: number
  firstUserPrompt: string | null         // first 200 chars of first real user message
  // Per-day breakdown (for multi-day sessions)
  dailyBreakdown: DailyBreakdown[]
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
 * Extract real human-typed text from a user record's content.
 * Skips system-injected messages (XML tags, context continuations, tool results).
 */
function extractHumanText(content: unknown): string | null {
  if (typeof content === 'string') {
    // String content: skip system-injected (starts with <) and continuations
    if (!content || content.startsWith('<') || content.startsWith('This session is being continued')) {
      return null
    }
    return content.slice(0, 200)
  }

  if (Array.isArray(content)) {
    // Array content: find text blocks that are real human input
    for (const block of content) {
      if (block && typeof block === 'object' && 'type' in block && block.type === 'text') {
        const text = ('text' in block ? String(block.text) : '').trim()
        if (!text || text.startsWith('<') || text.startsWith('This session is being continued')) {
          continue
        }
        // Skip very long text blocks (likely tool results or system context)
        if (text.length > 500) continue
        return text.slice(0, 200)
      }
    }
  }

  return null
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
  // Enhanced fields
  const toolBreakdown: Record<string, number> = {}
  const filesReferencedSet = new Set<string>()
  let userPromptCount = 0
  let firstUserPrompt: string | null = null
  // Per-day tracking
  const dailyMap = new Map<string, {
    msgs: number; tools: number; realPrompts: number;
    samples: string[]; // legacy (first 10)
    prompts: Array<{ time: string; text: string }>; // full timestamped transcript
    firstTs: string | null; lastTs: string | null;
    allTimestamps: number[]; // epoch ms — for gap-aware active time calc
  }>()

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

    // Track timestamps — convert to local timezone for day bucketing
    const day = record.timestamp ? utcToLocalDate(record.timestamp) : null
    if (record.timestamp) {
      if (!minTimestamp || record.timestamp < minTimestamp) {
        minTimestamp = record.timestamp
      }
      if (!maxTimestamp || record.timestamp > maxTimestamp) {
        maxTimestamp = record.timestamp
      }
    }

    // Get or create daily bucket
    if (day) {
      if (!dailyMap.has(day)) {
        dailyMap.set(day, { msgs: 0, tools: 0, realPrompts: 0, samples: [], prompts: [], firstTs: null, lastTs: null, allTimestamps: [] })
      }
    }
    const dailyBucket = day ? dailyMap.get(day)! : null

    // Track per-day first/last timestamp and all timestamps for gap analysis
    if (dailyBucket && record.timestamp) {
      if (!dailyBucket.firstTs || record.timestamp < dailyBucket.firstTs) {
        dailyBucket.firstTs = record.timestamp
      }
      if (!dailyBucket.lastTs || record.timestamp > dailyBucket.lastTs) {
        dailyBucket.lastTs = record.timestamp
      }
      dailyBucket.allTimestamps.push(new Date(record.timestamp).getTime())
    }

    if (record.type === 'user') {
      messageCount++
      userPromptCount++
      if (dailyBucket) dailyBucket.msgs++

      // Extract real human prompt text
      const humanText = extractHumanText(record.message?.content)
      if (humanText) {
        if (firstUserPrompt === null) {
          firstUserPrompt = humanText
        }
        if (dailyBucket) {
          dailyBucket.realPrompts++
          if (dailyBucket.samples.length < 10) {
            dailyBucket.samples.push(humanText)
          }
          // Full timestamped transcript — every real human prompt
          if (record.timestamp) {
            dailyBucket.prompts.push({ time: record.timestamp, text: humanText })
          }
        }
      }
    }

    if (record.type === 'assistant') {
      messageCount++
      if (dailyBucket) dailyBucket.msgs++

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

      // Count tool_use blocks and extract tool breakdown + file paths
      const content = record.message?.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block && typeof block === 'object' && 'type' in block && block.type === 'tool_use') {
            toolUseCount++
            if (dailyBucket) dailyBucket.tools++
            // Track tool breakdown
            const toolName = 'name' in block ? String(block.name) : 'unknown'
            toolBreakdown[toolName] = (toolBreakdown[toolName] || 0) + 1
            // Extract file paths from tool input
            if ('input' in block && block.input && typeof block.input === 'object') {
              const input = block.input as Record<string, unknown>
              for (const key of ['file_path', 'path', 'notebook_path']) {
                if (typeof input[key] === 'string' && input[key]) {
                  filesReferencedSet.add(input[key] as string)
                }
              }
              // Extract file path from command (basic heuristic for Bash)
              if (typeof input.command === 'string') {
                const cmdPaths = input.command.match(/(?:^|\s)(\/[\w./-]+\.\w+)/g)
                if (cmdPaths) {
                  for (const p of cmdPaths) {
                    filesReferencedSet.add(p.trim())
                  }
                }
              }
            }
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

  // Build daily breakdown with gap-aware active time
  const GAP_THRESHOLD_MS = 15 * 60 * 1000 // 15 minutes — gaps larger than this are treated as breaks
  const dailyBreakdown: DailyBreakdown[] = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, data]) => {
      let wallClockMinutes = 0
      let activeMinutes = 0
      if (data.firstTs && data.lastTs) {
        wallClockMinutes = Math.round((new Date(data.lastTs).getTime() - new Date(data.firstTs).getTime()) / 60000)
      }
      // Gap-aware active time: sort timestamps, sum only intervals < threshold
      if (data.allTimestamps.length > 1) {
        const sorted = [...data.allTimestamps].sort((a, b) => a - b)
        let activeMs = 0
        for (let i = 1; i < sorted.length; i++) {
          const gap = sorted[i] - sorted[i - 1]
          if (gap < GAP_THRESHOLD_MS) {
            activeMs += gap
          }
        }
        activeMinutes = Math.round(activeMs / 60000)
      }
      return {
        date,
        firstTimestamp: data.firstTs ?? '',
        lastTimestamp: data.lastTs ?? '',
        activeMinutes,
        wallClockMinutes,
        messageCount: data.msgs,
        toolUseCount: data.tools,
        userPromptCount: data.realPrompts,
        userPromptSamples: data.samples,
        userPrompts: data.prompts,
      }
    })

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
    toolBreakdown,
    filesReferenced: [...filesReferencedSet],
    userPromptCount,
    firstUserPrompt,
    dailyBreakdown,
  }
}
