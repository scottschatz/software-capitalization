/**
 * Model comparison test for daily entry generation.
 *
 * Tests the same prompt against multiple models and compares:
 * - Response quality (valid JSON, correct schema)
 * - Hour estimates (reasonableness)
 * - Phase classification accuracy
 * - Description quality
 * - Latency and token usage
 * - Cost per call
 *
 * Usage:
 *   npx tsx scripts/test-models.ts                    # Test all reachable models
 *   npx tsx scripts/test-models.ts --date 2026-02-06  # Test with specific date's data
 *   npx tsx scripts/test-models.ts --models haiku,sonnet  # Test specific models only
 *
 * Non-destructive: reads from DB, never writes. All results go to stdout/file.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createRequire } from 'module'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

// Load Prisma from the web workspace where it's generated
const __dir = dirname(fileURLToPath(import.meta.url))
const webRequire = createRequire(join(__dir, '..', 'web', 'package.json'))
const { PrismaClient } = webRequire('./src/generated/prisma/client')

// Import prompts (TSX resolves TS imports fine)
import { buildDailyEntryPrompt, type DailyActivityContext, type AIEntryResult } from '../web/src/lib/ai/prompts'

// Load DATABASE_URL from web/.env
import { config } from 'dotenv'
config({ path: join(__dir, '..', 'web', '.env') })

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL! })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// --- Model definitions ---

interface ModelConfig {
  id: string
  name: string
  provider: 'anthropic' | 'local'
  inputCostPer1M: number   // USD
  outputCostPer1M: number  // USD
  localBaseUrl?: string
  // Match patterns: if the model ID from the server contains any of these, use this config
  matchPatterns?: string[]
}

const LOCAL_SERVER = 'http://10.12.112.8:11434'

const MODELS: ModelConfig[] = [
  {
    id: 'claude-haiku-4-5-20251001',
    name: 'Claude Haiku 4.5',
    provider: 'anthropic',
    inputCostPer1M: 1.00,
    outputCostPer1M: 5.00,
  },
  {
    id: 'claude-sonnet-4-5-20250929',
    name: 'Claude Sonnet 4.5',
    provider: 'anthropic',
    inputCostPer1M: 3.00,
    outputCostPer1M: 15.00,
  },
  {
    id: 'claude-opus-4-6',
    name: 'Claude Opus 4.6',
    provider: 'anthropic',
    inputCostPer1M: 5.00,
    outputCostPer1M: 25.00,
  },
  // --- Local models (LM Studio on Mac Studio M4 Max 128GB) ---
  // IDs are auto-resolved from the server's /v1/models endpoint.
  // matchPatterns help match server model IDs to our config entries.
  {
    id: 'qwen3-32b',
    name: 'Qwen3 32B (local)',
    provider: 'local',
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    localBaseUrl: LOCAL_SERVER,
    matchPatterns: ['qwen3-32b', 'qwen/qwen3-32b', 'qwen3:32b'],
  },
  // Qwen 2.5 72B removed — overestimates hours, slower than Qwen3 32B, unloaded
  // Llama 4 Scout, Qwen 2.5 72B, Phi-4 removed — not loaded
  {
    id: 'gpt-oss-20b',
    name: 'GPT-OSS 20B (local)',
    provider: 'local',
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    localBaseUrl: LOCAL_SERVER,
    matchPatterns: ['gpt-oss-20b', 'openai/gpt-oss-20b', 'gpt-oss:20b'],
  },
  {
    id: 'gpt-oss-120b',
    name: 'GPT-OSS 120B (local)',
    provider: 'local',
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    localBaseUrl: LOCAL_SERVER,
    matchPatterns: ['gpt-oss-120b', 'openai/gpt-oss-120b', 'gpt-oss:120b'],
  },
]

// --- Test result types ---

interface TestResult {
  model: ModelConfig
  success: boolean
  error?: string
  latencyMs: number
  inputTokens: number
  outputTokens: number
  costUSD: number
  entries: AIEntryResult[]
  validJson: boolean
  validSchema: boolean
  totalHours: number
  projectsIdentified: number
  avgConfidence: number
  hasReasoning: boolean
  rawResponse?: string
}

// --- Helper: call Anthropic model ---

async function callAnthropic(model: ModelConfig, prompt: string): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const response = await client.messages.create({
    model: model.id,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  })

  const textBlock = response.content.find((b) => b.type === 'text')
  return {
    text: textBlock?.type === 'text' ? textBlock.text : '',
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  }
}

// --- JSON Schema for structured output (OpenAI response_format) ---

const ENTRY_SCHEMA = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'daily_entries',
    strict: true,
    schema: {
      type: 'object',
      required: ['entries'],
      additionalProperties: false,
      properties: {
        entries: {
          type: 'array',
          items: {
            type: 'object',
            required: ['projectId', 'projectName', 'summary', 'hoursEstimate', 'confidence', 'reasoning'],
            additionalProperties: false,
            properties: {
              projectId:              { type: ['string', 'null'] },
              projectName:            { type: 'string' },
              summary:                { type: 'string' },
              hoursEstimate:          { type: 'number' },
              confidence:             { type: 'number' },
              reasoning:              { type: 'string' },
              phaseSuggestion:        { type: ['string', 'null'] },
              enhancementSuggested:   { type: 'boolean' },
              enhancementReason:      { type: ['string', 'null'] },
            },
          },
        },
      },
    },
  },
}

// --- Helper: call local model via OpenAI-compatible API (LM Studio / Ollama /v1) ---

// Global flag: when true, Qwen3 models use thinking mode instead of /nothink
let enableThinking = false

async function callLocal(model: ModelConfig, prompt: string, maxRetries = 3): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  // Qwen3 models have thinking mode by default. Unless --think flag is set,
  // prepend /nothink to disable it — our task needs structured JSON.
  const isQwen3 = model.id.toLowerCase().includes('qwen3')
  const needsNothink = isQwen3 && !enableThinking
  const finalPrompt = needsNothink ? `/nothink\n${prompt}` : prompt

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 300000) // 5 min timeout for large models

    try {
      const res = await fetch(`${model.localBaseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model.id,
          messages: [{ role: 'user', content: finalPrompt }],
          temperature: 0.1,
          max_tokens: 2048,
          stream: false,
        }),
        signal: controller.signal,
      })

      if (!res.ok) {
        throw new Error(`Local server returned ${res.status}: ${await res.text()}`)
      }

      const data = await res.json() as any
      let text: string = data.choices?.[0]?.message?.content ?? ''
      // Strip <think>...</think> blocks that some models emit (Qwen3, DeepSeek, etc.)
      text = text.replace(/<think>[\s\S]*?<\/think>\s*/g, '')
      return {
        text,
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      }
    } catch (err: any) {
      clearTimeout(timeout)
      const isSocketError = err.message?.includes('fetch failed') || err.cause?.toString().includes('SocketError')
      if (isSocketError && attempt < maxRetries) {
        console.log(`    Attempt ${attempt}/${maxRetries} failed (connection dropped), retrying in 3s...`)
        await new Promise((r) => setTimeout(r, 3000))
        continue
      }
      throw err
    } finally {
      clearTimeout(timeout)
    }
  }
  throw new Error('All retry attempts exhausted')
}

