import { requireDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import Link from 'next/link'
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'
import {
  FolderKanban,
  Clock,
  AlertCircle,
  ArrowRight,
  CheckCircle,
  TrendingUp,
} from 'lucide-react'

export default async function DashboardPage() {
  const developer = await requireDeveloper()
  const now = new Date()
  const todayStr = format(now, 'yyyy-MM-dd')
  const weekStart = startOfWeek(now, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(now, { weekStartsOn: 1 })
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)

  const [
    projectCount,
    pendingEntries,
    recentSyncs,
    pendingPhaseChanges,
    weeklyEntries,
    monthlyEntries,
    staleEntries,
    weeklyPendingEntries,
    monthlyPendingEntries,
  ] = await Promise.all([
    prisma.project.count({ where: { status: 'active' } }),
    prisma.dailyEntry.count({
      where: { developerId: developer.id, status: 'pending' },
    }),
    prisma.agentSyncLog.count({
      where: { developerId: developer.id },
    }),
    developer.role === 'admin'
      ? prisma.phaseChangeRequest.count({ where: { status: 'pending' } })
      : Promise.resolve(0),
    prisma.dailyEntry.findMany({
      where: {
        developerId: developer.id,
        status: 'confirmed',
        date: { gte: weekStart, lte: weekEnd },
      },
      include: { project: { select: { name: true, phase: true } } },
    }),
    prisma.dailyEntry.findMany({
      where: {
        developerId: developer.id,
        status: 'confirmed',
        date: { gte: monthStart, lte: monthEnd },
      },
      include: { project: { select: { name: true, phase: true } } },
    }),
    prisma.dailyEntry.count({
      where: {
        developerId: developer.id,
        status: 'pending',
        createdAt: { lt: subDays(now, 2) },
      },
    }),
    prisma.dailyEntry.findMany({
      where: {
        developerId: developer.id,
        status: 'pending',
        date: { gte: weekStart, lte: weekEnd },
      },
      include: { project: { select: { name: true, phase: true } } },
    }),
    prisma.dailyEntry.findMany({
      where: {
        developerId: developer.id,
        status: 'pending',
        date: { gte: monthStart, lte: monthEnd },
      },
      include: { project: { select: { name: true, phase: true } } },
    }),
  ])

  // Compute weekly stats (confirmed + pending estimates)
  const weeklyConfirmedHours = weeklyEntries.reduce((s, e) => s + (e.hoursConfirmed ?? 0), 0)
  const weeklyConfirmedCapHours = weeklyEntries
    .filter((e) => e.phaseConfirmed === 'application_development')
    .reduce((s, e) => s + (e.hoursConfirmed ?? 0), 0)
  const weeklyPendingHours = weeklyPendingEntries.reduce((s, e) => s + (e.hoursEstimated ?? 0), 0)
  const weeklyPendingCapHours = weeklyPendingEntries
    .filter((e) => e.phaseAuto === 'application_development')
    .reduce((s, e) => s + (e.hoursEstimated ?? 0), 0)
  const weeklyHours = weeklyConfirmedHours + weeklyPendingHours
  const weeklyCapHours = weeklyConfirmedCapHours + weeklyPendingCapHours
  const hasWeeklyPending = weeklyPendingHours > 0

  // Compute monthly stats by project (confirmed + pending estimates)
  const monthlyByProject = new Map<string, { name: string; hours: number; capHours: number; pendingHours: number }>()
  for (const e of monthlyEntries) {
    const name = e.project?.name ?? 'Unmatched'
    const existing = monthlyByProject.get(name) || { name, hours: 0, capHours: 0, pendingHours: 0 }
    existing.hours += e.hoursConfirmed ?? 0
    if (e.phaseConfirmed === 'application_development') {
      existing.capHours += e.hoursConfirmed ?? 0
    }
    monthlyByProject.set(name, existing)
  }
  for (const e of monthlyPendingEntries) {
    const name = e.project?.name ?? 'Unmatched'
    const existing = monthlyByProject.get(name) || { name, hours: 0, capHours: 0, pendingHours: 0 }
    existing.hours += e.hoursEstimated ?? 0
    existing.pendingHours += e.hoursEstimated ?? 0
    if (e.phaseAuto === 'application_development') {
      existing.capHours += e.hoursEstimated ?? 0
    }
    monthlyByProject.set(name, existing)
  }
  const monthlyTotal = [...monthlyByProject.values()].reduce((s, p) => s + p.hours, 0)
  const monthlyCapTotal = [...monthlyByProject.values()].reduce((s, p) => s + p.capHours, 0)
  const hasMonthlyPending = monthlyPendingEntries.length > 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {developer.displayName}</p>
      </div>

      {/* Alerts */}
      {(staleEntries > 0 || pendingPhaseChanges > 0) && (
        <div className="space-y-2">
          {staleEntries > 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                You have <strong>{staleEntries}</strong> unconfirmed entries older than 48 hours.{' '}
                <Link href={`/review/${todayStr}`} className="underline font-medium">
                  Review now
                </Link>
              </AlertDescription>
            </Alert>
          )}
          {pendingPhaseChanges > 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>{pendingPhaseChanges}</strong> phase change requests pending your approval.{' '}
                <Link href="/projects" className="underline font-medium">
                  Review
                </Link>
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
            <FolderKanban className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{projectCount}</div>
            <Link
              href="/projects"
              className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1 mt-1"
            >
              View projects <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending Review</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {pendingEntries}
              {pendingEntries > 0 && (
                <Badge variant="destructive" className="ml-2 text-xs">
                  Action needed
                </Badge>
              )}
            </div>
            <Link
              href={`/review/${todayStr}`}
              className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1 mt-1"
            >
              Review entries <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">This Week</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {weeklyHours.toFixed(1)}h
              {hasWeeklyPending && (
                <span className="text-sm font-normal text-muted-foreground ml-1">est.</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-green-600 font-medium">{weeklyCapHours.toFixed(1)}h</span>{' '}
              capitalizable
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">This Month</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {monthlyTotal.toFixed(1)}h
              {hasMonthlyPending && (
                <span className="text-sm font-normal text-muted-foreground ml-1">est.</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-green-600 font-medium">{monthlyCapTotal.toFixed(1)}h</span>{' '}
              capitalizable
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly breakdown by project */}
      {monthlyByProject.size > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              {format(now, 'MMMM yyyy')} — Hours by Project
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[...monthlyByProject.values()]
                .sort((a, b) => b.hours - a.hours)
                .map((p) => {
                  const capPct = p.hours > 0 ? (p.capHours / p.hours) * 100 : 0
                  const isPending = p.pendingHours > 0
                  return (
                    <div key={p.name} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{p.name}</span>
                        <span>
                          {p.hours.toFixed(1)}h
                          {isPending && (
                            <span className="text-muted-foreground ml-1 text-xs">est.</span>
                          )}
                          {p.capHours > 0 && (
                            <span className="text-green-600 ml-1">
                              ({p.capHours.toFixed(1)}h cap)
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${isPending ? 'bg-green-400/60' : 'bg-green-500'}`}
                          style={{ width: `${capPct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Getting started (only if no syncs) */}
      {recentSyncs === 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Getting Started</CardTitle>
            <CardDescription>Set up your environment to start tracking</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <Badge variant="outline" className="mt-0.5">1</Badge>
              <div>
                <p className="font-medium">Create a project</p>
                <p className="text-muted-foreground">
                  Go to <Link href="/projects/new" className="underline">Projects</Link> and define
                  your software projects with their repos and Claude Code paths.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Badge variant="outline" className="mt-0.5">2</Badge>
              <div>
                <p className="font-medium">Generate an API key</p>
                <p className="text-muted-foreground">
                  Go to <Link href="/settings" className="underline">Settings</Link> and generate an
                  API key for the cap agent.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Badge variant="outline" className="mt-0.5">3</Badge>
              <div>
                <p className="font-medium">Install and run the agent</p>
                <p className="text-muted-foreground">
                  Run <code className="bg-muted px-1 rounded">cap init</code> to configure, then{' '}
                  <code className="bg-muted px-1 rounded">cap sync</code> to send your first batch.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
