import { NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'

// GET /api/reports/unconfirmed — All pending entries across team
export async function GET() {
  const developer = await getDeveloper()
  if (!developer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const entries = await prisma.dailyEntry.findMany({
      where: { status: 'pending' },
      include: {
        developer: { select: { id: true, displayName: true, email: true } },
        project: { select: { id: true, name: true, phase: true } },
      },
      orderBy: [{ date: 'asc' }, { developer: { displayName: 'asc' } }],
    })

    // Group by developer
    const byDeveloper = new Map<string, {
      developer: { id: string; displayName: string; email: string }
      entries: typeof entries
      oldestDate: Date | null
      totalHours: number
    }>()

    for (const entry of entries) {
      const key = entry.developerId
      const existing = byDeveloper.get(key) ?? {
        developer: entry.developer,
        entries: [],
        oldestDate: null,
        totalHours: 0,
      }
      existing.entries.push(entry)
      existing.totalHours += entry.hoursEstimated ?? 0
      if (!existing.oldestDate || entry.date < existing.oldestDate) {
        existing.oldestDate = entry.date
      }
      byDeveloper.set(key, existing)
    }

    const developers = Array.from(byDeveloper.values())
      .sort((a, b) => (a.oldestDate?.getTime() ?? 0) - (b.oldestDate?.getTime() ?? 0))

    return NextResponse.json({
      totalPending: entries.length,
      totalHours: entries.reduce((s, e) => s + (e.hoursEstimated ?? 0), 0),
      developers,
    })
  } catch (err) {
    console.error('Error in unconfirmed entries report:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