// --- Helper: parse AI response ---

function parseResponse(text: string): { entries: AIEntryResult[]; validJson: boolean; validSchema: boolean } {
  // Try structured output format first: { "entries": [...] }
  // Then try markdown-wrapped JSON, then raw JSON array
  let jsonStr: string | undefined

  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.entries)) {
      // Structured output: { entries: [...] }
      const validSchema = parsed.entries.every((e: any) =>
        typeof e.projectName === 'string' &&
        typeof e.hoursEstimate === 'number' &&
        typeof e.summary === 'string' &&
        typeof e.confidence === 'number'
      )
      return { entries: parsed.entries as AIEntryResult[], validJson: true, validSchema }
    }
    if (Array.isArray(parsed)) {
      jsonStr = text
    }
  } catch {
    // Not raw JSON — try extracting from markdown
  }

  if (!jsonStr) {
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) {
      return { entries: [], validJson: false, validSchema: false }
    }
    jsonStr = jsonMatch[1] ?? jsonMatch[0]
  }

  try {
    const entries = JSON.parse(jsonStr)
    if (!Array.isArray(entries)) {
      return { entries: [], validJson: true, validSchema: false }
    }

    // Validate schema
    const validSchema = entries.every((e: any) =>
      typeof e.projectName === 'string' &&
      typeof e.hoursEstimate === 'number' &&
      typeof e.summary === 'string' &&
      typeof e.confidence === 'number'
    )

    return { entries: entries as AIEntryResult[], validJson: true, validSchema }
  } catch {
    return { entries: [], validJson: false, validSchema: false }
  }
}

