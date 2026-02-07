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
  provider: 'anthropic' | 'ollama'
  inputCostPer1M: number   // USD
  outputCostPer1M: number  // USD
  ollamaBaseUrl?: string
}

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
  {
    id: 'llama3.3:70b',
    name: 'Llama 3.3 70B (local)',
    provider: 'ollama',
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    ollamaBaseUrl: 'http://10.12.112.8:11434',
  },
  {
    id: 'qwen2.5-coder:7b',
    name: 'Qwen 2.5 Coder 7B (local)',
    provider: 'ollama',
    inputCostPer1M: 0,
    outputCostPer1M: 0,
    ollamaBaseUrl: 'http://10.12.112.8:11434',
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

// --- Helper: call Ollama model (native API, non-streaming) ---

async function callOllama(model: ModelConfig, prompt: string): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 300000) // 5 min timeout for 70B

  try {
    const res = await fetch(`${model.ollamaBaseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: model.id,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: { temperature: 0.3 },
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new Error(`Ollama returned ${res.status}: ${await res.text()}`)
    }

    const data = await res.json() as any
    // Native Ollama API: { message: { content }, prompt_eval_count, eval_count }
    return {
      text: data.message?.content ?? '',
      inputTokens: data.prompt_eval_count ?? 0,
      outputTokens: data.eval_count ?? 0,
    }
  } finally {
    clearTimeout(timeout)
  }
}

// --- Helper: parse AI response ---

function parseResponse(text: string): { entries: AIEntryResult[]; validJson: boolean; validSchema: boolean } {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) {
    return { entries: [], validJson: false, validSchema: false }
  }

  const jsonStr = jsonMatch[1] ?? jsonMatch[0]
  try {
    const entries = JSON.parse(jsonStr)
    if (!Array.isArray(entries)) {
      return { entries: [], validJson: true, validSchema: false }
    }

    // Validate schema
    const validSchema = entries.every((e: any) =>
      typeof e.projectName === 'string' &&
      typeof e.hoursEstimate === 'number' &&
      typeof e.phase === 'string' &&
      typeof e.capitalizable === 'boolean' &&
      typeof e.summary === 'string'
    )

    return { entries: entries as AIEntryResult[], validJson: true, validSchema }
  } catch {
    return { entries: [], validJson: false, validSchema: false }
  }
}

// --- Helper: check Ollama reachability ---

async function isOllamaReachable(baseUrl: string): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(`${baseUrl}/api/tags`, { signal: controller.signal })
    clearTimeout(timeout)
    return res.ok
  } catch {
    return false
  }
}

// --- Build test context from real DB data ---

async function buildTestContext(targetDate: string): Promise<DailyActivityContext | null> {
  const developer = await prisma.developer.findFirst({ where: { role: 'admin' } })
  if (!developer) {
    console.error('No admin developer found')
    return null
  }

  const dateObj = new Date(targetDate + 'T00:00:00Z')
  const nextDate = new Date(dateObj)
  nextDate.setDate(nextDate.getDate() + 1)

  const projects = await prisma.project.findMany({
    where: { status: { not: 'abandoned' }, monitored: true },
    include: {
      repos: { select: { repoPath: true } },
      claudePaths: { select: { claudePath: true, localPath: true } },
    },
  })

  const sessions = await prisma.rawSession.findMany({
    where: {
      developerId: developer.id,
      startedAt: { gte: dateObj, lt: nextDate },
    },
    orderBy: { startedAt: 'asc' },
  })

  const commits = await prisma.rawCommit.findMany({
    where: {
      developerId: developer.id,
      committedAt: { gte: dateObj, lt: nextDate },
    },
    orderBy: { committedAt: 'asc' },
  })

  if (sessions.length === 0 && commits.length === 0) {
    console.error(`No sessions or commits found for ${targetDate}`)
    return null
  }

  return {
    developer: { displayName: developer.displayName, email: developer.email },
    date: targetDate,
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      phase: p.phase,
      description: p.description,
      repos: p.repos,
      claudePaths: p.claudePaths,
    })),
    sessions: sessions.map((s) => ({
      sessionId: s.sessionId,
      projectPath: s.projectPath,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      durationSeconds: s.durationSeconds,
      totalInputTokens: s.totalInputTokens,
      totalOutputTokens: s.totalOutputTokens,
      messageCount: s.messageCount,
      toolUseCount: s.toolUseCount,
      model: s.model,
      toolBreakdown: (s.toolBreakdown as Record<string, number>) ?? null,
      filesReferenced: s.filesReferenced ?? [],
      firstUserPrompt: s.firstUserPrompt,
      userPromptCount: s.userPromptCount,
      activeWindow: (s as any).activeWindow ?? null,
      userPrompts: (s as any).userPrompts ?? undefined,
    })),
    commits: commits.map((c) => ({
      commitHash: c.commitHash,
      repoPath: c.repoPath,
      committedAt: c.committedAt,
      message: c.message,
      filesChanged: c.filesChanged,
      insertions: c.insertions,
      deletions: c.deletions,
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
      response = await callOllama(model, prompt)
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
    return {
      model,
      success: false,
      error: err.message,
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

  // Default to a recent date with good data
  const targetDate = dateArg ? args[args.indexOf(dateArg) + 1] : '2026-02-06'

  // Filter models if specified
  const modelFilter = modelsArg
    ? args[args.indexOf(modelsArg) + 1]?.split(',') ?? []
    : []

  console.log(`\n========================================`)
  console.log(`  AI Model Comparison Test`)
  console.log(`  Date: ${targetDate}`)
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

  console.log(`  Sessions: ${ctx.sessions.length}`)
  console.log(`  Commits: ${ctx.commits.length}`)
  console.log(`  Projects: ${ctx.projects.length}`)
  console.log(`  Prompt length: ${prompt.length} chars (~${promptTokenEstimate} tokens)`)
  console.log()

  // Determine which models to test
  let modelsToTest = MODELS
  if (modelFilter.length > 0) {
    modelsToTest = MODELS.filter((m) =>
      modelFilter.some((f) => m.id.toLowerCase().includes(f.toLowerCase()) || m.name.toLowerCase().includes(f.toLowerCase()))
    )
  }

  // Check Ollama reachability
  const ollamaModels = modelsToTest.filter((m) => m.provider === 'ollama')
  if (ollamaModels.length > 0) {
    const reachable = await isOllamaReachable(ollamaModels[0].ollamaBaseUrl!)
    if (!reachable) {
      console.log(`  [!] Ollama at ${ollamaModels[0].ollamaBaseUrl} is not reachable. Skipping local models.\n`)
      modelsToTest = modelsToTest.filter((m) => m.provider !== 'ollama')
    } else {
      console.log(`  [OK] Ollama server reachable\n`)
    }
  }

  if (modelsToTest.length === 0) {
    console.error('No models available to test.')
    await prisma.$disconnect()
    process.exit(1)
  }

  // Run tests sequentially (to avoid rate limits and get clean timing)
  const results: TestResult[] = []
  for (const model of modelsToTest) {
    console.log(`Testing: ${model.name} (${model.id})...`)
    const result = await testModel(model, prompt)
    results.push(result)

    if (result.success) {
      console.log(`  OK — ${result.latencyMs}ms | ${result.inputTokens}in/${result.outputTokens}out | $${result.costUSD.toFixed(4)} | ${result.projectsIdentified} entries | ${result.totalHours.toFixed(1)}h total`)
    } else {
      console.log(`  FAILED — ${result.error}`)
    }
  }

  // --- Summary table ---
  console.log(`\n${'='.repeat(120)}`)
  console.log(`RESULTS COMPARISON`)
  console.log(`${'='.repeat(120)}`)

  const header = [
    'Model'.padEnd(25),
    'Status'.padEnd(8),
    'Latency'.padEnd(10),
    'Tokens'.padEnd(14),
    'Cost'.padEnd(10),
    'JSON'.padEnd(6),
    'Schema'.padEnd(8),
    'Entries'.padEnd(8),
    'Hours'.padEnd(8),
    'Conf'.padEnd(6),
    'Reason'.padEnd(8),
  ].join('| ')
  console.log(header)
  console.log('-'.repeat(120))

  for (const r of results) {
    const row = [
      r.model.name.padEnd(25),
      (r.success ? 'OK' : 'FAIL').padEnd(8),
      (`${r.latencyMs}ms`).padEnd(10),
      (`${r.inputTokens}/${r.outputTokens}`).padEnd(14),
      (r.costUSD > 0 ? `$${r.costUSD.toFixed(4)}` : 'FREE').padEnd(10),
      (r.validJson ? 'Y' : 'N').padEnd(6),
      (r.validSchema ? 'Y' : 'N').padEnd(8),
      String(r.projectsIdentified).padEnd(8),
      (`${r.totalHours.toFixed(1)}h`).padEnd(8),
      (`${(r.avgConfidence * 100).toFixed(0)}%`).padEnd(6),
      (r.hasReasoning ? 'Y' : 'N').padEnd(8),
    ].join('| ')
    console.log(row)
  }

  // --- Detailed entry comparison ---
  const successfulResults = results.filter((r) => r.success && r.entries.length > 0)
  if (successfulResults.length > 1) {
    console.log(`\n${'='.repeat(120)}`)
    console.log(`ENTRY-LEVEL COMPARISON`)
    console.log(`${'='.repeat(120)}`)

    // Find all unique project names across all results
    const allProjects = new Set<string>()
    for (const r of successfulResults) {
      for (const e of r.entries) allProjects.add(e.projectName)
    }

    for (const project of allProjects) {
      console.log(`\n  Project: ${project}`)
      console.log(`  ${'—'.repeat(80)}`)
      for (const r of successfulResults) {
        const entry = r.entries.find((e) => e.projectName === project)
        if (entry) {
          console.log(`  ${r.model.name.padEnd(25)} | ${entry.hoursEstimate}h | ${entry.phase} | conf: ${(entry.confidence * 100).toFixed(0)}%`)
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
  for (const r of results.filter((r) => r.success)) {
    const dailyCost = r.costUSD
    const monthlyCost = dailyCost * 22 // working days
    const label = r.model.provider === 'ollama' ? 'FREE (electricity only)' : `$${monthlyCost.toFixed(2)}/mo`
    console.log(`  ${r.model.name.padEnd(25)} | per call: $${dailyCost.toFixed(4)} | monthly: ${label}`)
  }

  // --- Write detailed results to file ---
  const outputPath = `/tmp/model-comparison-${targetDate}.json`
  const outputData = results.map((r) => ({
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
