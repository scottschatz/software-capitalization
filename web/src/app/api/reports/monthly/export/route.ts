import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { queryDailyEntries, queryManualEntries, aggregateByProject } from '@/lib/reports/query-builder'
import { buildCsv } from '@/lib/reports/export-csv'
import { buildExcelReport } from '@/lib/reports/export-excel'
import { format, startOfMonth, endOfMonth, parse } from 'date-fns'

// GET /api/reports/monthly/export?month=2026-01&format=xlsx|csv
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

  const exportFormat = request.nextUrl.searchParams.get('format') ?? 'xlsx'
  if (exportFormat !== 'xlsx' && exportFormat !== 'csv') {
    return NextResponse.json({ error: 'Format must be xlsx or csv' }, { status: 400 })
  }

  const monthDate = parse(`${monthParam}-01`, 'yyyy-MM-dd', new Date())
  const startDate = format(startOfMonth(monthDate), 'yyyy-MM-dd')
  const endDate = format(endOfMonth(monthDate), 'yyyy-MM-dd')
  const developerId = request.nextUrl.searchParams.get('developerId') ?? undefined
  const projectId = request.nextUrl.searchParams.get('projectId') ?? undefined

  const filters = { startDate, endDate, developerId, projectId }

  const [dailyEntries, manualEntries, projectSummary] = await Promise.all([
    queryDailyEntries({ ...filters, status: 'confirmed' }),
    queryManualEntries(filters),
    aggregateByProject(filters),
  ])

  if (exportFormat === 'csv') {
    const csv = buildCsv(dailyEntries, manualEntries)
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="cap-report-${monthParam}.csv"`,
      },
    })
  }

  // Excel
  const buffer = await buildExcelReport({
    title: `Software Capitalization Report`,
    period: monthParam,
    dailyEntries,
    manualEntries,
    projectSummary,
  })

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="cap-report-${monthParam}.xlsx"`,
    },
  })
}
