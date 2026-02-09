import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'

type RouteParams = { params: Promise<{ date: string }> }

// GET /api/entries/by-date/[date] — Get daily entries for the current user on a given date
export async function GET(request: NextRequest, { params }: RouteParams) {
  const developer = await getDeveloper()
  if (!developer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { date } = await params

  // Validate date format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRegex.test(date)) {
    return NextResponse.json({ error: 'Invalid date format. Expected YYYY-MM-DD' }, { status: 400 })
  }

  // Validate that the parsed date is actually valid (e.g. reject 2025-02-31)
  const dateObj = new Date(`${date}T00:00:00.000Z`)
  if (isNaN(dateObj.getTime())) {
    return NextResponse.json({ error: 'Invalid date value' }, { status: 400 })
  }
  // Check that the date round-trips correctly (catches invalid days like Feb 31)
  const roundTrip = dateObj.toISOString().slice(0, 10)
  if (roundTrip !== date) {
    return NextResponse.json({ error: 'Invalid date value' }, { status: 400 })
  }

  try {
    const entries = await prisma.dailyEntry.findMany({
      where: {
        developerId: developer.id,
        date: dateObj,
      },
      include: {
        project: {
          select: { id: true, name: true, phase: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    // Also fetch manual entries for this date
    const manualEntries = await prisma.manualEntry.findMany({
      where: {
        developerId: developer.id,
        date: dateObj,
      },
      include: {
        project: {
          select: { id: true, name: true, phase: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json({ entries, manualEntries })
  } catch (err) {
    console.error('Error in fetching entries by date:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
