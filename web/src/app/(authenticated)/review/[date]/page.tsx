import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'
import { format, parseISO, addDays, subDays } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { EntryCard } from '@/components/review/entry-card'
import { ManualEntryDialog } from '@/components/review/manual-entry-dialog'
import { ConfirmAllButton } from '@/components/review/confirm-all-button'
import { ChevronLeft, ChevronRight, Info } from 'lucide-react'

export default async function ReviewDatePage({
  params,
}: {
  params: Promise<{ date: string }>
}) {
  const developer = await requireDeveloper()
  const { date } = await params

  // Validate date format
  let dateObj: Date
  try {
    dateObj = parseISO(date)
    if (isNaN(dateObj.getTime())) throw new Error()
  } catch {
    notFound()
  }

  const dateStr = format(dateObj, 'yyyy-MM-dd')
  const startOfDay = new Date(`${dateStr}T00:00:00.000Z`)

  const prevDate = format(subDays(dateObj, 1), 'yyyy-MM-dd')
  const nextDate = format(addDays(dateObj, 1), 'yyyy-MM-dd')

  // Fetch entries for this date
  const entries = await prisma.dailyEntry.findMany({
    where: {
      developerId: developer.id,
      date: startOfDay,
    },
    include: {
      project: { select: { id: true, name: true, phase: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  // Fetch manual entries
  const manualEntries = await prisma.manualEntry.findMany({
    where: {
      developerId: developer.id,
      date: startOfDay,
    },
    include: {
      project: { select: { id: true, name: true, phase: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  // Fetch all active projects for dropdowns
  const projects = await prisma.project.findMany({
    where: { status: { not: 'abandoned' } },
    select: { id: true, name: true, phase: true },
    orderBy: { name: 'asc' },
  })

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
  const hookCountByClaudeId = new Map(hookEventCounts.map((h) => [h.sessionId, h._count]))
  const sessionIdToClaudeId = new Map(sourceSessions.map((s) => [s.id, s.sessionId]))

  // Serialize entries for client component
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
    developerNote: e.developerNote ?? null,
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

  const pendingCount = entries.filter((e) => e.status === 'pending').length
  const confirmedCount = entries.filter((e) => e.status === 'confirmed').length
  const totalHours = entries.reduce((sum, e) => sum + (e.hoursConfirmed ?? e.hoursEstimated ?? 0), 0)
  const capHours = entries
    .filter((e) => (e.phaseConfirmed ?? e.phaseAuto) === 'application_development')
    .reduce((sum, e) => sum + (e.hoursConfirmed ?? e.hoursEstimated ?? 0), 0)

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header with date nav */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            Daily Review: {format(dateObj, 'EEEE, MMMM d, yyyy')}
          </h1>
          <p className="text-sm text-muted-foreground">
            Review and confirm your development hours for software capitalization.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Link href={`/review/${prevDate}`}>
            <Button variant="ghost" size="icon">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </Link>
          <Link href={`/review/${nextDate}`}>
            <Button variant="ghost" size="icon">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      {/* Guidance banner */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          You&apos;re confirming hours for software capitalization under ASC 350-40. The AI has
          pre-filled estimates from your Claude Code sessions and git commits. Review and adjust
          as needed. Only hours in the <strong>Application Development</strong> phase are
          capitalized — all other phases are expensed.
        </AlertDescription>
      </Alert>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold">{totalHours.toFixed(1)}h</div>
            <div className="text-xs text-muted-foreground">Total Hours</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-green-600">{capHours.toFixed(1)}h</div>
            <div className="text-xs text-muted-foreground">Capitalizable</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold text-amber-600">{pendingCount}</div>
            <div className="text-xs text-muted-foreground">Pending</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 text-center">
            <div className="text-2xl font-bold">{confirmedCount}</div>
            <div className="text-xs text-muted-foreground">Confirmed</div>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <ConfirmAllButton date={dateStr} pendingCount={pendingCount} />
        <ManualEntryDialog date={dateStr} projects={projects} />
      </div>

      {/* Entry cards */}
      {entries.length === 0 && manualEntries.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">
              No entries for this date. If you had activity, entries will be generated
              automatically, or you can add a manual entry.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {serializedEntries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              projects={projects}
            />
          ))}

          {/* Manual entries */}
          {manualEntries.length > 0 && (
            <>
              <h3 className="text-sm font-medium text-muted-foreground mt-6">Manual Entries</h3>
              {manualEntries.map((me) => (
                <Card key={me.id} className="border-blue-200">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{me.project?.name}</span>
                      <div className="flex items-center gap-2">
                        {me.status === 'pending_approval' && (
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">Pending Approval</Badge>
                        )}
                        {me.status === 'approved' && (
                          <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">Approved</Badge>
                        )}
                        {me.status === 'confirmed' && (
                          <Badge variant="secondary" className="text-xs">Confirmed</Badge>
                        )}
                        {me.status === 'rejected' && (
                          <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">Rejected</Badge>
                        )}
                        <Badge variant="outline" className="text-xs">{me.phase}</Badge>
                        <span className="text-sm font-semibold">{me.hours}h</span>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">{me.description}</p>
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </div>
      )}

      {/* Why does this matter? collapsible */}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-medium">
          Why does this matter?
        </summary>
        <div className="mt-2 space-y-2 text-muted-foreground pl-4 border-l-2">
          <p>
            Under ASC 350-40 (and the upcoming ASU 2025-06), companies must capitalize certain
            internal-use software development costs rather than expensing them immediately. This
            means hours spent in the <strong>Application Development</strong> phase become an
            asset on the balance sheet, amortized over the software&apos;s useful life.
          </p>
          <p>
            Your confirmed hours directly impact financial reporting. Accurate tracking ensures
            compliance with GAAP, reduces audit risk, and provides a defensible record of how
            development time was allocated across projects and phases.
          </p>
          <p>
            <strong>Preliminary</strong> hours (research, feasibility) and{' '}
            <strong>Post-Implementation</strong> hours (maintenance, training) are expensed in the
            period incurred. Only <strong>Application Development</strong> hours — active coding,
            testing, and data conversion — qualify for capitalization.
          </p>
        </div>
      </details>
    </div>
  )
}
