import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import {
  queryDailyEntries,
  queryManualEntries,
  aggregateByProject,
  aggregateByDeveloper,
} from '@/lib/reports/query-builder'
import { format, startOfMonth, endOfMonth, parse } from 'date-fns'

// GET /api/reports/monthly?month=2026-01
export async function GET(request: NextRequest) {
  const developer = await getDeveloper()
  if (!developer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const monthParam = request.nextUrl.searchParams.get('month')
  if (!monthParam || !/^\d{4}-\d{2}$/.test(monthParam)) {
    return NextResponse.json(
      { error: 'Month parameter required (format: YYYY-MM)' },
      { status: 400 }
    )
  }

  try {
    const monthDate = parse(`${monthParam}-01`, 'yyyy-MM-dd', new Date())
    const startDate = format(startOfMonth(monthDate), 'yyyy-MM-dd')
    const endDate = format(endOfMonth(monthDate), 'yyyy-MM-dd')
    const requestedDevId = request.nextUrl.searchParams.get('developerId')
    const projectId = request.nextUrl.searchParams.get('projectId') ?? undefined

    // Non-admin/manager developers can only view their own data
    if (requestedDevId && requestedDevId !== developer.id && !['admin', 'manager'].includes(developer.role)) {
      return NextResponse.json({ error: "Cannot view other developers' reports" }, { status: 403 })
    }

    const developerId = requestedDevId ?? undefined
    const filters = { startDate, endDate, developerId, projectId }

    const [dailyEntries, manualEntries, byProject, byDeveloper] = await Promise.all([
      queryDailyEntries({ ...filters, status: 'confirmed' }),
      queryManualEntries(filters),
      aggregateByProject(filters),
      aggregateByDeveloper(filters),
    ])

    const totalHours = byProject.reduce((s, p) => s + p.totalHours, 0)
    const capHours = byProject.reduce((s, p) => s + p.capHours, 0)
    const expHours = byProject.reduce((s, p) => s + p.expHours, 0)

    return NextResponse.json({
      month: monthParam,
      startDate,
      endDate,
      summary: { totalHours, capHours, expHours },
      byProject,
      byDeveloper,
      entryCounts: {
        daily: dailyEntries.length,
        manual: manualEntries.length,
      },
    })
  } catch (err) {
    console.error('Error in monthly report:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
