import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgent } from '@/lib/agent-auth'
import { prisma } from '@/lib/prisma'

// GET /api/agent/hours — Aggregated hours by project and date range
export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { developer } = auth
  const { searchParams } = new URL(request.url)
  const from = searchParams.get('from')
  const to = searchParams.get('to')
  const projectName = searchParams.get('project')

  // Default: last 7 days
  const fromDate = from ? new Date(from) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const toDate = to ? new Date(to) : new Date()

  // Get confirmed entries
  const entries = await prisma.dailyEntry.findMany({
    where: {
      developerId: developer.id,
      date: { gte: fromDate, lte: toDate },
      ...(projectName ? { project: { name: { contains: projectName, mode: 'insensitive' as const } } } : {}),
    },
    include: {
      project: { select: { name: true, phase: true } },
    },
    orderBy: { date: 'asc' },
  })

  // Also get manual entries (only confirmed or approved)
  const manualEntries = await prisma.manualEntry.findMany({
    where: {
      developerId: developer.id,
      date: { gte: fromDate, lte: toDate },
      status: { in: ['confirmed', 'approved'] },
      ...(projectName ? { project: { name: { contains: projectName, mode: 'insensitive' as const } } } : {}),
    },
    include: {
      project: { select: { name: true, phase: true } },
    },
    orderBy: { date: 'asc' },
  })

  // Aggregate by project
  const byProject: Record<string, { projectName: string; phase: string; totalHours: number; capitalizable: number; expensed: number; entries: number }> = {}

  for (const entry of entries) {
    const name = entry.project?.name ?? 'Unassigned'
    const phase = entry.phaseConfirmed ?? entry.phaseAuto ?? 'unknown'
    const hours = entry.hoursConfirmed ?? entry.hoursEstimated ?? 0
    if (!byProject[name]) {
      byProject[name] = { projectName: name, phase, totalHours: 0, capitalizable: 0, expensed: 0, entries: 0 }
    }
    byProject[name].totalHours += hours
    byProject[name].entries++
    if (phase === 'application_development') {
      byProject[name].capitalizable += hours
    } else {
      byProject[name].expensed += hours
    }
  }

  for (const entry of manualEntries) {
    const name = entry.project?.name ?? 'Unassigned'
    if (!byProject[name]) {
      byProject[name] = { projectName: name, phase: entry.phase, totalHours: 0, capitalizable: 0, expensed: 0, entries: 0 }
    }
    byProject[name].totalHours += entry.hours
    byProject[name].entries++
    if (entry.phase === 'application_development') {
      byProject[name].capitalizable += entry.hours
    } else {
      byProject[name].expensed += entry.hours
    }
  }

  const totals = Object.values(byProject).reduce(
    (acc, p) => ({
      totalHours: acc.totalHours + p.totalHours,
      capitalizable: acc.capitalizable + p.capitalizable,
      expensed: acc.expensed + p.expensed,
    }),
    { totalHours: 0, capitalizable: 0, expensed: 0 }
  )

  return NextResponse.json({
    from: fromDate.toISOString().split('T')[0],
    to: toDate.toISOString().split('T')[0],
    projects: Object.values(byProject),
    totals,
  })
}