// --- Helper: check local server reachability + resolve model IDs ---

async function isLocalServerReachable(baseUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(`${baseUrl}/v1/models`, { signal: controller.signal })
    clearTimeout(timeout)
    return res.ok
  } catch {
    return false
  }
}

/** Query /v1/models and resolve each local model config to the actual server model ID. */
async function resolveLocalModelIds(baseUrl: string, models: ModelConfig[]): Promise<void> {
  try {
    const res = await fetch(`${baseUrl}/v1/models`)
    if (!res.ok) return
    const data = await res.json() as any
    const serverModels: string[] = (data.data ?? []).map((m: any) => m.id as string)

    if (serverModels.length > 0) {
      console.log(`  Available models on server: ${serverModels.join(', ')}`)
    }

    for (const model of models) {
      if (model.provider !== 'local') continue

      // Try exact match first
      if (serverModels.includes(model.id)) continue

      // Try match patterns
      const patterns = model.matchPatterns ?? []
      const match = serverModels.find((sid) => {
        const sidLower = sid.toLowerCase()
        return patterns.some((p) => sidLower.includes(p.toLowerCase()))
      })

      if (match) {
        console.log(`  Resolved ${model.name}: "${model.id}" → "${match}"`)
        model.id = match
      }
    }
  } catch {
    // Non-fatal — will use configured IDs as-is
  }
}

// --- Timezone-aware day bounds (matches production generate-daily-entries.ts) ---

const DAY_TZ = process.env.CAP_TIMEZONE ?? 'America/New_York'

/** Get UTC timestamps for the start and end of a calendar day in local timezone. */
function getLocalDayBounds(dateStr: string): { startOfDay: Date; endOfDay: Date } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: DAY_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })

  const refDate = new Date(`${dateStr}T12:00:00Z`) // noon UTC to avoid DST edge
  const parts = formatter.formatToParts(refDate)
  const getPart = (type: string) => parts.find(p => p.type === type)?.value ?? '0'
  const tzHour = parseInt(getPart('hour'))
  const tzDay = parseInt(getPart('day'))
  const utcDay = refDate.getUTCDate()

  let offsetHours: number
  if (tzDay === utcDay) {
    offsetHours = tzHour - 12
  } else if (tzDay > utcDay) {
    offsetHours = tzHour - 12 + 24
  } else {
    offsetHours = tzHour - 12 - 24
  }

  const startOfDay = new Date(`${dateStr}T00:00:00Z`)
  startOfDay.setUTCHours(startOfDay.getUTCHours() - offsetHours)

  const endOfDay = new Date(`${dateStr}T23:59:59.999Z`)
  endOfDay.setUTCHours(endOfDay.getUTCHours() - offsetHours)

  return { startOfDay, endOfDay }
}

// --- Build test context from real DB data ---
// Matches production generate-daily-entries.ts: timezone-aware day bounds,
// overlapping session query, per-day dailyBreakdown extraction, and tool events.

