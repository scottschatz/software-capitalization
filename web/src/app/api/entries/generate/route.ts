import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { generateEntriesForDate } from '@/lib/jobs/generate-daily-entries'

// POST /api/entries/generate — Manually trigger entry generation for a date
export async function POST(request: NextRequest) {
  const developer = await getDeveloper()
  if (!developer || developer.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const targetDate = body.date ? new Date(body.date) : undefined

  try {
    const result = await generateEntriesForDate(targetDate)
    return NextResponse.json(result)
  } catch (err) {
    console.error('Error in generating entries:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
