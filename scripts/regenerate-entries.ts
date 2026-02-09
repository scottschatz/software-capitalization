/**
 * Regenerate all daily entries from scratch.
 * Temporarily disables delete trigger, wipes entries, regenerates, re-enables trigger.
 *
 * Must be run from the web/ directory so @/ path aliases resolve:
 *   cd web && npx tsx --tsconfig tsconfig.json ../scripts/regenerate-entries.ts
 *
 * Options: --from YYYY-MM-DD --to YYYY-MM-DD
 */
import 'dotenv/config'
import { prisma } from '@/lib/prisma'
import { generateEntriesForDate } from '@/lib/jobs/generate-daily-entries'
import { addDays, parseISO, format } from 'date-fns'

async function main() {
  const args = process.argv.slice(2)
  const fromIdx = args.indexOf('--from')
  const toIdx = args.indexOf('--to')

  // Determine date range from raw data
  const sessionRange = await prisma.rawSession.aggregate({
    _min: { startedAt: true },
    _max: { startedAt: true },
  })
  const commitRange = await prisma.rawCommit.aggregate({
    _min: { committedAt: true },
    _max: { committedAt: true },
  })

  const dataMin = new Date(Math.min(
    sessionRange._min.startedAt?.getTime() ?? Infinity,
    commitRange._min.committedAt?.getTime() ?? Infinity,
  ))
  const dataMax = new Date(Math.max(
    sessionRange._max.startedAt?.getTime() ?? 0,
    commitRange._max.committedAt?.getTime() ?? 0,
  ))

  const minDate = fromIdx >= 0 ? parseISO(args[fromIdx + 1]) : dataMin
  const maxDate = toIdx >= 0 ? parseISO(args[toIdx + 1]) : dataMax

  const fromStr = format(minDate, 'yyyy-MM-dd')
  const toStr = format(maxDate, 'yyyy-MM-dd')

  console.log(`\n=== Regenerating Daily Entries ===`)
  console.log(`Date range: ${fromStr} → ${toStr}`)

  // Step 1: Temporarily disable delete trigger so we can wipe entries
  console.log(`\nDisabling daily_entries_no_delete trigger...`)
  await prisma.$executeRawUnsafe(`ALTER TABLE daily_entries DISABLE TRIGGER daily_entries_no_delete`)

  try {
    // Step 2: Delete all existing entries
    const revisionCount = await prisma.dailyEntryRevision.count()
    const entryCount = await prisma.dailyEntry.count()
    console.log(`Existing data: ${entryCount} entries, ${revisionCount} revisions`)

    if (revisionCount > 0) {
      await prisma.dailyEntryRevision.deleteMany({})
      console.log(`Deleted ${revisionCount} revisions`)
    }
    if (entryCount > 0) {
      await prisma.dailyEntry.deleteMany({})
      console.log(`Deleted ${entryCount} entries`)
    }

    console.log(`\nGenerating entries...\n`)

    // Step 3: Generate entries for each day
    let current = parseISO(fromStr)
    const end = parseISO(toStr)
    let totalCreated = 0
    let totalErrors = 0
    let daysProcessed = 0

    while (current <= end) {
      const dateStr = format(current, 'yyyy-MM-dd')
      const startTime = Date.now()
      process.stdout.write(`${dateStr}... `)

      try {
        const result = await generateEntriesForDate(current)
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
        if (result.entriesCreated > 0) {
          process.stdout.write(`${result.entriesCreated} entries (${elapsed}s)`)
          totalCreated += result.entriesCreated
        } else {
          process.stdout.write(`no activity`)
        }
        if (result.errors.length > 0) {
          process.stdout.write(` [${result.errors.length} errors]`)
          totalErrors += result.errors.length
          for (const err of result.errors) {
            console.log(`\n  ERROR: ${err}`)
          }
        }
        console.log()
      } catch (err) {
        console.log(`FAILED: ${err instanceof Error ? err.message : err}`)
        totalErrors++
      }

      daysProcessed++
      current = addDays(current, 1)
    }

    console.log(`\n=== Summary ===`)
    console.log(`Days processed: ${daysProcessed}`)
    console.log(`Entries created: ${totalCreated}`)
    console.log(`Errors: ${totalErrors}`)
  } finally {
    // Step 4: Always re-enable the delete trigger
    console.log(`\nRe-enabling daily_entries_no_delete trigger...`)
    await prisma.$executeRawUnsafe(`ALTER TABLE daily_entries ENABLE TRIGGER daily_entries_no_delete`)
    console.log(`Trigger re-enabled.`)
  }

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