async function buildTestContext(targetDate: string): Promise<DailyActivityContext | null> {
  const developer = await prisma.developer.findFirst({ where: { role: 'admin' } })
  if (!developer) {
    console.error('No admin developer found')
    return null
  }

  const { startOfDay, endOfDay } = getLocalDayBounds(targetDate)

  const projects = await prisma.project.findMany({
    where: { status: { not: 'abandoned' }, monitored: true },
    include: {
      repos: { select: { repoPath: true } },
      claudePaths: { select: { claudePath: true, localPath: true } },
    },
  })

  // Match production: sessions that OVERLAP the target date (not just started on it)
  // Sessions can span multiple days; include any that were active during the target date.
  const sessions = await prisma.rawSession.findMany({
    where: {
      developerId: developer.id,
      startedAt: { lte: endOfDay },
      OR: [
        { endedAt: { gte: startOfDay } },
        { endedAt: null, startedAt: { gte: startOfDay } },
      ],
    },
    orderBy: { startedAt: 'asc' },
  })

  const commits = await prisma.rawCommit.findMany({
    where: {
      developerId: developer.id,
      committedAt: { gte: startOfDay, lte: endOfDay },
    },
    orderBy: { committedAt: 'asc' },
  })

  // Fetch real-time tool events from hooks (matching production)
  const toolEvents = await prisma.rawToolEvent.findMany({
    where: {
      developerId: developer.id,
      timestamp: { gte: startOfDay, lte: endOfDay },
    },
    select: {
      toolName: true,
      projectPath: true,
      toolInput: true,
      timestamp: true,
    },
    orderBy: { timestamp: 'asc' },
  })

  if (sessions.length === 0 && commits.length === 0 && toolEvents.length === 0) {
    console.error(`No sessions, commits, or tool events found for ${targetDate}`)
    return null
  }

  // Extract per-day breakdown from dailyBreakdown (matches production lines 167-212)
  // This gives the AI accurate per-day metrics, active time window, and timestamped transcripts.
  interface DailyBreakdownEntry {
    date: string
    firstTimestamp?: string
    lastTimestamp?: string
    activeMinutes?: number
    wallClockMinutes?: number
    messageCount: number
    toolUseCount: number
    userPromptCount: number
    userPromptSamples: string[]
    userPrompts?: Array<{ time: string; text: string }>
  }

  const mappedSessions = sessions.map((s: any) => {
    const breakdown = s.dailyBreakdown as DailyBreakdownEntry[] | null
    const dayData = breakdown?.find((d: DailyBreakdownEntry) => d.date === targetDate)

    return {
      sessionId: s.sessionId,
      projectPath: s.projectPath,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      durationSeconds: s.durationSeconds,
      totalInputTokens: s.totalInputTokens,
      totalOutputTokens: s.totalOutputTokens,
      // Use per-day counts when available, fall back to session totals
      messageCount: dayData?.messageCount ?? s.messageCount,
      toolUseCount: dayData?.toolUseCount ?? s.toolUseCount,
      model: s.model,
      toolBreakdown: (s.toolBreakdown as Record<string, number>) ?? null,
      filesReferenced: s.filesReferenced ?? [],
      firstUserPrompt: s.firstUserPrompt,
      userPromptCount: dayData?.userPromptCount ?? s.userPromptCount,
      userPromptSamples: dayData?.userPromptSamples ?? [],
      // Time window and full timestamped transcript from dailyBreakdown
      activeWindow: dayData?.firstTimestamp && dayData?.lastTimestamp
        ? {
            first: dayData.firstTimestamp,
            last: dayData.lastTimestamp,
            minutes: dayData.activeMinutes ?? 0,
            wallClockMinutes: dayData.wallClockMinutes ?? 0,
          }
        : null,
      userPrompts: dayData?.userPrompts ?? [],
    }
  })

  return {
    developer: { displayName: developer.displayName, email: developer.email },
    date: targetDate,
    projects: projects.map((p: any) => ({
      id: p.id,
      name: p.name,
      phase: p.phase,
      description: p.description,
      goLiveDate: p.goLiveDate ?? null,
      parentProjectId: p.parentProjectId ?? null,
      enhancementLabel: p.enhancementLabel ?? null,
      repos: p.repos,
      claudePaths: p.claudePaths,
    })),
    sessions: mappedSessions,
    commits: commits.map((c: any) => ({
      commitHash: c.commitHash,
      repoPath: c.repoPath,
      committedAt: c.committedAt,
      message: c.message,
      filesChanged: c.filesChanged,
      insertions: c.insertions,
      deletions: c.deletions,
    })),
    toolEvents: toolEvents.map((e: any) => ({
      toolName: e.toolName,
      projectPath: e.projectPath,
      timestamp: e.timestamp,
      filePath: (e.toolInput as Record<string, unknown> | null)?.file_path as string | undefined,
    })),
  }
}

// --- Run a single model test ---

