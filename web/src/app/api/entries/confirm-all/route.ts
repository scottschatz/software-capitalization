import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'

// POST /api/entries/confirm-all — Bulk confirm all pending entries for a date
export async function POST(request: NextRequest) {
  const developer = await getDeveloper()
  if (!developer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { date } = body

  if (!date) {
    return NextResponse.json({ error: 'Date is required' }, { status: 400 })
  }

  try {
    const dateObj = new Date(`${date}T00:00:00.000Z`)

    // Find all pending entries for this developer on this date
    const entries = await prisma.dailyEntry.findMany({
      where: {
        developerId: developer.id,
        date: dateObj,
        status: 'pending',
      },
      include: {
        project: { select: { phase: true } },
      },
    })

    if (entries.length === 0) {
      return NextResponse.json({ message: 'No pending entries for this date', confirmed: 0 })
    }

    // Confirm each entry using its AI-suggested values
    let confirmed = 0
    for (const entry of entries) {
      await prisma.dailyEntry.update({
        where: { id: entry.id },
        data: {
          hoursConfirmed: entry.hoursEstimated,
          phaseConfirmed: entry.phaseAuto ?? entry.project?.phase ?? 'application_development',
          descriptionConfirmed: entry.descriptionAuto?.split('\n---\n')[0] ?? 'Confirmed as-is',
          confirmedAt: new Date(),
          confirmedById: developer.id,
          status: 'confirmed',
        },
      })
      confirmed++
    }

    return NextResponse.json({ confirmed })
  } catch (err) {
    console.error('Error in bulk confirming entries:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
