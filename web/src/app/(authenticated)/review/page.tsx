import { requireDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'
import { ReviewPageClient } from '@/components/review/review-page-client'
import { subDays, startOfMonth, endOfMonth, parse } from 'date-fns'

const VALID_DAYS = [3, 7, 14, 30] as const

function parseDateRange(params: { days?: string; month?: string }): { gte: Date; lte?: Date } | null {
  // Month takes priority: "2026-01" → Jan 1–31
  if (params.month && /^\d{4}-\d{2}$/.test(params.month)) {
    const monthDate = parse(params.month + '-01', 'yyyy-MM-dd', new Date())
    return { gte: startOfMonth(monthDate), lte: endOfMonth(monthDate) }
  }

  // Relative days: 3, 7, 14, 30
  const daysParam = parseInt(params.days ?? '', 10)
  if (VALID_DAYS.includes(daysParam as (typeof VALID_DAYS)[number])) {
    return { gte: subDays(new Date(), daysParam) }
  }

  // "all" — no date filter
  return null
}

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; days?: string; month?: string }>
}) {
  const developer = await requireDeveloper()
  const params = await searchParams
  const showAll = params.show === 'all'
  const dateRange = parseDateRange(params)

  // Build date filter for queries
  const dateFilter = dateRange
    ? { date: { gte: dateRange.gte, ...(dateRange.lte ? { lte: dateRange.lte } : {}) } }
    : {}

  // Fetch entries: either all pending (default) or history with optional date range
  const where = showAll
    ? { developerId: developer.id, ...dateFilter }
    : { developerId: developer.id, status: 'pending' as const }

  const entries = await prisma.dailyEntry.findMany({
    where,
    include: {
      project: { select: { id: true, name: true, phase: true } },
    },
    orderBy: [{ date: 'desc' }, { createdAt: 'asc' }],
  })

  // Fetch manual entries for the same scope
  const manualWhere = showAll
    ? { developerId: developer.id, ...dateFilter }
    : {
        developerId: developer.id,
        ...(entries.length > 0
          ? { date: { in: entries.map((e) => e.date) } }
          : { date: { gte: new Date('2099-01-01') } }), // no-match sentinel when no pending entries
      }

  const manualEntries = await prisma.manualEntry.findMany({
    where: manualWhere,
    include: {
      project: { select: { id: true, name: true, phase: true } },
    },
    orderBy: [{ date: 'desc' }, { createdAt: 'asc' }],
  })

  const projects = await prisma.project.findMany({
    where: { status: { not: 'abandoned' } },
    select: { id: true, name: true, phase: true },
    orderBy: { name: 'asc' },
  })

  // Find available months for the month picker (distinct months with data)
  const monthsRaw = await prisma.dailyEntry.findMany({
    where: { developerId: developer.id },
    select: { date: true },
    distinct: ['date'],
    orderBy: { date: 'desc' },
  })
  const availableMonths = [
    ...new Set(monthsRaw.map((r) => r.date.toISOString().slice(0, 7))),
  ].sort((a, b) => b.localeCompare(a))

  // Serialize dates for client component
  const serializedEntries = entries.map((e) => ({
    id: e.id,
    date: e.date.toISOString(),
    hoursEstimated: e.hoursEstimated,
    phaseAuto: e.phaseAuto,
    descriptionAuto: e.descriptionAuto,
    hoursConfirmed: e.hoursConfirmed,
    phaseConfirmed: e.phaseConfirmed,
    descriptionConfirmed: e.descriptionConfirmed,
    confirmedAt: e.confirmedAt?.toISOString() ?? null,
    adjustmentReason: e.adjustmentReason,
    status: e.status,
    sourceSessionIds: e.sourceSessionIds,
    sourceCommitIds: e.sourceCommitIds,
    project: e.project,
  }))

  const serializedManual = manualEntries.map((m) => ({
    id: m.id,
    date: m.date.toISOString(),
    hours: m.hours,
    phase: m.phase,
    description: m.description,
    project: m.project,
  }))

  return (
    <ReviewPageClient
      entries={serializedEntries}
      manualEntries={serializedManual}
      projects={projects}
      showAll={showAll}
      availableMonths={availableMonths}
    />
  )
}
