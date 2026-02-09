/**
 * Analyze active-time-to-wall-clock ratios from raw_sessions dailyBreakdown data.
 *
 * Queries all raw_sessions that have dailyBreakdown entries with both
 * activeMinutes and wallClockMinutes. Calculates:
 * - Active-time-to-wall-clock ratio for each session-day
 * - Mean, median, std dev of the ratio distribution
 * - Histogram in 10% buckets from 0-100%
 * - Comparison to the 60% fallback constant (used when active time is unavailable)
 * - Rounding bias: sum of pre-rounded hours vs post-rounded hours
 *
 * Usage:
 *   cd web && npx tsx --tsconfig tsconfig.json ../scripts/analyze-active-time.ts
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

/** Round minutes to nearest 0.25 hours (matches activeMinutesToHours in production). */
function roundToQuarterHours(minutes: number): number {
  return Math.round((minutes / 60) * 4) / 4
}

// --- Types ---

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
}

interface DataPoint {
  sessionId: string
  date: string
  activeMinutes: number
  wallClockMinutes: number
  ratio: number // activeMinutes / wallClockMinutes
}

// --- Main ---

async function main() {
  console.log(`\n========================================`)
  console.log(`  Active Time Analysis`)
  console.log(`  Validates the 60% fallback constant`)
  console.log(`========================================\n`)

  // Query all raw_sessions that have dailyBreakdown
  const sessions = await prisma.rawSession.findMany({
    where: {
      dailyBreakdown: { not: null },
    },
    select: {
      sessionId: true,
      dailyBreakdown: true,
      durationSeconds: true,
    },
  }) as Array<{
    sessionId: string
    dailyBreakdown: DailyBreakdownEntry[] | null
    durationSeconds: number | null
  }>

  console.log(`Total sessions with dailyBreakdown: ${sessions.length}`)

  // Extract data points: each session-day with both activeMinutes and wallClockMinutes > 0
  const dataPoints: DataPoint[] = []
  let skippedZeroWall = 0
  let skippedMissing = 0

  for (const session of sessions) {
    const breakdown = session.dailyBreakdown
    if (!Array.isArray(breakdown)) continue

    for (const day of breakdown) {
      if (day.activeMinutes == null || day.wallClockMinutes == null) {
        skippedMissing++
        continue
      }
      if (day.wallClockMinutes === 0) {
        skippedZeroWall++
        continue
      }

      const ratio = day.activeMinutes / day.wallClockMinutes
      dataPoints.push({
        sessionId: session.sessionId,
        date: day.date,
        activeMinutes: day.activeMinutes,
        wallClockMinutes: day.wallClockMinutes,
        ratio: Math.min(ratio, 1.0), // cap at 100% (active can't exceed wall clock)
      })
    }
  }

  console.log(`Session-day data points with both metrics: ${dataPoints.length}`)
  console.log(`Skipped (missing activeMinutes/wallClockMinutes): ${skippedMissing}`)
  console.log(`Skipped (wallClockMinutes = 0): ${skippedZeroWall}`)

  if (dataPoints.length === 0) {
    console.log('\nNo data points available for analysis.')
    await prisma.$disconnect()
    await pool.end()
    return
  }

  // --- Basic statistics ---
  const ratios = dataPoints.map((d) => d.ratio)
  const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length
  const med = median(ratios)
  const sd = stddev(ratios)
  const min = Math.min(...ratios)
  const max = Math.max(...ratios)

  console.log(`\n--- Active/Wall-Clock Ratio Distribution ---`)
  console.log(`  N:           ${dataPoints.length}`)
  console.log(`  Mean:        ${(mean * 100).toFixed(1)}%`)
  console.log(`  Median:      ${(med * 100).toFixed(1)}%`)
  console.log(`  Std Dev:     ${(sd * 100).toFixed(1)}%`)
  console.log(`  Min:         ${(min * 100).toFixed(1)}%`)
  console.log(`  Max:         ${(max * 100).toFixed(1)}%`)

  // --- Comparison to 60% fallback ---
  const FALLBACK_RATIO = 0.6
  const diffFromFallback = mean - FALLBACK_RATIO
  console.log(`\n--- Comparison to 60% Fallback Constant ---`)
  console.log(`  Fallback:    60.0%`)
  console.log(`  Actual mean: ${(mean * 100).toFixed(1)}%`)
  console.log(`  Difference:  ${diffFromFallback >= 0 ? '+' : ''}${(diffFromFallback * 100).toFixed(1)} percentage points`)
  if (Math.abs(diffFromFallback) < 0.05) {
    console.log(`  Assessment:  Fallback is well-calibrated (within 5pp of actual mean)`)
  } else if (diffFromFallback > 0) {
    console.log(`  Assessment:  Fallback UNDERESTIMATES active time — actual developers are more active than assumed`)
  } else {
    console.log(`  Assessment:  Fallback OVERESTIMATES active time — actual developers are less active than assumed`)
  }

  // --- Histogram (10% buckets) ---
  console.log(`\n--- Histogram (10% buckets) ---`)
  const buckets = Array.from({ length: 10 }, () => 0)
  for (const r of ratios) {
    const bucket = Math.min(Math.floor(r * 10), 9)
    buckets[bucket]++
  }

  const maxBucketCount = Math.max(...buckets)
  const barScale = maxBucketCount > 0 ? 50 / maxBucketCount : 1

  for (let i = 0; i < 10; i++) {
    const lo = i * 10
    const hi = (i + 1) * 10
    const count = buckets[i]
    const pct = ((count / dataPoints.length) * 100).toFixed(1)
    const bar = '#'.repeat(Math.round(count * barScale))
    const label = `${String(lo).padStart(3)}%-${String(hi).padStart(3)}%`
    const fallbackMarker = (i === 5) ? '  <-- 60% fallback bucket' : ''
    console.log(`  ${label} | ${String(count).padStart(5)} (${pct.padStart(5)}%) ${bar}${fallbackMarker}`)
  }

  // --- Rounding bias analysis ---
  // Compare sum of raw (unrounded) hours vs sum of quarter-hour-rounded hours
  console.log(`\n--- Rounding Bias Analysis ---`)
  console.log(`  (Compares sum of raw active hours vs. sum after 0.25h rounding)`)

  let totalRawHours = 0
  let totalRoundedHours = 0
  let roundingDiffs: number[] = []

  for (const dp of dataPoints) {
    const rawHours = dp.activeMinutes / 60
    const roundedHours = roundToQuarterHours(dp.activeMinutes)
    totalRawHours += rawHours
    totalRoundedHours += roundedHours
    roundingDiffs.push(roundedHours - rawHours)
  }

  const roundingBias = totalRoundedHours - totalRawHours
  const roundingBiasPct = totalRawHours > 0 ? (roundingBias / totalRawHours * 100) : 0
  const meanRoundingDiff = roundingDiffs.reduce((a, b) => a + b, 0) / roundingDiffs.length
  const medianRoundingDiff = median(roundingDiffs)

  console.log(`  Total raw active hours:     ${totalRawHours.toFixed(2)}h`)
  console.log(`  Total rounded hours:        ${totalRoundedHours.toFixed(2)}h`)
  console.log(`  Net rounding bias:          ${roundingBias >= 0 ? '+' : ''}${roundingBias.toFixed(2)}h (${roundingBiasPct >= 0 ? '+' : ''}${roundingBiasPct.toFixed(2)}%)`)
  console.log(`  Mean per-entry rounding:    ${meanRoundingDiff >= 0 ? '+' : ''}${(meanRoundingDiff * 60).toFixed(1)} minutes`)
  console.log(`  Median per-entry rounding:  ${medianRoundingDiff >= 0 ? '+' : ''}${(medianRoundingDiff * 60).toFixed(1)} minutes`)

  if (Math.abs(roundingBiasPct) < 1) {
    console.log(`  Assessment:  Rounding bias is negligible (<1%)`)
  } else if (roundingBias > 0) {
    console.log(`  Assessment:  Quarter-hour rounding inflates total hours by ${roundingBiasPct.toFixed(1)}%`)
  } else {
    console.log(`  Assessment:  Quarter-hour rounding deflates total hours by ${Math.abs(roundingBiasPct).toFixed(1)}%`)
  }

  // --- Also analyze using wall-clock time with 60% fallback ---
  console.log(`\n--- Fallback vs Actual Comparison (Total Hours) ---`)
  console.log(`  If we used wallClock * 60% for all sessions vs. actual activeMinutes:`)

  let totalFallbackHours = 0
  let totalActualActiveHours = 0

  for (const dp of dataPoints) {
    totalFallbackHours += (dp.wallClockMinutes * FALLBACK_RATIO) / 60
    totalActualActiveHours += dp.activeMinutes / 60
  }

  const fallbackDiff = totalFallbackHours - totalActualActiveHours
  const fallbackDiffPct = totalActualActiveHours > 0 ? (fallbackDiff / totalActualActiveHours * 100) : 0

  console.log(`  Actual active hours:        ${totalActualActiveHours.toFixed(2)}h`)
  console.log(`  Fallback-estimated hours:   ${totalFallbackHours.toFixed(2)}h`)
  console.log(`  Difference:                 ${fallbackDiff >= 0 ? '+' : ''}${fallbackDiff.toFixed(2)}h (${fallbackDiffPct >= 0 ? '+' : ''}${fallbackDiffPct.toFixed(1)}%)`)

  // --- Per-date summary (show a few examples) ---
  console.log(`\n--- Sample Data Points (first 20) ---`)
  console.log(`  ${'Date'.padEnd(12)} ${'Session'.padEnd(10)} ${'Active'.padEnd(8)} ${'Wall'.padEnd(8)} ${'Ratio'.padEnd(8)} ${'Rounded'.padEnd(8)}`)
  console.log(`  ${'-'.repeat(60)}`)

  const sortedPoints = [...dataPoints].sort((a, b) => a.date.localeCompare(b.date))
  for (const dp of sortedPoints.slice(0, 20)) {
    const rounded = roundToQuarterHours(dp.activeMinutes)
    console.log(
      `  ${dp.date.padEnd(12)} ${dp.sessionId.slice(0, 8).padEnd(10)} ` +
      `${(dp.activeMinutes + 'm').padEnd(8)} ${(dp.wallClockMinutes + 'm').padEnd(8)} ` +
      `${((dp.ratio * 100).toFixed(0) + '%').padEnd(8)} ${(rounded + 'h').padEnd(8)}`
    )
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
