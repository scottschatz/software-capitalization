import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'
import { queryDailyEntries, queryManualEntries } from '@/lib/reports/query-builder'

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/reports/project/[id]?from=2026-01-01&to=2026-01-31
export async function GET(request: NextRequest, { params }: RouteParams) {
  const developer = await getDeveloper()
  if (!developer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const fromParam = request.nextUrl.searchParams.get('from')
  const toParam = request.nextUrl.searchParams.get('to')

  if (!fromParam || !toParam) {
    return NextResponse.json(
      { error: 'from and to date parameters required (format: YYYY-MM-DD)' },
      { status: 400 }
    )
  }

  try {
    const project = await prisma.project.findUnique({
      where: { id },
      select: { id: true, name: true, phase: true, status: true, description: true },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const filters = { startDate: fromParam, endDate: toParam, projectId: id }

    const [dailyEntries, manualEntries] = await Promise.all([
      queryDailyEntries(filters),
      queryManualEntries(filters),
    ])

    // Group by date for the daily breakdown
    const byDate = new Map<string, {
      date: string
      entries: typeof dailyEntries
      manualEntries: typeof manualEntries
      totalHours: number
      capHours: number
    }>()

    for (const entry of dailyEntries) {
      const dateKey = new Date(entry.date).toISOString().slice(0, 10)
      const existing = byDate.get(dateKey) ?? { date: dateKey, entries: [], manualEntries: [], totalHours: 0, capHours: 0 }
      existing.entries.push(entry)
      const hours = entry.hoursConfirmed ?? entry.hoursEstimated ?? 0
      existing.totalHours += hours
      if (entry.capitalizable) existing.capHours += hours
      byDate.set(dateKey, existing)
    }

    for (const entry of manualEntries) {
      const dateKey = new Date(entry.date).toISOString().slice(0, 10)
      const existing = byDate.get(dateKey) ?? { date: dateKey, entries: [], manualEntries: [], totalHours: 0, capHours: 0 }
      existing.manualEntries.push(entry)
      existing.totalHours += entry.hours
      if (entry.capitalizable) existing.capHours += entry.hours
      byDate.set(dateKey, existing)
    }

    const dailyBreakdown = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))

    const totalHours = dailyBreakdown.reduce((s, d) => s + d.totalHours, 0)
    const capHours = dailyBreakdown.reduce((s, d) => s + d.capHours, 0)

    return NextResponse.json({
      project,
      period: { from: fromParam, to: toParam },
      summary: { totalHours, capHours, expHours: totalHours - capHours },
      dailyBreakdown,
    })
  } catch (err) {
    console.error('Error in project report:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
