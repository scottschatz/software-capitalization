import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgent } from '@/lib/agent-auth'
import { generateEntriesForDate } from '@/lib/jobs/generate-daily-entries'
import { addDays, format, parseISO } from 'date-fns'
import { z } from 'zod'

const batchSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

// POST /api/agent/entries/generate-batch — Generate AI entries for a date range
export async function POST(request: NextRequest) {
  const auth = await authenticateAgent(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (auth.developer.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const parsed = batchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input. Required: { from: "YYYY-MM-DD", to: "YYYY-MM-DD" }' }, { status: 400 })
  }

  const { from, to } = parsed.data
  const startDate = parseISO(from)
  const endDate = parseISO(to)

  const results: Array<{
    date: string
    entriesCreated: number
    errors: string[]
  }> = []

  let totalEntries = 0
  let totalErrors = 0
  let current = startDate

  while (current <= endDate) {
    const dateStr = format(current, 'yyyy-MM-dd')
    console.log(`[batch-generate] Processing ${dateStr}...`)

    try {
      const result = await generateEntriesForDate(current)
      results.push({
        date: result.date,
        entriesCreated: result.entriesCreated,
        errors: result.errors,
      })
      totalEntries += result.entriesCreated
      totalErrors += result.errors.length

      if (result.entriesCreated > 0) {
        console.log(`[batch-generate] ${dateStr}: created ${result.entriesCreated} entries`)
      }
      if (result.errors.length > 0) {
        console.log(`[batch-generate] ${dateStr}: ${result.errors.length} errors`)
      }
    } catch (err) {
      const msg = `Failed for ${dateStr}: ${err instanceof Error ? err.message : err}`
      console.error(`[batch-generate] ${msg}`)
      results.push({ date: dateStr, entriesCreated: 0, errors: [msg] })
      totalErrors++
    }

    current = addDays(current, 1)
  }

  return NextResponse.json({
    summary: {
      from,
      to,
      daysProcessed: results.length,
      totalEntriesCreated: totalEntries,
      totalErrors,
    },
    details: results.filter(r => r.entriesCreated > 0 || r.errors.length > 0),
  })
}
