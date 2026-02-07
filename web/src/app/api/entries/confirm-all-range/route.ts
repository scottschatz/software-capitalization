import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'

// POST /api/entries/confirm-all-range — Bulk confirm all pending entries across multiple dates
export async function POST(request: NextRequest) {
  const developer = await getDeveloper()
  if (!developer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { dates } = body as { dates: string[] }

  if (!dates || !Array.isArray(dates) || dates.length === 0) {
    return NextResponse.json({ error: 'dates array is required' }, { status: 400 })
  }

  try {
    const dateObjs = dates.map((d) => new Date(`${d}T00:00:00.000Z`))

    const entries = await prisma.dailyEntry.findMany({
      where: {
        developerId: developer.id,
        date: { in: dateObjs },
        status: 'pending',
      },
      include: {
        project: { select: { phase: true } },
      },
    })

    if (entries.length === 0) {
      return NextResponse.json({ confirmed: 0, byDate: {} })
    }

    let confirmed = 0
    const byDate: Record<string, number> = {}

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
      const dateKey = entry.date.toISOString().slice(0, 10)
      byDate[dateKey] = (byDate[dateKey] ?? 0) + 1
    }

    return NextResponse.json({ confirmed, byDate })
  } catch (err) {
    console.error('Error in bulk confirming entries:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
