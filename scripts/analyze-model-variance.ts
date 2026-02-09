/**
 * Analyze variance in AI-generated hour estimates across different models.
 *
 * Queries daily_entries grouped by modelUsed. Compares average hoursRaw per
 * entry between primary and fallback models. Flags if variance exceeds 10%.
 *
 * Usage:
 *   cd web && npx tsx --tsconfig tsconfig.json ../scripts/analyze-model-variance.ts
 *
 * Non-destructive: reads only, never writes.
 */

import { createRequire } from 'module'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { config } from 'dotenv'

const __dir = dirname(fileURLToPath(import.meta.url))
const webRequire = createRequire(join(__dir, '..', 'web', 'package.json'))
const { PrismaClient } = webRequire('./src/generated/prisma/client')

config({ path: join(__dir, '..', 'web', '.env') })

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL! })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

// --- Helpers ---

function median(arr: number[]): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function stddev(arr: number[]): number {
  if (arr.length === 0) return 0
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length
  return Math.sqrt(arr.reduce((sum, v) => sum + (v - mean) ** 2, 0) / arr.length)
}

// --- Types ---

interface EntryData {
  id: string
  date: Date
  hoursRaw: number | null
  hoursEstimated: number | null
  modelUsed: string | null
  modelFallback: boolean
  projectId: string | null
  status: string
}

interface ModelStats {
  model: string
  isFallback: boolean
  entryCount: number
  totalHoursRaw: number
  meanHoursRaw: number
  medianHoursRaw: number
  stddevHoursRaw: number
  minHoursRaw: number
  maxHoursRaw: number
  totalHoursEstimated: number
  meanHoursEstimated: number
  dateRange: { first: string; last: string }
}

// --- Main ---

