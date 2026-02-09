/**
 * Re-generate specific dates that had large hour discrepancies.
 * Deletes entries for those dates and regenerates with the improved prompt.
 * Usage: cd web && npx tsx --tsconfig tsconfig.json ../scripts/regen-targeted.ts
 */
import 'dotenv/config'
import { prisma } from '@/lib/prisma'
import { generateEntriesForDate } from '@/lib/jobs/generate-daily-entries'
import { parseISO } from 'date-fns'

// Dates with biggest discrepancies from the comparison
const DATES_TO_REGEN = [
  '2026-01-30',  // 13.2h → should be ~5h
  '2026-01-22',  // unique constraint error
  '2026-01-09',  // 4h vs 8.25h Haiku
  '2026-02-01',  // fell back to Haiku (empty response)
  '2026-02-04',  // fell back to Haiku (model crash)
]

const DAY_TZ = process.env.CAP_TIMEZONE ?? 'America/New_York'

function getLocalDayBounds(dateStr: string): { startOfDay: Date; endOfDay: Date } {
  const refDate = new Date(`${dateStr}T12:00:00Z`)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: DAY_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })
  const parts = formatter.formatToParts(refDate)
  const getPart = (type: string) => parts.find(p => p.type === type)?.value ?? '0'
  const tzHour = parseInt(getPart('hour'))
  const tzDay = parseInt(getPart('day'))
  const utcDay = refDate.getUTCDate()
  let offsetHours: number
  if (tzDay === utcDay) offsetHours = tzHour - 12
  else if (tzDay > utcDay) offsetHours = tzHour - 12 + 24
  else offsetHours = tzHour - 12 - 24

  const startOfDay = new Date(`${dateStr}T00:00:00Z`)
  startOfDay.setUTCHours(startOfDay.getUTCHours() - offsetHours)
  const endOfDay = new Date(`${dateStr}T23:59:59.999Z`)
  endOfDay.setUTCHours(endOfDay.getUTCHours() - offsetHours)
  return { startOfDay, endOfDay }
}

async function main() {
  console.log(`Re-generating ${DATES_TO_REGEN.length} dates with improved prompt...\n`)

  for (const dateStr of DATES_TO_REGEN) {
    const { startOfDay } = getLocalDayBounds(dateStr)

    // Get current entries for comparison
    const current = await prisma.dailyEntry.findMany({
      where: { date: startOfDay },
      include: { project: { select: { name: true } } },
    })
    const oldHours = current.reduce((s, e) => s + (e.hoursEstimated ?? 0), 0)

    // Delete current entries
    await prisma.$executeRawUnsafe(`ALTER TABLE daily_entries DISABLE TRIGGER daily_entries_no_delete`)
    await prisma.$executeRawUnsafe(
      `DELETE FROM daily_entry_revisions WHERE entry_id IN (SELECT id FROM daily_entries WHERE date = $1::timestamp)`,
      startOfDay
    )
    await prisma.dailyEntry.deleteMany({ where: { date: startOfDay } })
    await prisma.$executeRawUnsafe(`ALTER TABLE daily_entries ENABLE TRIGGER daily_entries_no_delete`)

    // Regenerate
    process.stdout.write(`${dateStr}: deleted ${current.length} entries (${oldHours.toFixed(1)}h)... `)
    try {
      const result = await generateEntriesForDate(parseISO(dateStr))

      // Get new entries
      const newEntries = await prisma.dailyEntry.findMany({
        where: { date: startOfDay },
        include: { project: { select: { name: true } } },
      })
      const newHours = newEntries.reduce((s, e) => s + (e.hoursEstimated ?? 0), 0)

      console.log(`→ ${result.entriesCreated} entries (${newHours.toFixed(1)}h)  [delta: ${(newHours - oldHours) > 0 ? '+' : ''}${(newHours - oldHours).toFixed(1)}h]`)
      if (result.errors.length > 0) {
        for (const e of result.errors) console.log(`    ERROR: ${e.slice(0, 100)}`)
      }

      // Show per-entry breakdown
      for (const e of newEntries) {
        const conf = e.confidenceScore ? `${Math.round(e.confidenceScore * 100)}%` : '?'
        console.log(`    ${(e.project?.name ?? 'Unmatched').padEnd(25)} ${String(e.hoursEstimated ?? 0).padStart(5)}h  conf=${conf}  model=${e.modelUsed}${e.modelFallback ? ' (fallback)' : ''}`)
      }
    } catch (err) {
      console.log(`FAILED: ${err instanceof Error ? err.message : err}`)
    }
    console.log()
  }

  await prisma.$disconnect()
}

main().catch((err) => { console.error(err); process.exit(1) })