async function testModel(model: ModelConfig, prompt: string): Promise<TestResult> {
  const start = Date.now()

  try {
    let response: { text: string; inputTokens: number; outputTokens: number }

    if (model.provider === 'anthropic') {
      response = await callAnthropic(model, prompt)
    } else {
      response = await callLocal(model, prompt)
    }

    const latencyMs = Date.now() - start
    const { entries, validJson, validSchema } = parseResponse(response.text)

    const cost =
      (response.inputTokens / 1_000_000) * model.inputCostPer1M +
      (response.outputTokens / 1_000_000) * model.outputCostPer1M

    const totalHours = entries.reduce((sum, e) => sum + (e.hoursEstimate ?? 0), 0)
    const avgConfidence =
      entries.length > 0
        ? entries.reduce((sum, e) => sum + (e.confidence ?? 0), 0) / entries.length
        : 0
    const hasReasoning = entries.every((e) => typeof e.reasoning === 'string' && e.reasoning.length > 10)

    return {
      model,
      success: true,
      latencyMs,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      costUSD: cost,
      entries,
      validJson,
      validSchema,
      totalHours,
      projectsIdentified: entries.length,
      avgConfidence,
      hasReasoning,
      rawResponse: response.text,
    }
  } catch (err: any) {
    const cause = err.cause ? ` [cause: ${err.cause}]` : ''
    return {
      model,
      success: false,
      error: `${err.message}${cause}`,
      latencyMs: Date.now() - start,
      inputTokens: 0,
      outputTokens: 0,
      costUSD: 0,
      entries: [],
      validJson: false,
      validSchema: false,
      totalHours: 0,
      projectsIdentified: 0,
      avgConfidence: 0,
      hasReasoning: false,
    }
  }
}

// --- Main ---

