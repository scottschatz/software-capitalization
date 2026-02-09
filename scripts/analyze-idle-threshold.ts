/**
 * Analyze the effect of idle threshold on active time calculation.
 *
 * The JSONL parser computes activeMinutes using a 15-minute idle threshold:
 * consecutive event gaps >= 15min are treated as breaks and excluded from active time.
 * The web-side active-time.ts uses a 5-minute threshold for real-time tool events.
 *
 * This script:
 * - Reports the existing 15-min threshold data from dailyBreakdown as baseline
 * - Shows what active time would be at different thresholds IF the data were available
 * - Since re-computing at other thresholds (5, 10, 20, 30 min) requires re-processing
 *   the raw JSONL files, this script documents the limitation and shows the 15-min
 *   baseline data with analysis of how sensitive the results might be
 *
 * Usage:
 *   cd web && npx tsx --tsconfig tsconfig.json ../scripts/analyze-idle-threshold.ts
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
  userPrompts?: Array<{ time: string; text: string }>
}

interface SessionData {
  sessionId: string
  durationSeconds: number | null
  dailyBreakdown: DailyBreakdownEntry[] | null
}

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

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

// --- Main ---

async function main() {
  console.log(`\n========================================`)
  console.log(`  Idle Threshold Sensitivity Analysis`)
  console.log(`========================================\n`)

  console.log(`NOTE: The JSONL parser computes activeMinutes with a fixed 15-minute idle`)
  console.log(`threshold. Recalculating at other thresholds (5, 10, 20, 30 min) would`)
  console.log(`require re-processing the raw JSONL session files, which is outside the`)
  console.log(`scope of this database-only analysis. This script reports the 15-minute`)
  console.log(`baseline and provides sensitivity estimates.\n`)

  // Query all raw_sessions with dailyBreakdown
  const sessions = await prisma.rawSession.findMany({
    where: {
      dailyBreakdown: { not: null },
    },
    select: {
      sessionId: true,
      durationSeconds: true,
      dailyBreakdown: true,
    },
  }) as SessionData[]

  console.log(`Sessions with dailyBreakdown: ${sessions.length}`)

  // Extract data points
  interface DataPoint {
    sessionId: string
    date: string
    activeMinutes: number
    wallClockMinutes: number
    messageCount: number
    activeRatio: number
  }

  const dataPoints: DataPoint[] = []
  let totalDayEntries = 0
  let entriesWithActiveTime = 0
  let entriesWithoutActiveTime = 0

  for (const session of sessions) {
    const breakdown = session.dailyBreakdown
    if (!Array.isArray(breakdown)) continue

    for (const day of breakdown) {
      totalDayEntries++
      if (day.activeMinutes != null && day.wallClockMinutes != null && day.wallClockMinutes > 0) {
        entriesWithActiveTime++
        dataPoints.push({
          sessionId: session.sessionId,
          date: day.date,
          activeMinutes: day.activeMinutes,
          wallClockMinutes: day.wallClockMinutes,
          messageCount: day.messageCount,
          activeRatio: Math.min(day.activeMinutes / day.wallClockMinutes, 1.0),
        })
      } else {
        entriesWithoutActiveTime++
      }
    }
  }

  console.log(`Total daily breakdown entries: ${totalDayEntries}`)
  console.log(`Entries with active time data: ${entriesWithActiveTime}`)
  console.log(`Entries without active time:   ${entriesWithoutActiveTime}`)

  if (dataPoints.length === 0) {
    console.log('\nNo data points available for analysis.')
    await prisma.$disconnect()
    await pool.end()
    return
  }

  // --- Baseline: 15-minute threshold results ---
  console.log(`\n${'='.repeat(70)}`)
  console.log(`BASELINE: 15-Minute Idle Threshold (from JSONL parser)`)
  console.log(`${'='.repeat(70)}`)

  const activeMinutes = dataPoints.map((d) => d.activeMinutes)
  const wallMinutes = dataPoints.map((d) => d.wallClockMinutes)
  const ratios = dataPoints.map((d) => d.activeRatio)

  const totalActive = activeMinutes.reduce((a, b) => a + b, 0)
  const totalWall = wallMinutes.reduce((a, b) => a + b, 0)
  const overallRatio = totalWall > 0 ? totalActive / totalWall : 0

  console.log(`\n  Session-Days Analyzed:    ${dataPoints.length}`)
  console.log(`  Total Active Minutes:    ${totalActive} (${(totalActive / 60).toFixed(1)}h)`)
  console.log(`  Total Wall-Clock Min:    ${totalWall} (${(totalWall / 60).toFixed(1)}h)`)
  console.log(`  Overall Active Ratio:    ${(overallRatio * 100).toFixed(1)}%`)

  console.log(`\n  Per-Session-Day Active Time Distribution:`)
  console.log(`    Mean:       ${(activeMinutes.reduce((a, b) => a + b, 0) / activeMinutes.length).toFixed(1)} min`)
  console.log(`    Median:     ${median(activeMinutes).toFixed(1)} min`)
  console.log(`    P25:        ${percentile(activeMinutes, 25).toFixed(1)} min`)
  console.log(`    P75:        ${percentile(activeMinutes, 75).toFixed(1)} min`)
  console.log(`    P90:        ${percentile(activeMinutes, 90).toFixed(1)} min`)

  console.log(`\n  Per-Session-Day Active Ratio Distribution:`)
  console.log(`    Mean:       ${(ratios.reduce((a, b) => a + b, 0) / ratios.length * 100).toFixed(1)}%`)
  console.log(`    Median:     ${(median(ratios) * 100).toFixed(1)}%`)
  console.log(`    Std Dev:    ${(stddev(ratios) * 100).toFixed(1)}%`)
  console.log(`    P10:        ${(percentile(ratios, 10) * 100).toFixed(1)}%`)
  console.log(`    P25:        ${(percentile(ratios, 25) * 100).toFixed(1)}%`)
  console.log(`    P75:        ${(percentile(ratios, 75) * 100).toFixed(1)}%`)
  console.log(`    P90:        ${(percentile(ratios, 90) * 100).toFixed(1)}%`)

  // --- Idle gap analysis from wall-clock minus active ---
  // The difference (wallClock - active) represents time spent in gaps >= 15 min
  console.log(`\n${'='.repeat(70)}`)
  console.log(`IDLE GAP ANALYSIS`)
  console.log(`${'='.repeat(70)}`)

  const idleMinutes = dataPoints.map((d) => d.wallClockMinutes - d.activeMinutes)
  const idleRatios = dataPoints.map((d) => 1 - d.activeRatio)

  console.log(`\n  Total Idle Minutes (gaps >= 15min): ${idleMinutes.reduce((a, b) => a + b, 0)} (${(idleMinutes.reduce((a, b) => a + b, 0) / 60).toFixed(1)}h)`)
  console.log(`  Mean Idle per Session-Day:          ${(idleMinutes.reduce((a, b) => a + b, 0) / idleMinutes.length).toFixed(1)} min`)
  console.log(`  Median Idle per Session-Day:        ${median(idleMinutes).toFixed(1)} min`)
  console.log(`\n  Sessions with zero idle time:       ${idleMinutes.filter((m) => m === 0).length} (${((idleMinutes.filter((m) => m === 0).length / dataPoints.length) * 100).toFixed(1)}%)`)
  console.log(`  Sessions with >30min idle:          ${idleMinutes.filter((m) => m > 30).length} (${((idleMinutes.filter((m) => m > 30).length / dataPoints.length) * 100).toFixed(1)}%)`)
  console.log(`  Sessions with >60min idle:          ${idleMinutes.filter((m) => m > 60).length} (${((idleMinutes.filter((m) => m > 60).length / dataPoints.length) * 100).toFixed(1)}%)`)

  // --- Threshold sensitivity estimation ---
  console.log(`\n${'='.repeat(70)}`)
  console.log(`THRESHOLD SENSITIVITY ESTIMATION`)
  console.log(`${'='.repeat(70)}`)

  console.log(`\n  The following estimates show the THEORETICAL effect of different idle`)
  console.log(`  thresholds. These are directional estimates based on the relationship`)
  console.log(`  between active and wall-clock time, not exact recalculations.\n`)

  // For threshold estimation, we use the known relationship:
  // - Lower threshold = fewer gaps counted as active = LESS active time
  // - Higher threshold = more gaps counted as active = MORE active time
  // - At threshold = infinity, active = wall clock
  // - At threshold = 0, active = 0 (no gaps are active)
  //
  // We estimate by scaling: if 15min threshold gives ratio R, then:
  // - A stricter threshold (e.g., 5min) would classify some of the currently-active
  //   gaps as idle, reducing active time
  // - A more lenient threshold (e.g., 30min) would classify some idle gaps as active

  const thresholds = [5, 10, 15, 20, 30]
  const baselineThreshold = 15

  console.log(`  ${'Threshold'.padEnd(12)} ${'Est. Active Hours'.padEnd(20)} ${'Est. Ratio'.padEnd(14)} ${'vs Baseline'.padEnd(14)} Note`)
  console.log(`  ${'-'.repeat(75)}`)

  for (const threshold of thresholds) {
    if (threshold === baselineThreshold) {
      // Exact data
      console.log(
        `  ${(threshold + ' min').padEnd(12)} ` +
        `${(totalActive / 60).toFixed(1).padStart(8)}h${' '.repeat(11)} ` +
        `${(overallRatio * 100).toFixed(1).padStart(6)}%${' '.repeat(7)} ` +
        `${'baseline'.padEnd(14)} Actual data from JSONL parser`
      )
    } else {
      // Estimate: scale factor based on threshold ratio
      // Research suggests active time scales roughly logarithmically with threshold
      // A simple approximation: ratio_new ~ ratio_base * ln(threshold_new) / ln(threshold_base)
      // But for practical purposes, a linear interpolation between known points is more conservative
      const scaleFactor = Math.log(threshold) / Math.log(baselineThreshold)
      const estActiveMinutes = Math.round(totalActive * scaleFactor)
      const estRatio = totalWall > 0 ? estActiveMinutes / totalWall : 0
      const vsBaseline = estActiveMinutes - totalActive
      const vsPct = totalActive > 0 ? (vsBaseline / totalActive * 100) : 0

      console.log(
        `  ${(threshold + ' min').padEnd(12)} ` +
        `${('~' + (estActiveMinutes / 60).toFixed(1)).padStart(8)}h${' '.repeat(11)} ` +
        `${('~' + (estRatio * 100).toFixed(1)).padStart(6)}%${' '.repeat(7)} ` +
        `${(vsBaseline >= 0 ? '+' : '') + (vsBaseline / 60).toFixed(1) + 'h'.padEnd(14)} ` +
        `Estimated (${vsPct >= 0 ? '+' : ''}${vsPct.toFixed(1)}% vs baseline)`
      )
    }
  }

  console.log(`\n  IMPORTANT: These estimates are approximate. For exact results at different`)
  console.log(`  thresholds, the raw JSONL files must be re-processed. The agent JSONL parser`)
  console.log(`  at agent/src/parsers/claude-jsonl.ts uses GAP_THRESHOLD_MS = 15 * 60 * 1000.`)
  console.log(`  The web-side active-time.ts uses IDLE_THRESHOLD_MS = 5 * 60 * 1000 for`)
  console.log(`  real-time tool events (a different data source).\n`)

  // --- Summary of two thresholds used in the system ---
  console.log(`${'='.repeat(70)}`)
  console.log(`SYSTEM THRESHOLD COMPARISON`)
  console.log(`${'='.repeat(70)}`)
  console.log(``)
  console.log(`  Component                    Threshold    Data Source`)
  console.log(`  ${'-'.repeat(65)}`)
  console.log(`  JSONL Parser (agent)         15 min       Session JSONL message timestamps`)
  console.log(`  Active Time Calculator (web) 5 min        Real-time tool events (hooks)`)
  console.log(`  Fallback Estimator (web)     N/A          Applies 60% to session duration`)
  console.log(``)
  console.log(`  The 15-minute threshold is more lenient because JSONL timestamps represent`)
  console.log(`  user prompts and AI responses, which naturally have longer gaps during`)
  console.log(`  reading/thinking time. The 5-minute threshold applies to tool events`)
  console.log(`  (file reads, writes, searches), which fire more frequently during active use.`)

  // --- Per-day summary ---
  console.log(`\n${'='.repeat(70)}`)
  console.log(`PER-DATE AGGREGATION (15-min threshold baseline)`)
  console.log(`${'='.repeat(70)}\n`)

  const byDate = new Map<string, { active: number; wall: number; count: number }>()
  for (const dp of dataPoints) {
    const existing = byDate.get(dp.date) ?? { active: 0, wall: 0, count: 0 }
    existing.active += dp.activeMinutes
    existing.wall += dp.wallClockMinutes
    existing.count++
    byDate.set(dp.date, existing)
  }

  const sortedDates = [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b))

  console.log(`  ${'Date'.padEnd(12)} ${'Sessions'.padEnd(10)} ${'Active'.padEnd(10)} ${'Wall'.padEnd(10)} ${'Ratio'.padEnd(8)}`)
  console.log(`  ${'-'.repeat(52)}`)

  for (const [date, data] of sortedDates) {
    const ratio = data.wall > 0 ? (data.active / data.wall * 100).toFixed(0) : 'N/A'
    console.log(
      `  ${date.padEnd(12)} ${String(data.count).padEnd(10)} ` +
      `${((data.active / 60).toFixed(1) + 'h').padEnd(10)} ` +
      `${((data.wall / 60).toFixed(1) + 'h').padEnd(10)} ` +
      `${ratio}%`
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
