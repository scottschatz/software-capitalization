/**
 * Regenerate all daily entries using the local LLM (gpt-oss-20b).
 *
 * 1. Backs up current (Haiku-generated) entries to a JSON file
 * 2. Disables delete trigger, deletes all entries in date range
 * 3. Re-generates entries via generateEntriesForDate (uses local LLM)
 * 4. Compares results and writes a diff report
 *
 * Usage: cd web && npx tsx --tsconfig tsconfig.json ../scripts/regenerate-with-local-llm.ts
 */
import 'dotenv/config'
import { prisma } from '@/lib/prisma'
import { generateEntriesForDate } from '@/lib/jobs/generate-daily-entries'
import { writeFileSync } from 'fs'
import { parseISO } from 'date-fns'

const FROM_DATE = '2025-12-01'
const TO_DATE = new Date().toISOString().slice(0, 10) // today

async function main() {
  console.log(`\n=== Regenerate entries with local LLM ===`)
  console.log(`Date range: ${FROM_DATE} to ${TO_DATE}`)
  console.log(`AI_LOCAL_URL: ${process.env.AI_LOCAL_URL}`)
  console.log(`AI_LOCAL_MODEL: ${process.env.AI_LOCAL_MODEL}`)
  console.log(`AI_LOCAL_ENABLED: ${process.env.AI_LOCAL_ENABLED}`)

  // Verify local LLM is reachable
  try {
    const resp = await fetch(`${process.env.AI_LOCAL_URL ?? 'http://10.12.112.8:11434'}/v1/models`)
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    console.log('\nLocal LLM: reachable')
  } catch (err) {
    console.error(`\nERROR: Local LLM not reachable: ${err instanceof Error ? err.message : err}`)
    process.exit(1)
  }

  // Step 1: Back up current entries
  console.log('\n--- Step 1: Backing up current entries ---')
  const currentEntries = await prisma.dailyEntry.findMany({
    where: {
      date: { gte: new Date(FROM_DATE + 'T00:00:00Z') },
    },
    orderBy: { date: 'asc' },
  })
  console.log(`Found ${currentEntries.length} entries to back up`)

  const backupPath = `../scripts/backup-haiku-entries-${new Date().toISOString().slice(0, 19).replace(/:/g, '')}.json`
  writeFileSync(backupPath, JSON.stringify(currentEntries, null, 2))
  console.log(`Backed up to ${backupPath}`)

  // Step 2: Delete existing entries
  console.log('\n--- Step 2: Deleting existing entries ---')
  await prisma.$executeRawUnsafe(`ALTER TABLE daily_entries DISABLE TRIGGER daily_entries_no_delete`)

  // Delete related revisions first to avoid FK constraint errors
  await prisma.$executeRawUnsafe(
    `DELETE FROM daily_entry_revisions WHERE entry_id IN (SELECT id FROM daily_entries WHERE date >= $1::timestamp)`,
    new Date(FROM_DATE + 'T00:00:00Z')
  )

  const deleted = await prisma.dailyEntry.deleteMany({
    where: {
      date: { gte: new Date(FROM_DATE + 'T00:00:00Z') },
    },
  })
  console.log(`Deleted ${deleted.count} entries`)

  await prisma.$executeRawUnsafe(`ALTER TABLE daily_entries ENABLE TRIGGER daily_entries_no_delete`)
  console.log('Delete trigger re-enabled')

  // Step 3: Get all unique dates with raw activity
  console.log('\n--- Step 3: Regenerating entries ---')

  // Find all dates with session or commit activity
  const sessionDates = await prisma.$queryRawUnsafe<Array<{ d: string }>>(`
    SELECT DISTINCT TO_CHAR(started_at AT TIME ZONE '${process.env.CAP_TIMEZONE ?? 'America/New_York'}', 'YYYY-MM-DD') as d
    FROM raw_sessions
    WHERE started_at >= $1::timestamp
    ORDER BY d
  `, new Date(FROM_DATE + 'T00:00:00Z'))

  const commitDates = await prisma.$queryRawUnsafe<Array<{ d: string }>>(`
    SELECT DISTINCT TO_CHAR(committed_at AT TIME ZONE '${process.env.CAP_TIMEZONE ?? 'America/New_York'}', 'YYYY-MM-DD') as d
    FROM raw_commits
    WHERE committed_at >= $1::timestamp
    ORDER BY d
  `, new Date(FROM_DATE + 'T00:00:00Z'))

  const allDates = [...new Set([
    ...sessionDates.map(r => r.d),
    ...commitDates.map(r => r.d),
  ])].sort()

  // Filter to date range
  const datesToProcess = allDates.filter(d => d >= FROM_DATE && d <= TO_DATE)
  console.log(`Found ${datesToProcess.length} dates with activity: ${datesToProcess[0]} to ${datesToProcess[datesToProcess.length - 1]}`)

  let totalCreated = 0
  const allErrors: string[] = []
  const perDateResults: Array<{ date: string; entriesCreated: number; errors: string[] }> = []

  for (const dateStr of datesToProcess) {
    process.stdout.write(`  ${dateStr}... `)
    try {
      const result = await generateEntriesForDate(parseISO(dateStr))
      totalCreated += result.entriesCreated
      if (result.errors.length > 0) {
        allErrors.push(...result.errors)
        console.log(`${result.entriesCreated} entries (${result.errors.length} errors)`)
      } else {
        console.log(`${result.entriesCreated} entries`)
      }
      perDateResults.push(result)
    } catch (err) {
      const msg = `FAILED: ${err instanceof Error ? err.message : err}`
      allErrors.push(`${dateStr}: ${msg}`)
      console.log(msg)
      perDateResults.push({ date: dateStr, entriesCreated: 0, errors: [msg] })
    }
  }

  console.log(`\nRegeneration complete: ${totalCreated} entries across ${datesToProcess.length} dates`)
  if (allErrors.length > 0) {
    console.log(`Errors: ${allErrors.length}`)
    for (const e of allErrors) console.log(`  - ${e}`)
  }

  // Step 4: Compare old vs new
  console.log('\n--- Step 4: Comparing results ---')
  const newEntries = await prisma.dailyEntry.findMany({
    where: {
      date: { gte: new Date(FROM_DATE + 'T00:00:00Z') },
    },
    orderBy: { date: 'asc' },
    include: { project: { select: { name: true } } },
  })

  // Build comparison
  const comparison = {
    summary: {
      oldCount: currentEntries.length,
      newCount: newEntries.length,
      oldTotalHours: currentEntries.reduce((s, e) => s + (e.hoursEstimated ?? 0), 0),
      newTotalHours: newEntries.reduce((s, e) => s + (e.hoursEstimated ?? 0), 0),
      oldAvgConfidence: currentEntries.reduce((s, e) => s + (e.confidenceScore ?? 0), 0) / (currentEntries.length || 1),
      newAvgConfidence: newEntries.reduce((s, e) => s + (e.confidenceScore ?? 0), 0) / (newEntries.length || 1),
      oldModels: [...new Set(currentEntries.map(e => e.modelUsed))],
      newModels: [...new Set(newEntries.map(e => e.modelUsed))],
      oldFallbackRate: currentEntries.filter(e => e.modelFallback).length / (currentEntries.length || 1),
      newFallbackRate: newEntries.filter(e => e.modelFallback).length / (newEntries.length || 1),
    },
    perDate: [] as Array<{
      date: string
      oldEntries: number
      newEntries: number
      oldHours: number
      newHours: number
      hoursDelta: number
      oldConfidence: number
      newConfidence: number
    }>,
  }

  // Per-date comparison
  const oldByDate = new Map<string, typeof currentEntries>()
  for (const e of currentEntries) {
    const d = e.date.toISOString().slice(0, 10)
    if (!oldByDate.has(d)) oldByDate.set(d, [])
    oldByDate.get(d)!.push(e)
  }
  const newByDate = new Map<string, typeof newEntries>()
  for (const e of newEntries) {
    const d = e.date.toISOString().slice(0, 10)
    if (!newByDate.has(d)) newByDate.set(d, [])
    newByDate.get(d)!.push(e)
  }

  const allCompDates = [...new Set([...oldByDate.keys(), ...newByDate.keys()])].sort()
  for (const d of allCompDates) {
    const old = oldByDate.get(d) ?? []
    const nw = newByDate.get(d) ?? []
    const oldH = old.reduce((s, e) => s + (e.hoursEstimated ?? 0), 0)
    const newH = nw.reduce((s, e) => s + (e.hoursEstimated ?? 0), 0)
    const oldC = old.length > 0 ? old.reduce((s, e) => s + (e.confidenceScore ?? 0), 0) / old.length : 0
    const newC = nw.length > 0 ? nw.reduce((s, e) => s + (e.confidenceScore ?? 0), 0) / nw.length : 0

    comparison.perDate.push({
      date: d,
      oldEntries: old.length,
      newEntries: nw.length,
      oldHours: Math.round(oldH * 100) / 100,
      newHours: Math.round(newH * 100) / 100,
      hoursDelta: Math.round((newH - oldH) * 100) / 100,
      oldConfidence: Math.round(oldC * 100),
      newConfidence: Math.round(newC * 100),
    })
  }

  // Write comparison report
  const reportPath = '../scripts/comparison-haiku-vs-gpt-oss.json'
  writeFileSync(reportPath, JSON.stringify(comparison, null, 2))

  // Print summary
  console.log('\n=========================================')
  console.log('         HAIKU vs GPT-OSS COMPARISON')
  console.log('=========================================')
  console.log(`Entries:     ${comparison.summary.oldCount} → ${comparison.summary.newCount}`)
  console.log(`Total Hours: ${comparison.summary.oldTotalHours.toFixed(1)}h → ${comparison.summary.newTotalHours.toFixed(1)}h (${(comparison.summary.newTotalHours - comparison.summary.oldTotalHours > 0 ? '+' : '')}${(comparison.summary.newTotalHours - comparison.summary.oldTotalHours).toFixed(1)}h)`)
  console.log(`Avg Conf:    ${(comparison.summary.oldAvgConfidence * 100).toFixed(0)}% → ${(comparison.summary.newAvgConfidence * 100).toFixed(0)}%`)
  console.log(`Models:      ${comparison.summary.oldModels.join(', ')} → ${comparison.summary.newModels.join(', ')}`)
  console.log(`Fallback:    ${(comparison.summary.oldFallbackRate * 100).toFixed(0)}% → ${(comparison.summary.newFallbackRate * 100).toFixed(0)}%`)
  console.log()

  // Show dates with biggest differences
  const bigDiffs = comparison.perDate
    .filter(d => Math.abs(d.hoursDelta) > 0.5 || d.oldEntries !== d.newEntries)
    .sort((a, b) => Math.abs(b.hoursDelta) - Math.abs(a.hoursDelta))

  if (bigDiffs.length > 0) {
    console.log('Notable differences:')
    console.log('Date         Old→New Entries  Old→New Hours  Delta   Old→New Conf')
    console.log('------------ ----------------  ------------- ------  -------------')
    for (const d of bigDiffs.slice(0, 20)) {
      const entriesPart = `${d.oldEntries}→${d.newEntries}`.padEnd(16)
      const hoursPart = `${d.oldHours}→${d.newHours}`.padEnd(13)
      const deltaPart = `${d.hoursDelta > 0 ? '+' : ''}${d.hoursDelta}h`.padEnd(6)
      const confPart = `${d.oldConfidence}%→${d.newConfidence}%`
      console.log(`${d.date}  ${entriesPart}  ${hoursPart}  ${deltaPart}  ${confPart}`)
    }
  }

  console.log(`\nFull comparison saved to: ${reportPath}`)
  console.log(`Backup saved to: ${backupPath}`)

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