async function main() {
  console.log(`\n========================================`)
  console.log(`  Model Variance Analysis`)
  console.log(`  Flags >10% variance between models`)
  console.log(`========================================\n`)

  // Query all daily entries with model information
  const entries = await prisma.dailyEntry.findMany({
    where: {
      hoursRaw: { not: null },
      modelUsed: { not: null },
    },
    select: {
      id: true,
      date: true,
      hoursRaw: true,
      hoursEstimated: true,
      modelUsed: true,
      modelFallback: true,
      projectId: true,
      status: true,
    },
    orderBy: { date: 'asc' },
  }) as EntryData[]

  console.log(`Total entries with model data: ${entries.length}`)

  if (entries.length === 0) {
    console.log('\nNo entries with model data available.')
    await prisma.$disconnect()
    await pool.end()
    return
  }

  // --- Group by model ---
  const byModel = new Map<string, EntryData[]>()
  for (const entry of entries) {
    const model = entry.modelUsed ?? 'unknown'
    const existing = byModel.get(model) ?? []
    existing.push(entry)
    byModel.set(model, existing)
  }

  // --- Calculate stats per model ---
  const modelStats: ModelStats[] = []
  for (const [model, modelEntries] of byModel) {
    const hoursRawValues = modelEntries
      .map((e) => e.hoursRaw)
      .filter((h): h is number => h != null && h > 0)

    const hoursEstValues = modelEntries
      .map((e) => e.hoursEstimated)
      .filter((h): h is number => h != null)

    const dates = modelEntries.map((e) => e.date).sort((a, b) => a.getTime() - b.getTime())
    const isFallback = modelEntries.some((e) => e.modelFallback)

    if (hoursRawValues.length === 0) continue

    const totalRaw = hoursRawValues.reduce((a, b) => a + b, 0)
    const totalEst = hoursEstValues.reduce((a, b) => a + b, 0)

    modelStats.push({
      model,
      isFallback,
      entryCount: modelEntries.length,
      totalHoursRaw: totalRaw,
      meanHoursRaw: totalRaw / hoursRawValues.length,
      medianHoursRaw: median(hoursRawValues),
      stddevHoursRaw: stddev(hoursRawValues),
      minHoursRaw: Math.min(...hoursRawValues),
      maxHoursRaw: Math.max(...hoursRawValues),
      totalHoursEstimated: totalEst,
      meanHoursEstimated: hoursEstValues.length > 0 ? totalEst / hoursEstValues.length : 0,
      dateRange: {
        first: dates[0].toISOString().split('T')[0],
        last: dates[dates.length - 1].toISOString().split('T')[0],
      },
    })
  }

  // Sort: primary models first, then fallback
  modelStats.sort((a, b) => {
    if (a.isFallback !== b.isFallback) return a.isFallback ? 1 : -1
    return b.entryCount - a.entryCount // higher count first
  })

  // --- Per-Model Summary ---
  console.log(`\n${'='.repeat(90)}`)
  console.log(`PER-MODEL STATISTICS`)
  console.log(`${'='.repeat(90)}\n`)

  console.log(
    `  ${'Model'.padEnd(35)} ${'Type'.padEnd(10)} ${'Entries'.padEnd(8)} ` +
    `${'Mean(h)'.padEnd(10)} ${'Median'.padEnd(10)} ${'StdDev'.padEnd(10)} ` +
    `${'Range'.padEnd(14)} ${'Dates'.padEnd(24)}`
  )
  console.log(`  ${'-'.repeat(88)}`)

  for (const s of modelStats) {
    const type = s.isFallback ? 'fallback' : 'primary'
    const range = `${s.minHoursRaw.toFixed(1)}-${s.maxHoursRaw.toFixed(1)}`
    const dates = `${s.dateRange.first} to ${s.dateRange.last}`
    console.log(
      `  ${s.model.padEnd(35)} ${type.padEnd(10)} ${String(s.entryCount).padEnd(8)} ` +
      `${s.meanHoursRaw.toFixed(2).padStart(6)}${' '.repeat(4)} ` +
      `${s.medianHoursRaw.toFixed(2).padStart(6)}${' '.repeat(4)} ` +
      `${s.stddevHoursRaw.toFixed(2).padStart(6)}${' '.repeat(4)} ` +
      `${range.padEnd(14)} ${dates}`
    )
  }

  // --- Cross-Model Variance Analysis ---
  console.log(`\n${'='.repeat(90)}`)
  console.log(`CROSS-MODEL VARIANCE ANALYSIS`)
  console.log(`${'='.repeat(90)}`)

  if (modelStats.length < 2) {
    console.log(`\n  Only ${modelStats.length} model(s) found. Need at least 2 for cross-model comparison.`)
  } else {
    // Compare all pairs of models
    console.log(`\n  Pairwise comparison of mean hoursRaw per entry:\n`)

    const VARIANCE_THRESHOLD = 0.10 // 10%
    let flagged = false

    for (let i = 0; i < modelStats.length; i++) {
      for (let j = i + 1; j < modelStats.length; j++) {
        const a = modelStats[i]
        const b = modelStats[j]
        const avgMean = (a.meanHoursRaw + b.meanHoursRaw) / 2
        const diff = Math.abs(a.meanHoursRaw - b.meanHoursRaw)
        const variance = avgMean > 0 ? diff / avgMean : 0

        const status = variance > VARIANCE_THRESHOLD ? 'FLAGGED' : 'OK'
        const marker = variance > VARIANCE_THRESHOLD ? ' *** EXCEEDS 10% THRESHOLD ***' : ''

        console.log(`  ${a.model} vs ${b.model}`)
        console.log(`    ${a.model.padEnd(35)} mean: ${a.meanHoursRaw.toFixed(2)}h (n=${a.entryCount})`)
        console.log(`    ${b.model.padEnd(35)} mean: ${b.meanHoursRaw.toFixed(2)}h (n=${b.entryCount})`)
        console.log(`    Difference:${' '.repeat(21)} ${diff.toFixed(2)}h (${(variance * 100).toFixed(1)}%)  [${status}]${marker}`)
        console.log()

        if (variance > VARIANCE_THRESHOLD) flagged = true
      }
    }

    // --- Primary vs Fallback aggregate comparison ---
    const primaryStats = modelStats.filter((s) => !s.isFallback)
    const fallbackStats = modelStats.filter((s) => s.isFallback)

    if (primaryStats.length > 0 && fallbackStats.length > 0) {
      console.log(`  ${'='.repeat(70)}`)
      console.log(`  PRIMARY vs FALLBACK AGGREGATE`)
      console.log(`  ${'='.repeat(70)}\n`)

      const primaryTotalHours = primaryStats.reduce((sum, s) => sum + s.totalHoursRaw, 0)
      const primaryTotalEntries = primaryStats.reduce((sum, s) => sum + s.entryCount, 0)
      const primaryMean = primaryTotalEntries > 0 ? primaryTotalHours / primaryTotalEntries : 0

      const fallbackTotalHours = fallbackStats.reduce((sum, s) => sum + s.totalHoursRaw, 0)
      const fallbackTotalEntries = fallbackStats.reduce((sum, s) => sum + s.entryCount, 0)
      const fallbackMean = fallbackTotalEntries > 0 ? fallbackTotalHours / fallbackTotalEntries : 0

      const avgMean = (primaryMean + fallbackMean) / 2
      const diff = Math.abs(primaryMean - fallbackMean)
      const variance = avgMean > 0 ? diff / avgMean : 0

      console.log(`  Primary models:  ${primaryStats.map((s) => s.model).join(', ')}`)
      console.log(`    Total entries:    ${primaryTotalEntries}`)
      console.log(`    Mean hoursRaw:    ${primaryMean.toFixed(2)}h`)
      console.log()
      console.log(`  Fallback models: ${fallbackStats.map((s) => s.model).join(', ')}`)
      console.log(`    Total entries:    ${fallbackTotalEntries}`)
      console.log(`    Mean hoursRaw:    ${fallbackMean.toFixed(2)}h`)
      console.log()
      console.log(`  Aggregate Variance: ${(variance * 100).toFixed(1)}%`)

      if (variance > VARIANCE_THRESHOLD) {
        const higher = primaryMean > fallbackMean ? 'Primary' : 'Fallback'
        console.log(`  STATUS: FLAGGED - ${higher} model(s) estimate ${(variance * 100).toFixed(1)}% more hours on average`)
        console.log(`  RECOMMENDATION: Investigate whether fallback model's estimates need calibration`)
        flagged = true
      } else {
        console.log(`  STATUS: OK - Variance within 10% threshold`)
      }
    }

    // --- Overall verdict ---
    console.log(`\n${'='.repeat(90)}`)
    if (flagged) {
      console.log(`VERDICT: VARIANCE DETECTED - Some model pairs exceed the 10% threshold.`)
      console.log(`Action: Review the flagged comparisons above. Consider whether:`)
      console.log(`  1. Fallback model calibration needs adjustment`)
      console.log(`  2. Sample sizes are sufficient for meaningful comparison`)
      console.log(`  3. The models are being used for different types of workloads`)
    } else {
      console.log(`VERDICT: ALL CLEAR - No model pair exceeds the 10% variance threshold.`)
      console.log(`The primary and fallback models produce consistent hour estimates.`)
    }
    console.log(`${'='.repeat(90)}`)
  }

  // --- Per-date breakdown showing model used ---
  console.log(`\n${'='.repeat(90)}`)
  console.log(`DAILY MODEL USAGE BREAKDOWN (last 30 dates)`)
  console.log(`${'='.repeat(90)}\n`)

  const byDate = new Map<string, Map<string, { count: number; totalHours: number; fallback: boolean }>>()
  for (const entry of entries) {
    const dateStr = entry.date.toISOString().split('T')[0]
    const model = entry.modelUsed ?? 'unknown'
    if (!byDate.has(dateStr)) byDate.set(dateStr, new Map())
    const dateMap = byDate.get(dateStr)!
    const existing = dateMap.get(model) ?? { count: 0, totalHours: 0, fallback: false }
    existing.count++
    existing.totalHours += entry.hoursRaw ?? 0
    existing.fallback = existing.fallback || entry.modelFallback
    dateMap.set(model, existing)
  }

  const sortedDates = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-30)

  console.log(`  ${'Date'.padEnd(12)} ${'Entries'.padEnd(8)} ${'Total(h)'.padEnd(10)} Model(s) used`)
  console.log(`  ${'-'.repeat(80)}`)

  for (const [date, models] of sortedDates) {
    const totalEntries = [...models.values()].reduce((sum, m) => sum + m.count, 0)
    const totalHours = [...models.values()].reduce((sum, m) => sum + m.totalHours, 0)
    const modelList = [...models.entries()]
      .map(([name, data]) => {
        const fbLabel = data.fallback ? ' [FB]' : ''
        return `${name}(${data.count}/${data.totalHours.toFixed(1)}h${fbLabel})`
      })
      .join(', ')

    console.log(
      `  ${date.padEnd(12)} ${String(totalEntries).padEnd(8)} ${totalHours.toFixed(1).padStart(6)}h    ${modelList}`
    )
  }

  // --- Adjustment factor analysis ---
  console.log(`\n${'='.repeat(90)}`)
  console.log(`ADJUSTMENT FACTOR IMPACT`)
  console.log(`${'='.repeat(90)}\n`)

  const withAdjustment = entries.filter((e) => e.hoursRaw != null && e.hoursEstimated != null)
  if (withAdjustment.length > 0) {
    let totalRaw = 0
    let totalEstimated = 0
    for (const e of withAdjustment) {
      totalRaw += e.hoursRaw!
      totalEstimated += e.hoursEstimated!
    }

    const effectiveAdjustment = totalRaw > 0 ? totalEstimated / totalRaw : 1.0
    console.log(`  Entries with both hoursRaw and hoursEstimated: ${withAdjustment.length}`)
    console.log(`  Total hoursRaw:       ${totalRaw.toFixed(2)}h`)
    console.log(`  Total hoursEstimated: ${totalEstimated.toFixed(2)}h (after adjustment factor)`)
    console.log(`  Effective adjustment: ${(effectiveAdjustment * 100).toFixed(1)}%`)
    console.log(`  Net change:           ${((totalEstimated - totalRaw) >= 0 ? '+' : '')}${(totalEstimated - totalRaw).toFixed(2)}h`)
  } else {
    console.log(`  No entries with both hoursRaw and hoursEstimated available.`)
  }

  console.log(`\n========================================`)
  console.log(`  Analysis Complete`)
  console.log(`========================================\n`)

  await prisma.$disconnect()
  await pool.end()
}

main().catch(async (err) => {
  console.error('Fatal error:', err)
  await prisma.$disconnect()
  await pool.end()
  process.exit(1)
})
