import { requireDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import Link from 'next/link'
import { subDays } from 'date-fns'
import {
  FolderKanban,
  Clock,
  AlertCircle,
  ArrowRight,
  CheckCircle,
  TrendingUp,
} from 'lucide-react'
import { DashboardDeveloperFilter } from '@/components/dashboard/developer-filter'

interface SearchParams {
  developer?: string
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const currentDeveloper = await requireDeveloper()
  const params = await searchParams
  const isAdmin = currentDeveloper.role === 'admin'
  const now = new Date()
  const companyTz = process.env.CAP_TIMEZONE ?? 'America/New_York'
  // Get today's date in company timezone — entry dates are stored as YYYY-MM-DDT00:00:00Z
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: companyTz }).format(now) // en-CA → YYYY-MM-DD

  // Week boundaries (Monday start) based on company timezone "today"
  const todayAsUTCMidnight = new Date(`${todayStr}T00:00:00.000Z`)
  const todayDow = todayAsUTCMidnight.getUTCDay() // 0=Sun
  const mondayOffset = todayDow === 0 ? 6 : todayDow - 1
  const weekStart = new Date(todayAsUTCMidnight)
  weekStart.setUTCDate(weekStart.getUTCDate() - mondayOffset)
  const weekEnd = new Date(weekStart)
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6)

  // Previous week boundaries
  const prevWeekStart = new Date(weekStart)
  prevWeekStart.setUTCDate(prevWeekStart.getUTCDate() - 7)
  const prevWeekEnd = new Date(weekStart)
  prevWeekEnd.setUTCDate(prevWeekEnd.getUTCDate() - 1)

  // Month boundaries in company timezone
  const [tyear, tmonth] = todayStr.split('-').map(Number)
  const monthStart = new Date(Date.UTC(tyear, tmonth - 1, 1))
  const monthEnd = new Date(Date.UTC(tyear, tmonth, 0)) // last day of month

  // Previous month boundaries
  const prevMonthStart = new Date(Date.UTC(tyear, tmonth - 2, 1))
  const prevMonthEnd = new Date(Date.UTC(tyear, tmonth - 1, 0)) // last day of prev month

  // Formatted date labels (using UTC to avoid timezone shift)
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const fmtShort = (d: Date) => `${monthNames[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}`
  const currentMonthLabel = `${monthNames[tmonth - 1]} ${tyear}`
  const prevMonthIdx = (tmonth - 2 + 12) % 12
  const prevMonthYear = tmonth === 1 ? tyear - 1 : tyear
  const prevMonthLabel = `${monthNames[prevMonthIdx]} ${prevMonthYear}`
  const weekRangeLabel = `${fmtShort(weekStart)}–${fmtShort(weekEnd)}`
  const prevWeekRangeLabel = `${fmtShort(prevWeekStart)}–${fmtShort(prevWeekEnd)}`

  // Determine which developer(s) to show
  const viewAll = isAdmin && params.developer === 'all'
  const viewDevId = isAdmin && params.developer && params.developer !== 'all'
    ? params.developer
    : null
  const targetDevId = viewDevId ?? (viewAll ? undefined : currentDeveloper.id)
  const devFilter = targetDevId ? { developerId: targetDevId } : {}
  const viewingOwnData = !viewAll && !viewDevId

  // Load developer list for admin filter
  const allDevelopers = isAdmin
    ? await prisma.developer.findMany({
        select: { id: true, displayName: true, email: true },
        orderBy: { displayName: 'asc' },
      })
    : []

  const viewLabel = viewAll
    ? 'All Developers'
    : viewDevId
      ? allDevelopers.find((d) => d.id === viewDevId)?.displayName ?? 'Developer'
      : currentDeveloper.displayName

  const [
    projectCount,
    pendingEntries,
    recentSyncs,
    pendingPhaseChanges,
    weeklyConfirmed,
    weeklyPending,
    monthlyConfirmed,
    monthlyPending,
    staleEntries,
    prevWeeklyConfirmed,
    prevWeeklyPending,
    prevMonthlyConfirmed,
    prevMonthlyPending,
  ] = await Promise.all([
    prisma.project.count({ where: { status: 'active' } }),
    prisma.dailyEntry.count({
      where: { ...devFilter, status: 'pending' },
    }),
    viewingOwnData
      ? prisma.agentSyncLog.count({ where: { developerId: currentDeveloper.id } })
      : Promise.resolve(1), // skip getting started card for non-self views
    isAdmin
      ? prisma.phaseChangeRequest.count({ where: { status: 'pending' } })
      : Promise.resolve(0),
    prisma.dailyEntry.findMany({
      where: { ...devFilter, status: 'confirmed', date: { gte: weekStart, lte: weekEnd } },
      include: { project: { select: { name: true, phase: true } } },
    }),
    prisma.dailyEntry.findMany({
      where: { ...devFilter, status: 'pending', date: { gte: weekStart, lte: weekEnd } },
      include: { project: { select: { name: true, phase: true } } },
    }),
    prisma.dailyEntry.findMany({
      where: { ...devFilter, status: 'confirmed', date: { gte: monthStart, lte: monthEnd } },
      include: { project: { select: { name: true, phase: true } } },
    }),
    prisma.dailyEntry.findMany({
      where: { ...devFilter, status: 'pending', date: { gte: monthStart, lte: monthEnd } },
      include: { project: { select: { name: true, phase: true } } },
    }),
    prisma.dailyEntry.count({
      where: { ...devFilter, status: 'pending', createdAt: { lt: subDays(now, 2) } },
    }),
    prisma.dailyEntry.findMany({
      where: { ...devFilter, status: 'confirmed', date: { gte: prevWeekStart, lte: prevWeekEnd } },
      include: { project: { select: { name: true, phase: true } } },
    }),
    prisma.dailyEntry.findMany({
      where: { ...devFilter, status: 'pending', date: { gte: prevWeekStart, lte: prevWeekEnd } },
      include: { project: { select: { name: true, phase: true } } },
    }),
    prisma.dailyEntry.findMany({
      where: { ...devFilter, status: 'confirmed', date: { gte: prevMonthStart, lte: prevMonthEnd } },
      include: { project: { select: { name: true, phase: true } } },
    }),
    prisma.dailyEntry.findMany({
      where: { ...devFilter, status: 'pending', date: { gte: prevMonthStart, lte: prevMonthEnd } },
      include: { project: { select: { name: true, phase: true } } },
    }),
  ])

  // Weekly stats — confirmed vs pending separately
  const wkConfHours = weeklyConfirmed.reduce((s, e) => s + (e.hoursConfirmed ?? 0), 0)
  const wkConfCap = weeklyConfirmed
    .filter((e) => e.phaseConfirmed === 'application_development')
    .reduce((s, e) => s + (e.hoursConfirmed ?? 0), 0)
  const wkPendHours = weeklyPending.reduce((s, e) => s + (e.hoursEstimated ?? 0), 0)
  const wkPendCap = weeklyPending
    .filter((e) => e.phaseAuto === 'application_development')
    .reduce((s, e) => s + (e.hoursEstimated ?? 0), 0)

  // Previous week stats
  const prevWkConfHours = prevWeeklyConfirmed.reduce((s, e) => s + (e.hoursConfirmed ?? 0), 0)
  const prevWkConfCap = prevWeeklyConfirmed
    .filter((e) => e.phaseConfirmed === 'application_development')
    .reduce((s, e) => s + (e.hoursConfirmed ?? 0), 0)
  const prevWkPendHours = prevWeeklyPending.reduce((s, e) => s + (e.hoursEstimated ?? 0), 0)
  const prevWkPendCap = prevWeeklyPending
    .filter((e) => e.phaseAuto === 'application_development')
    .reduce((s, e) => s + (e.hoursEstimated ?? 0), 0)

  // Monthly stats — confirmed vs pending separately
  const moConfHours = monthlyConfirmed.reduce((s, e) => s + (e.hoursConfirmed ?? 0), 0)
  const moConfCap = monthlyConfirmed
    .filter((e) => e.phaseConfirmed === 'application_development')
    .reduce((s, e) => s + (e.hoursConfirmed ?? 0), 0)
  const moPendHours = monthlyPending.reduce((s, e) => s + (e.hoursEstimated ?? 0), 0)
  const moPendCap = monthlyPending
    .filter((e) => e.phaseAuto === 'application_development')
    .reduce((s, e) => s + (e.hoursEstimated ?? 0), 0)

  // Previous month stats
  const prevMoConfHours = prevMonthlyConfirmed.reduce((s, e) => s + (e.hoursConfirmed ?? 0), 0)
  const prevMoConfCap = prevMonthlyConfirmed
    .filter((e) => e.phaseConfirmed === 'application_development')
    .reduce((s, e) => s + (e.hoursConfirmed ?? 0), 0)
  const prevMoPendHours = prevMonthlyPending.reduce((s, e) => s + (e.hoursEstimated ?? 0), 0)
  const prevMoPendCap = prevMonthlyPending
    .filter((e) => e.phaseAuto === 'application_development')
    .reduce((s, e) => s + (e.hoursEstimated ?? 0), 0)

  // Monthly by project (confirmed + pending split)
  const monthlyByProject = new Map<string, { name: string; confHours: number; confCap: number; pendHours: number; pendCap: number }>()
  for (const e of monthlyConfirmed) {
    const name = e.project?.name ?? 'Unmatched'
    const existing = monthlyByProject.get(name) || { name, confHours: 0, confCap: 0, pendHours: 0, pendCap: 0 }
    existing.confHours += e.hoursConfirmed ?? 0
    if (e.phaseConfirmed === 'application_development') existing.confCap += e.hoursConfirmed ?? 0
    monthlyByProject.set(name, existing)
  }
  for (const e of monthlyPending) {
    const name = e.project?.name ?? 'Unmatched'
    const existing = monthlyByProject.get(name) || { name, confHours: 0, confCap: 0, pendHours: 0, pendCap: 0 }
    existing.pendHours += e.hoursEstimated ?? 0
    if (e.phaseAuto === 'application_development') existing.pendCap += e.hoursEstimated ?? 0
    monthlyByProject.set(name, existing)
  }

  // Previous month by project (confirmed + pending split)
  const prevMonthlyByProject = new Map<string, { name: string; confHours: number; confCap: number; pendHours: number; pendCap: number }>()
  for (const e of prevMonthlyConfirmed) {
    const name = e.project?.name ?? 'Unmatched'
    const existing = prevMonthlyByProject.get(name) || { name, confHours: 0, confCap: 0, pendHours: 0, pendCap: 0 }
    existing.confHours += e.hoursConfirmed ?? 0
    if (e.phaseConfirmed === 'application_development') existing.confCap += e.hoursConfirmed ?? 0
    prevMonthlyByProject.set(name, existing)
  }
  for (const e of prevMonthlyPending) {
    const name = e.project?.name ?? 'Unmatched'
    const existing = prevMonthlyByProject.get(name) || { name, confHours: 0, confCap: 0, pendHours: 0, pendCap: 0 }
    existing.pendHours += e.hoursEstimated ?? 0
    if (e.phaseAuto === 'application_development') existing.pendCap += e.hoursEstimated ?? 0
    prevMonthlyByProject.set(name, existing)
  }

  // Daily breakdown — confirmed vs pending per day (UTC date string comparison)
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setUTCDate(d.getUTCDate() + i)
    return d
  })
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const dailyBreakdown = weekDays.map((day) => {
    const dayStr = day.toISOString().slice(0, 10)
    const confEntries = weeklyConfirmed.filter((e) => new Date(e.date).toISOString().slice(0, 10) === dayStr)
    const pendEntries = weeklyPending.filter((e) => new Date(e.date).toISOString().slice(0, 10) === dayStr)
    const confHours = confEntries.reduce((s, e) => s + (e.hoursConfirmed ?? 0), 0)
    const confCap = confEntries
      .filter((e) => e.phaseConfirmed === 'application_development')
      .reduce((s, e) => s + (e.hoursConfirmed ?? 0), 0)
    const pendHours = pendEntries.reduce((s, e) => s + (e.hoursEstimated ?? 0), 0)
    const pendCap = pendEntries
      .filter((e) => e.phaseAuto === 'application_development')
      .reduce((s, e) => s + (e.hoursEstimated ?? 0), 0)
    const isToday = dayStr === todayStr
    return {
      label: dayNames[day.getUTCDay()],
      dateLabel: `${day.getUTCMonth() + 1}/${day.getUTCDate()}`,
      confHours, confCap, pendHours, pendCap,
      totalHours: confHours + pendHours,
      isToday,
    }
  })
  const maxDailyHours = Math.max(...dailyBreakdown.map((d) => d.totalHours), 1)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground">Welcome back, {currentDeveloper.displayName}</p>
        </div>
        {isAdmin && (
          <DashboardDeveloperFilter
            developers={allDevelopers}
            currentDevId={params.developer ?? currentDeveloper.id}
          />
        )}
      </div>

      {/* Viewing indicator */}
      {!viewingOwnData && (
        <div className="text-sm text-muted-foreground">
          Viewing: <span className="font-medium text-foreground">{viewLabel}</span>
        </div>
      )}

      {/* Alerts */}
      {(staleEntries > 0 || pendingPhaseChanges > 0) && (
        <div className="space-y-2">
          {staleEntries > 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {viewAll ? 'There are' : 'You have'} <strong>{staleEntries}</strong> unconfirmed entries older than 48 hours.{' '}
                <Link href="/review" className="underline font-medium">
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
              href="/review"
              className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1 mt-1"
            >
              Review entries <ArrowRight className="h-3 w-3" />
            </Link>
          </CardContent>
        </Card>

        <Card className="sm:col-span-2 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Last Week <span className="text-muted-foreground font-normal">({prevWeekRangeLabel})</span></CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {prevWkConfHours.toFixed(1)}h
              {prevWkPendHours > 0 && (
                <span className="text-sm font-normal text-amber-600 ml-1">+{prevWkPendHours.toFixed(1)}h pending</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-green-600 font-medium">{prevWkConfCap.toFixed(1)}h</span> capitalizable
              {prevWkPendCap > 0 && (
                <span className="text-amber-600 ml-1">(+{prevWkPendCap.toFixed(1)}h est.)</span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">This Week <span className="text-muted-foreground font-normal">({weekRangeLabel})</span></CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {wkConfHours.toFixed(1)}h
              {wkPendHours > 0 && (
                <span className="text-sm font-normal text-amber-600 ml-1">+{wkPendHours.toFixed(1)}h pending</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-green-600 font-medium">{wkConfCap.toFixed(1)}h</span> capitalizable
              {wkPendCap > 0 && (
                <span className="text-amber-600 ml-1">(+{wkPendCap.toFixed(1)}h est.)</span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{prevMonthLabel}</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {prevMoConfHours.toFixed(1)}h
              {prevMoPendHours > 0 && (
                <span className="text-sm font-normal text-amber-600 ml-1">+{prevMoPendHours.toFixed(1)}h pending</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-green-600 font-medium">{prevMoConfCap.toFixed(1)}h</span> capitalizable
              {prevMoPendCap > 0 && (
                <span className="text-amber-600 ml-1">(+{prevMoPendCap.toFixed(1)}h est.)</span>
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{currentMonthLabel}</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {moConfHours.toFixed(1)}h
              {moPendHours > 0 && (
                <span className="text-sm font-normal text-amber-600 ml-1">+{moPendHours.toFixed(1)}h pending</span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="text-green-600 font-medium">{moConfCap.toFixed(1)}h</span> capitalizable
              {moPendCap > 0 && (
                <span className="text-amber-600 ml-1">(+{moPendCap.toFixed(1)}h est.)</span>
              )}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Weekly daily breakdown — stacked confirmed + pending */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            This Week — Daily Hours ({weekRangeLabel})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-2 h-32">
            {dailyBreakdown.map((d) => {
              const barHeight = maxDailyHours > 0 ? (d.totalHours / maxDailyHours) * 100 : 0
              const confPct = d.totalHours > 0 ? (d.confHours / d.totalHours) * 100 : 0
              // Within confirmed portion, show capitalizable vs expensed
              const confCapPct = d.confHours > 0 ? (d.confCap / d.confHours) * 100 : 0
              return (
                <div key={d.label} className="flex-1 flex flex-col items-center gap-1">
                  {d.totalHours > 0 && (
                    <span className="text-[10px] text-muted-foreground">{d.totalHours.toFixed(1)}h</span>
                  )}
                  <div className="w-full flex flex-col justify-end" style={{ height: '80px' }}>
                    {d.totalHours > 0 ? (
                      <div
                        className="w-full rounded-t overflow-hidden flex flex-col"
                        style={{ height: `${barHeight}%` }}
                      >
                        {/* Pending portion (top, amber) */}
                        {d.pendHours > 0 && (
                          <div
                            className="bg-amber-400/50 w-full"
                            style={{ height: `${100 - confPct}%` }}
                          />
                        )}
                        {/* Confirmed capitalizable (green) */}
                        {d.confCap > 0 && (
                          <div
                            className="bg-green-500 w-full"
                            style={{ height: `${confPct * confCapPct / 100}%` }}
                          />
                        )}
                        {/* Confirmed expensed (gray) */}
                        {d.confHours - d.confCap > 0 && (
                          <div
                            className="bg-muted-foreground/20 w-full"
                            style={{ height: `${confPct * (100 - confCapPct) / 100}%` }}
                          />
                        )}
                      </div>
                    ) : (
                      <div className="w-full h-0.5 bg-muted rounded" />
                    )}
                  </div>
                  <div className="text-center">
                    <div className={`text-[11px] font-medium ${d.isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                      {d.label}
                    </div>
                    <div className="text-[9px] text-muted-foreground">{d.dateLabel}</div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" /> Confirmed Cap.
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-muted-foreground/20 inline-block" /> Confirmed Exp.
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm bg-amber-400/50 inline-block" /> Pending
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Monthly breakdown by project — confirmed + pending */}
      {monthlyByProject.size > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              {currentMonthLabel} — Hours by Project
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[...monthlyByProject.values()]
                .sort((a, b) => (b.confHours + b.pendHours) - (a.confHours + a.pendHours))
                .map((p) => {
                  const total = p.confHours + p.pendHours
                  const totalCap = p.confCap + p.pendCap
                  const capPct = total > 0 ? (totalCap / total) * 100 : 0
                  const confPct = total > 0 ? (p.confHours / total) * 100 : 0
                  return (
                    <div key={p.name} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{p.name}</span>
                        <span className="flex items-center gap-2">
                          <span>{p.confHours.toFixed(1)}h</span>
                          {p.pendHours > 0 && (
                            <span className="text-amber-600 text-xs">+{p.pendHours.toFixed(1)}h pending</span>
                          )}
                          {totalCap > 0 && (
                            <span className="text-green-600 text-xs">
                              ({totalCap.toFixed(1)}h cap)
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden flex">
                        <div
                          className="bg-green-500 h-full"
                          style={{ width: `${Math.min(confPct, capPct)}%` }}
                        />
                        {confPct > capPct && (
                          <div
                            className="bg-muted-foreground/30 h-full"
                            style={{ width: `${confPct - capPct}%` }}
                          />
                        )}
                        {p.pendHours > 0 && (
                          <div
                            className="bg-amber-400/50 h-full"
                            style={{ width: `${100 - confPct}%` }}
                          />
                        )}
                      </div>
                    </div>
                  )
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Previous month breakdown by project — confirmed + pending */}
      {prevMonthlyByProject.size > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              {prevMonthLabel} — Hours by Project
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[...prevMonthlyByProject.values()]
                .sort((a, b) => (b.confHours + b.pendHours) - (a.confHours + a.pendHours))
                .map((p) => {
                  const total = p.confHours + p.pendHours
                  const totalCap = p.confCap + p.pendCap
                  const capPct = total > 0 ? (totalCap / total) * 100 : 0
                  const confPct = total > 0 ? (p.confHours / total) * 100 : 0
                  return (
                    <div key={p.name} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{p.name}</span>
                        <span className="flex items-center gap-2">
                          <span>{p.confHours.toFixed(1)}h</span>
                          {p.pendHours > 0 && (
                            <span className="text-amber-600 text-xs">+{p.pendHours.toFixed(1)}h pending</span>
                          )}
                          {totalCap > 0 && (
                            <span className="text-green-600 text-xs">
                              ({totalCap.toFixed(1)}h cap)
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden flex">
                        <div
                          className="bg-green-500 h-full"
                          style={{ width: `${Math.min(confPct, capPct)}%` }}
                        />
                        {confPct > capPct && (
                          <div
                            className="bg-muted-foreground/30 h-full"
                            style={{ width: `${confPct - capPct}%` }}
                          />
                        )}
                        {p.pendHours > 0 && (
                          <div
                            className="bg-amber-400/50 h-full"
                            style={{ width: `${100 - confPct}%` }}
                          />
                        )}
                      </div>
                    </div>
                  )
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Getting started (only if no syncs — own view only) */}
      {viewingOwnData && recentSyncs === 0 && (
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
