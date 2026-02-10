import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { generateEntriesForDate } from '@/lib/jobs/generate-daily-entries'
import { addDays, format, parseISO } from 'date-fns'
import { z } from 'zod'

const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

// POST /api/entries/generate-range — Bulk generate AI entries for a date range (admin only)
export async function POST(request: NextRequest) {
  const developer = await getDeveloper()
  if (!developer || developer.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const parsed = rangeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input. Required: { from: "YYYY-MM-DD", to: "YYYY-MM-DD" }' },
      { status: 400 }
    )
  }

  const { from, to } = parsed.data
  const startDate = parseISO(from)
  const endDate = parseISO(to)

  const results: Array<{
    date: string
    entriesCreated: number
    developers: number
    errors: string[]
  }> = []

  let totalEntries = 0
  let totalErrors = 0
  let current = startDate

  while (current <= endDate) {
    const dateStr = format(current, 'yyyy-MM-dd')

    try {
      const result = await generateEntriesForDate(current)
      results.push({
        date: result.date,
        entriesCreated: result.entriesCreated,
        developers: result.developers,
        errors: result.errors,
      })
      totalEntries += result.entriesCreated
      totalErrors += result.errors.length
    } catch (err) {
      const msg = `Failed for ${dateStr}: ${err instanceof Error ? err.message : err}`
      results.push({ date: dateStr, entriesCreated: 0, developers: 0, errors: [msg] })
      totalErrors++
    }

    current = addDays(current, 1)
  }

  return NextResponse.json({
    from,
    to,
    daysProcessed: results.length,
    totalEntriesCreated: totalEntries,
    totalErrors,
    details: results.filter((r) => r.entriesCreated > 0 || r.errors.length > 0),
  })
}
