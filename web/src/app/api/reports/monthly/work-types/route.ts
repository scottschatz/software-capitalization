import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { aggregateByWorkType } from '@/lib/reports/query-builder'
import { format, startOfMonth, endOfMonth, parse } from 'date-fns'

// GET /api/reports/monthly/work-types?month=2026-01
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
    const developerId = request.nextUrl.searchParams.get('developerId') ?? undefined
    const projectId = request.nextUrl.searchParams.get('projectId') ?? undefined

    const filters = { startDate, endDate, developerId, projectId }
    const byWorkType = await aggregateByWorkType(filters)

    return NextResponse.json(byWorkType)
  } catch (err) {
    console.error('Error in work type report:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