async function main() {
  const args = process.argv.slice(2)
  const dateArg = args.find((a) => a.startsWith('--date'))
  const modelsArg = args.find((a) => a.startsWith('--models'))

  // --think: enable Qwen3 thinking mode (default: disabled via /nothink)
  enableThinking = args.includes('--think')

  // --runs N: run each model N times for variability analysis (default: 1)
  const runsArg = args.find((a) => a.startsWith('--runs'))
  const numRuns = runsArg ? parseInt(args[args.indexOf(runsArg) + 1]) || 1 : 1

  // Default to a recent date with good data
  const targetDate = dateArg ? args[args.indexOf(dateArg) + 1] : '2026-02-06'

  // Filter models if specified
  const modelFilter = modelsArg
    ? args[args.indexOf(modelsArg) + 1]?.split(',') ?? []
    : []

  console.log(`\n========================================`)
  console.log(`  AI Model Comparison Test`)
  console.log(`  Date: ${targetDate}`)
  console.log(`  Temperature: 0.1`)
  console.log(`  Runs per model: ${numRuns}`)
  if (enableThinking) console.log(`  Qwen3 thinking mode: ENABLED`)
  console.log(`========================================\n`)

  // Build the test prompt from real data
  console.log('Building test prompt from database...')
  const ctx = await buildTestContext(targetDate)
  if (!ctx) {
    console.error('Failed to build test context. Exiting.')
    await prisma.$disconnect()
    process.exit(1)
  }

  const prompt = buildDailyEntryPrompt(ctx)
  const promptTokenEstimate = Math.round(prompt.length / 4) // rough estimate

  const totalUserPrompts = ctx.sessions.reduce((sum, s) => sum + (s.userPromptCount ?? 0), 0)
  const sessionsWithTranscript = ctx.sessions.filter(s => s.userPrompts && s.userPrompts.length > 0).length
  const totalActiveMinutes = ctx.sessions.reduce((sum, s) => sum + (s.activeWindow?.minutes ?? 0), 0)

  console.log(`  Sessions: ${ctx.sessions.length}`)
  console.log(`  Commits: ${ctx.commits.length}`)
  console.log(`  Projects: ${ctx.projects.length}`)
  console.log(`  Tool events: ${ctx.toolEvents?.length ?? 0}`)
  console.log(`  User prompts (per-day): ${totalUserPrompts}${sessionsWithTranscript > 0 ? ` (${sessionsWithTranscript} session(s) with timestamped transcript)` : ' (no dailyBreakdown data)'}`)
  console.log(`  Active time (per-day): ${(totalActiveMinutes / 60).toFixed(1)}h (gap-aware)`)
  console.log(`  Prompt length: ${prompt.length} chars (~${promptTokenEstimate} tokens)`)
  console.log()

  // Determine which models to test
  let modelsToTest = MODELS
  if (modelFilter.length > 0) {
    modelsToTest = MODELS.filter((m) =>
      modelFilter.some((f) => m.id.toLowerCase().includes(f.toLowerCase()) || m.name.toLowerCase().includes(f.toLowerCase()))
    )
  }

  // Check local server reachability (LM Studio / Ollama) and resolve model IDs
  const localModels = modelsToTest.filter((m) => m.provider === 'local')
  if (localModels.length > 0) {
    const reachable = await isLocalServerReachable(localModels[0].localBaseUrl!)
    if (!reachable) {
      console.log(`  [!] Local server at ${localModels[0].localBaseUrl} is not reachable. Skipping local models.\n`)
      modelsToTest = modelsToTest.filter((m) => m.provider !== 'local')
    } else {
      console.log(`  [OK] Local model server reachable`)
      await resolveLocalModelIds(localModels[0].localBaseUrl!, modelsToTest)
      console.log()
    }
  }

  if (modelsToTest.length === 0) {
    console.error('No models available to test.')
    await prisma.$disconnect()
    process.exit(1)
  }

  // Run tests sequentially (to avoid rate limits and get clean timing)
  // When --runs N is specified, run each model N times for variability analysis
  const allResults: TestResult[] = []
  const resultsByModel = new Map<string, TestResult[]>()

  for (const model of modelsToTest) {
    const modelRuns: TestResult[] = []
    for (let run = 1; run <= numRuns; run++) {
      const runLabel = numRuns > 1 ? ` (run ${run}/${numRuns})` : ''
      console.log(`Testing: ${model.name}${runLabel}...`)
      const result = await testModel(model, prompt)
      allResults.push(result)
      modelRuns.push(result)

      if (result.success) {
        const perProject = result.entries.map((e) => `${e.projectName}:${e.hoursEstimate}h`).join(', ')
        console.log(`  OK — ${result.latencyMs}ms | ${result.totalHours.toFixed(1)}h total | ${perProject}`)
      } else {
        console.log(`  FAILED — ${result.error}`)
      }
    }
    resultsByModel.set(model.id, modelRuns)
  }

  // --- Summary table (show all runs) ---
  console.log(`\n${'='.repeat(120)}`)
  console.log(`RESULTS COMPARISON${numRuns > 1 ? ` (${numRuns} runs per model)` : ''}`)
  console.log(`${'='.repeat(120)}`)

  const header = [
    'Model'.padEnd(25),
    'Run'.padEnd(5),
    'Status'.padEnd(8),
    'Latency'.padEnd(10),
    'Tokens'.padEnd(14),
    'Cost'.padEnd(10),
    'Entries'.padEnd(8),
    'Hours'.padEnd(8),
    'Conf'.padEnd(6),
  ].join('| ')
  console.log(header)
  console.log('-'.repeat(120))

  for (const r of allResults) {
    const runIdx = resultsByModel.get(r.model.id)!.indexOf(r) + 1
    const row = [
      r.model.name.padEnd(25),
      (`#${runIdx}`).padEnd(5),
      (r.success ? 'OK' : 'FAIL').padEnd(8),
      (`${r.latencyMs}ms`).padEnd(10),
      (`${r.inputTokens}/${r.outputTokens}`).padEnd(14),
      (r.costUSD > 0 ? `$${r.costUSD.toFixed(4)}` : 'FREE').padEnd(10),
      String(r.projectsIdentified).padEnd(8),
      (`${r.totalHours.toFixed(1)}h`).padEnd(8),
      (`${(r.avgConfidence * 100).toFixed(0)}%`).padEnd(6),
    ].join('| ')
    console.log(row)
  }

  // --- Variability analysis (when multiple runs) ---
  if (numRuns > 1) {
    console.log(`\n${'='.repeat(120)}`)
    console.log(`VARIABILITY ANALYSIS (${numRuns} runs)`)
    console.log(`${'='.repeat(120)}`)

    const stddev = (arr: number[]) => {
      const mean = arr.reduce((a, b) => a + b, 0) / arr.length
      return Math.sqrt(arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / arr.length)
    }

    for (const [modelId, runs] of resultsByModel) {
      const successRuns = runs.filter((r) => r.success)
      if (successRuns.length === 0) continue

      const model = successRuns[0].model
      const totalHours = successRuns.map((r) => r.totalHours)
      const latencies = successRuns.map((r) => r.latencyMs)
      const mean = totalHours.reduce((a, b) => a + b, 0) / totalHours.length
      const sd = stddev(totalHours)
      const cv = mean > 0 ? (sd / mean * 100) : 0 // coefficient of variation

      console.log(`\n  ${model.name} (${successRuns.length}/${runs.length} successful)`)
      console.log(`  ${'—'.repeat(80)}`)
      console.log(`  Total hours: ${totalHours.map((h) => h.toFixed(1)).join(', ')}`)
      console.log(`  Mean: ${mean.toFixed(2)}h | StdDev: ${sd.toFixed(2)}h | CV: ${cv.toFixed(1)}% | Range: ${Math.min(...totalHours).toFixed(1)}-${Math.max(...totalHours).toFixed(1)}h`)
      console.log(`  Latency: mean ${Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)}ms | range ${Math.min(...latencies)}-${Math.max(...latencies)}ms`)

      // Per-project variability
      const allProjects = new Set<string>()
      for (const r of successRuns) {
        for (const e of r.entries) allProjects.add(e.projectName)
      }

      for (const project of allProjects) {
        const hours = successRuns
          .map((r) => r.entries.find((e) => e.projectName === project)?.hoursEstimate ?? null)
          .filter((h): h is number => h !== null)
        if (hours.length === 0) continue
        const pMean = hours.reduce((a, b) => a + b, 0) / hours.length
        const pSd = stddev(hours)
        const pCv = pMean > 0 ? (pSd / pMean * 100) : 0
        const detected = `${hours.length}/${successRuns.length}`
        console.log(`    ${project.padEnd(30)} | ${hours.map((h) => h.toFixed(1)).join(', ').padEnd(30)} | mean: ${pMean.toFixed(2)}h | sd: ${pSd.toFixed(2)} | cv: ${pCv.toFixed(0)}% | detected: ${detected}`)
      }
    }
  }

  // --- Detailed entry comparison (first run of each model, or single run) ---
  const firstRunPerModel = Array.from(resultsByModel.values()).map((runs) => runs[0]).filter((r) => r.success && r.entries.length > 0)
  if (firstRunPerModel.length > 1) {
    console.log(`\n${'='.repeat(120)}`)
    console.log(`ENTRY-LEVEL COMPARISON (first run)`)
    console.log(`${'='.repeat(120)}`)

    const allProjects = new Set<string>()
    for (const r of firstRunPerModel) {
      for (const e of r.entries) allProjects.add(e.projectName)
    }

    for (const project of allProjects) {
      console.log(`\n  Project: ${project}`)
      console.log(`  ${'—'.repeat(80)}`)
      for (const r of firstRunPerModel) {
        const entry = r.entries.find((e) => e.projectName === project)
        if (entry) {
          console.log(`  ${r.model.name.padEnd(25)} | ${entry.hoursEstimate}h | ${entry.phaseSuggestion ?? 'n/a'} | conf: ${(entry.confidence * 100).toFixed(0)}%`)
          console.log(`  ${''.padEnd(25)} | ${entry.summary.slice(0, 100)}`)
        } else {
          console.log(`  ${r.model.name.padEnd(25)} | (not detected)`)
        }
      }
    }
  }

  // --- Cost projection ---
  console.log(`\n${'='.repeat(120)}`)
  console.log(`COST PROJECTION (30 days, 1 developer, avg 5 entries/day)`)
  console.log(`${'='.repeat(120)}`)
  // Use first successful run per model
  for (const [, runs] of resultsByModel) {
    const r = runs.find((r) => r.success)
    if (!r) continue
    const dailyCost = r.costUSD
    const monthlyCost = dailyCost * 22 // working days
    const label = r.model.provider === 'local' ? 'FREE (electricity only)' : `$${monthlyCost.toFixed(2)}/mo`
    console.log(`  ${r.model.name.padEnd(25)} | per call: $${dailyCost.toFixed(4)} | monthly: ${label}`)
  }

  // --- Write detailed results to file ---
  const outputPath = `/tmp/model-comparison-${targetDate}.json`
  const outputData = allResults.map((r) => ({
    ...r,
    rawResponse: r.rawResponse?.slice(0, 5000), // truncate for readability
  }))
  const fs = await import('fs')
  fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2))
  console.log(`\nDetailed results written to: ${outputPath}`)

  await prisma.$disconnect()
}

main().catch(async (err) => {
  console.error('Fatal error:', err)
  await prisma.$disconnect()
  process.exit(1)
})
