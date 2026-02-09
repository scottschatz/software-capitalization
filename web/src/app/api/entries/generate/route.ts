import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { generateEntriesForDate, generateWithGapDetection } from '@/lib/jobs/generate-daily-entries'
import { parseISO } from 'date-fns'

// POST /api/entries/generate — Manually trigger entry generation for a date
// When no date is specified, generates for yesterday + backfills gaps in last 7 days.
export async function POST(request: NextRequest) {
  const developer = await getDeveloper()
  if (!developer || developer.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))

  try {
    if (body.date) {
      // Specific date requested — generate just that date
      // Use parseISO for date-only strings — new Date('YYYY-MM-DD') creates UTC midnight
      // which shifts the date backward in EST/EDT, causing entries for the wrong day.
      const result = await generateEntriesForDate(parseISO(body.date))
      return NextResponse.json(result)
    }

    // No date specified — generate yesterday + check for gaps in last 7 days
    const result = await generateWithGapDetection()
    return NextResponse.json(result)
  } catch (err) {
    console.error('Error in generating entries:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
