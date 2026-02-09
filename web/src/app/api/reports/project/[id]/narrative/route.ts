import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'
import { generateProjectNarrative } from '@/lib/reports/generate-summary'
import type { Prisma } from '@/generated/prisma/client'

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/reports/project/[id]/narrative?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns stored narrative from MonthlyReport.reportData if it exists.
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
    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id },
      select: { id: true, name: true },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Look for stored narrative in MonthlyReport records that overlap the date range.
    // A narrative is stored per-month, so find all monthly reports for this project
    // whose year/month falls within the requested range.
    const fromDate = new Date(fromParam)
    const toDate = new Date(toParam)
    const fromYear = fromDate.getFullYear()
    const fromMonth = fromDate.getMonth() + 1
    const toYear = toDate.getFullYear()
    const toMonth = toDate.getMonth() + 1

    const reports = await prisma.monthlyReport.findMany({
      where: {
        projectId: id,
        OR: buildMonthRangeFilter(fromYear, fromMonth, toYear, toMonth),
      },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    })

    // Filter to those that have reportData with a narrative
    const withNarrative = reports.filter(r =>
      r.reportData &&
      typeof r.reportData === 'object' &&
      (r.reportData as Record<string, unknown>).narrative
    )

    if (withNarrative.length === 0) {
      return NextResponse.json(
        { error: 'No stored narrative found for this project and period' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      projectId: id,
      projectName: project.name,
      period: { from: fromParam, to: toParam },
      reports: withNarrative.map(r => ({
        year: r.year,
        month: r.month,
        reportData: r.reportData,
        status: r.status,
        generatedAt: r.generatedAt,
      })),
    })
  } catch (err) {
    console.error('Error fetching project narrative:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/reports/project/[id]/narrative
// Body: { from: "YYYY-MM-DD", to: "YYYY-MM-DD" }
// Generates narrative, stores in MonthlyReport.reportData, returns.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const developer = await getDeveloper()
  if (!developer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  let body: { from?: string; to?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.from || !body.to) {
    return NextResponse.json(
      { error: 'from and to date parameters required in request body (format: YYYY-MM-DD)' },
      { status: 400 }
    )
  }

  const { from, to } = body

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json(
      { error: 'Date parameters must be in YYYY-MM-DD format' },
      { status: 400 }
    )
  }

  try {
    // Verify project exists
    const project = await prisma.project.findUnique({
      where: { id },
      select: { id: true, name: true },
    })

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const result = await generateProjectNarrative(id, from, to)

    // Store the narrative in MonthlyReport records.
    // Determine which months are covered and upsert each.
    const fromDate = new Date(from)
    const toDate = new Date(to)
    let currentYear = fromDate.getFullYear()
    let currentMonth = fromDate.getMonth() + 1

    const endYear = toDate.getFullYear()
    const endMonth = toDate.getMonth() + 1

    const updatedReports: Array<{ year: number; month: number }> = []

    while (
      currentYear < endYear ||
      (currentYear === endYear && currentMonth <= endMonth)
    ) {
      await prisma.monthlyReport.upsert({
        where: {
          projectId_year_month: {
            projectId: id,
            year: currentYear,
            month: currentMonth,
          },
        },
        create: {
          projectId: id,
          year: currentYear,
          month: currentMonth,
          reportData: {
            narrative: result.narrative,
            narrativeModelUsed: result.modelUsed,
            narrativeFallback: result.fallback,
            narrativePeriod: { from, to },
            narrativeGeneratedAt: new Date().toISOString(),
          } as unknown as Prisma.InputJsonValue,
          generatedById: developer.id,
        },
        update: {
          reportData: {
            narrative: result.narrative,
            narrativeModelUsed: result.modelUsed,
            narrativeFallback: result.fallback,
            narrativePeriod: { from, to },
            narrativeGeneratedAt: new Date().toISOString(),
          } as unknown as Prisma.InputJsonValue,
        },
      })

      updatedReports.push({ year: currentYear, month: currentMonth })

      // Advance to next month
      currentMonth++
      if (currentMonth > 12) {
        currentMonth = 1
        currentYear++
      }
    }

    return NextResponse.json({
      projectId: id,
      projectName: project.name,
      period: { from, to },
      narrative: result.narrative,
      modelUsed: result.modelUsed,
      modelFallback: result.fallback,
      updatedReports,
    })
  } catch (err) {
    console.error('Error generating project narrative:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// ---- Helpers ----

/**
 * Build a Prisma OR filter for a range of year/month combinations.
 */
function buildMonthRangeFilter(
  fromYear: number,
  fromMonth: number,
  toYear: number,
  toMonth: number,
): Array<{ year: number; month: { gte?: number; lte?: number } }> {
  if (fromYear === toYear) {
    return [{ year: fromYear, month: { gte: fromMonth, lte: toMonth } }]
  }

  const filters: Array<{ year: number; month: { gte?: number; lte?: number } }> = []

  // First year: fromMonth through December
  filters.push({ year: fromYear, month: { gte: fromMonth, lte: 12 } })

  // Middle years (full years)
  for (let y = fromYear + 1; y < toYear; y++) {
    filters.push({ year: y, month: { gte: 1, lte: 12 } })
  }

  // Last year: January through toMonth
  filters.push({ year: toYear, month: { gte: 1, lte: toMonth } })

  return filters
}
