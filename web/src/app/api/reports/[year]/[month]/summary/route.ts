import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'
import {
  generateMonthlySummary,
  buildMonthlySummaryContext,
} from '@/lib/reports/generate-summary'

type RouteParams = { params: Promise<{ year: string; month: string }> }

// GET /api/reports/[year]/[month]/summary
// Returns stored MonthlyExecutiveSummary for that year/month, or 404
export async function GET(request: NextRequest, { params }: RouteParams) {
  const developer = await getDeveloper()
  if (!developer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { year: yearStr, month: monthStr } = await params
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10)

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json(
      { error: 'Invalid year or month parameter' },
      { status: 400 }
    )
  }

  try {
    const summary = await prisma.monthlyExecutiveSummary.findUnique({
      where: { year_month: { year, month } },
      include: {
        generatedBy: { select: { displayName: true, email: true } },
      },
    })

    if (!summary) {
      return NextResponse.json(
        { error: 'No executive summary found for this period' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      id: summary.id,
      year: summary.year,
      month: summary.month,
      reportData: summary.reportData,
      modelUsed: summary.modelUsed,
      modelFallback: summary.modelFallback,
      status: summary.status,
      generatedBy: summary.generatedBy,
      generatedAt: summary.generatedAt,
      updatedAt: summary.updatedAt,
    })
  } catch (err) {
    console.error('Error fetching executive summary:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/reports/[year]/[month]/summary
// Manager/admin only. Generates summary, stores, returns.
// Supports ?dataOnly=true to skip LLM and return structured data only.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const developer = await getDeveloper()
  if (!developer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Require manager or admin role
  if (developer.role !== 'manager' && developer.role !== 'admin') {
    return NextResponse.json(
      { error: 'Manager or admin role required to generate executive summaries' },
      { status: 403 }
    )
  }

  const { year: yearStr, month: monthStr } = await params
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10)

  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json(
      { error: 'Invalid year or month parameter' },
      { status: 400 }
    )
  }

  const dataOnly = request.nextUrl.searchParams.get('dataOnly') === 'true'

  try {
    if (dataOnly) {
      // Return the structured context data without calling the LLM
      const ctx = await buildMonthlySummaryContext(year, month)
      return NextResponse.json({
        dataOnly: true,
        context: ctx,
      })
    }

    const result = await generateMonthlySummary(year, month, developer.id)

    return NextResponse.json({
      id: result.reportId,
      year,
      month,
      reportData: result.narrative,
      modelUsed: result.modelUsed,
      modelFallback: result.fallback,
      status: 'draft',
    })
  } catch (err) {
    console.error('Error generating executive summary:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
