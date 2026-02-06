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
          {entries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={{
                ...entry,
                confirmedAt: entry.confirmedAt?.toISOString() ?? null,
              }}
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
