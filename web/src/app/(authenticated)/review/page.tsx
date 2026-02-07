import { requireDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'
import { ReviewPageClient } from '@/components/review/review-page-client'
import { subDays } from 'date-fns'

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>
}) {
  const developer = await requireDeveloper()
  const params = await searchParams
  const showAll = params.show === 'all'

  // Fetch entries: either all pending (default) or all within last 60 days
  const where = showAll
    ? {
        developerId: developer.id,
        date: { gte: subDays(new Date(), 60) },
      }
    : {
        developerId: developer.id,
        status: 'pending' as const,
      }

  const entries = await prisma.dailyEntry.findMany({
    where,
    include: {
      project: { select: { id: true, name: true, phase: true } },
    },
    orderBy: [{ date: 'desc' }, { createdAt: 'asc' }],
  })

  // Fetch manual entries for the same dates
  const entryDates = [...new Set(entries.map((e) => e.date.toISOString()))]
  const manualWhere = showAll
    ? {
        developerId: developer.id,
        date: { gte: subDays(new Date(), 60) },
      }
    : {
        developerId: developer.id,
        ...(entryDates.length > 0
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
    />
  )
}
