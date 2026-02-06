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
  const dateObj = new Date(`${date}T00:00:00.000Z`)

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
}
