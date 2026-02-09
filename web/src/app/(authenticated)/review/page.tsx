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

  // Collect all referenced session and commit IDs to fetch in bulk
  const allSessionIds = [...new Set(entries.flatMap((e) => e.sourceSessionIds))]
  const allCommitIds = [...new Set(entries.flatMap((e) => e.sourceCommitIds))]

  // sourceSessionIds/sourceCommitIds store DB primary keys (id), not sessionId/commitHash
  const [sourceSessions, sourceCommits] = await Promise.all([
    allSessionIds.length > 0
      ? prisma.rawSession.findMany({
          where: { id: { in: allSessionIds } },
          select: {
            id: true,
            sessionId: true,
            projectPath: true,
            durationSeconds: true,
            messageCount: true,
            toolUseCount: true,
            userPromptCount: true,
            firstUserPrompt: true,
            model: true,
            dailyBreakdown: true,
          },
        })
      : [],
    allCommitIds.length > 0
      ? prisma.rawCommit.findMany({
          where: { id: { in: allCommitIds } },
          select: {
            id: true,
            commitHash: true,
            repoPath: true,
            message: true,
            filesChanged: true,
            insertions: true,
            deletions: true,
            committedAt: true,
          },
        })
      : [],
  ])

  // Count hook events by Claude sessionId (not DB id)
  const claudeSessionIds = sourceSessions.map((s) => s.sessionId)
  const hookEventCounts = claudeSessionIds.length > 0
    ? await prisma.rawToolEvent.groupBy({
        by: ['sessionId'],
        where: { sessionId: { in: claudeSessionIds } },
        _count: true,
      })
    : []

  // Build lookup maps keyed by DB id (matching sourceSessionIds/sourceCommitIds)
  const sessionMap = new Map(sourceSessions.map((s) => [s.id, s]))
  const commitMap = new Map(sourceCommits.map((c) => [c.id, c]))
  // Hook counts are keyed by Claude sessionId, need a secondary lookup
  const hookCountByClaudeId = new Map(hookEventCounts.map((h) => [h.sessionId, h._count]))
  const sessionIdToClaudeId = new Map(sourceSessions.map((s) => [s.id, s.sessionId]))
  const hookCountMap = new Map(hookEventCounts.map((h) => [h.sessionId, h._count]))

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
    hoursRaw: e.hoursRaw,
    adjustmentFactor: e.adjustmentFactor,
    modelUsed: e.modelUsed,
    modelFallback: e.modelFallback,
    workType: e.workType ?? null,
    confidenceScore: e.confidenceScore ?? null,
    outlierFlag: e.outlierFlag ?? null,
    status: e.status,
    sourceSessionIds: e.sourceSessionIds,
    sourceCommitIds: e.sourceCommitIds,
    project: e.project,
    sourceSessions: e.sourceSessionIds.map((dbId) => {
      const s = sessionMap.get(dbId)
      if (!s) return { sessionId: dbId }
      const claudeId = sessionIdToClaudeId.get(dbId) ?? s.sessionId
      // Extract per-day stats from dailyBreakdown if available
      const entryDateStr = e.date.toISOString().slice(0, 10)
      const breakdown = Array.isArray(s.dailyBreakdown) ? s.dailyBreakdown as Array<Record<string, unknown>> : []
      const daySlice = breakdown.find((d) => String(d.date) === entryDateStr)
      const hasSlice = !!daySlice
      return {
        sessionId: s.sessionId,
        projectPath: s.projectPath,
        durationMinutes: s.durationSeconds ? Math.round(s.durationSeconds / 60) : null,
        activeMinutes: hasSlice ? (daySlice.activeMinutes as number ?? null) : null,
        messageCount: hasSlice ? (daySlice.messageCount as number ?? 0) : s.messageCount,
        toolUseCount: hasSlice ? (daySlice.toolUseCount as number ?? 0) : s.toolUseCount,
        userPromptCount: hasSlice ? (daySlice.userPromptCount as number ?? null) : s.userPromptCount,
        firstUserPrompt: s.firstUserPrompt,
        model: s.model,
        hookEventCount: hookCountByClaudeId.get(claudeId) ?? 0,
        isMultiDay: breakdown.length > 1,
      }
    }),
    sourceCommits: e.sourceCommitIds.map((dbId) => {
      const c = commitMap.get(dbId)
      if (!c) return { commitHash: dbId }
      return {
        commitHash: c.commitHash,
        repoPath: c.repoPath,
        message: c.message,
        filesChanged: c.filesChanged,
        insertions: c.insertions,
        deletions: c.deletions,
        committedAt: c.committedAt.toISOString(),
      }
    }),
  }))

  const serializedManual = manualEntries.map((m) => ({
    id: m.id,
    date: m.date.toISOString(),
    hours: m.hours,
    phase: m.phase,
    description: m.description,
    project: m.project,
    status: m.status,
  }))

  return (
    <ReviewPageClient
      entries={serializedEntries}
      manualEntries={serializedManual}
      projects={projects}
      showAll={showAll}
      availableMonths={availableMonths}
      adjustmentFactor={developer.adjustmentFactor}
    />
  )
}
