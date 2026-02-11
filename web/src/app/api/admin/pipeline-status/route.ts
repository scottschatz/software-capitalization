import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getDeveloper } from '@/lib/get-developer'

const DAY_TZ = process.env.CAP_TIMEZONE ?? 'America/New_York'

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: DAY_TZ }).format(d)
}

/** For @db.Date fields: Prisma returns UTC midnight, so extract YYYY-MM-DD directly from UTC. */
function formatDbDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Get UTC timestamp for the end of a calendar day in the configured timezone. */
function getEndOfDayUtc(dateStr: string): Date {
  // Determine timezone offset for this date
  const refDate = new Date(`${dateStr}T12:00:00Z`)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: DAY_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
  const parts = formatter.formatToParts(refDate)
  const getPart = (type: string) => parts.find(p => p.type === type)?.value ?? '0'
  const tzHour = parseInt(getPart('hour'))
  const tzDay = parseInt(getPart('day'))
  const utcDay = refDate.getUTCDate()

  let offsetHours: number
  if (tzDay === utcDay) offsetHours = tzHour - 12
  else if (tzDay > utcDay) offsetHours = tzHour - 12 + 24
  else offsetHours = tzHour - 12 - 24

  // End of day = 23:59:59 local → convert to UTC
  const endOfDay = new Date(`${dateStr}T23:59:59.999Z`)
  endOfDay.setUTCHours(endOfDay.getUTCHours() - offsetHours)
  return endOfDay
}

export async function GET() {
  const developer = await getDeveloper()
  if (!developer || developer.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  // Build date range: last 14 days in local timezone
  const now = new Date()
  const dates: string[] = []
  for (let i = 1; i <= 14; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    dates.push(formatDate(d))
  }

  // Fetch all active developers
  const developers = await prisma.developer.findMany({
    where: { active: true },
    select: { id: true, email: true, displayName: true },
  })

  // Agent keys with latest sync per developer
  const agentKeys = await prisma.agentKey.findMany({
    where: {
      active: true,
      developerId: { in: developers.map(d => d.id) },
    },
    select: {
      id: true,
      developerId: true,
      name: true,
      hostname: true,
      lastKnownVersion: true,
      lastReportedAt: true,
      syncLogs: {
        where: { status: 'completed' },
        orderBy: { completedAt: 'desc' },
        take: 1,
        select: { completedAt: true, sessionsCount: true, commitsCount: true },
      },
    },
  })

  // Compute last sync time per developer
  const lastSyncByDev: Record<string, Date> = {}
  for (const key of agentKeys) {
    const syncTime = key.syncLogs[0]?.completedAt
    if (syncTime) {
      const existing = lastSyncByDev[key.developerId]
      if (!existing || syncTime > existing) {
        lastSyncByDev[key.developerId] = syncTime
      }
    }
  }

  // Fetch raw data
  const fourteenDaysAgo = new Date(now)
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 15)

  const rawSessions = await prisma.rawSession.findMany({
    where: { startedAt: { gte: fourteenDaysAgo } },
    select: { developerId: true, startedAt: true, endedAt: true, dailyBreakdown: true },
  })

  const rawCommits = await prisma.rawCommit.findMany({
    where: { committedAt: { gte: fourteenDaysAgo } },
    select: { developerId: true, committedAt: true },
  })

  const entries = await prisma.dailyEntry.findMany({
    where: { date: { gte: fourteenDaysAgo } },
    select: { developerId: true, date: true, status: true },
  })

  // Build per-date, per-developer counts + track latest activity timestamp
  const sessionCounts: Record<string, Record<string, number>> = {}
  const lastActivityByDevDate: Record<string, Record<string, Date>> = {}

  function trackActivity(dateStr: string, devId: string, ts: Date) {
    lastActivityByDevDate[dateStr] ??= {}
    const existing = lastActivityByDevDate[dateStr][devId]
    if (!existing || ts > existing) {
      lastActivityByDevDate[dateStr][devId] = ts
    }
  }

  for (const s of rawSessions) {
    const activityTs = s.endedAt ?? s.startedAt
    if (s.dailyBreakdown && Array.isArray(s.dailyBreakdown)) {
      for (const day of s.dailyBreakdown as Array<{ date: string }>) {
        if (!dates.includes(day.date)) continue
        sessionCounts[day.date] ??= {}
        sessionCounts[day.date][s.developerId] = (sessionCounts[day.date][s.developerId] ?? 0) + 1
        trackActivity(day.date, s.developerId, activityTs)
      }
    } else {
      const dateStr = formatDate(s.startedAt)
      if (!dates.includes(dateStr)) continue
      sessionCounts[dateStr] ??= {}
      sessionCounts[dateStr][s.developerId] = (sessionCounts[dateStr][s.developerId] ?? 0) + 1
      trackActivity(dateStr, s.developerId, activityTs)
    }
  }

  const commitCounts: Record<string, Record<string, number>> = {}
  for (const c of rawCommits) {
    const dateStr = formatDate(c.committedAt)
    if (!dates.includes(dateStr)) continue
    commitCounts[dateStr] ??= {}
    commitCounts[dateStr][c.developerId] = (commitCounts[dateStr][c.developerId] ?? 0) + 1
    trackActivity(dateStr, c.developerId, c.committedAt)
  }

  const entryCounts: Record<string, Record<string, { total: number; pending: number; confirmed: number; flagged: number }>> = {}
  for (const e of entries) {
    const dateStr = formatDbDate(e.date)
    if (!dates.includes(dateStr)) continue
    entryCounts[dateStr] ??= {}
    entryCounts[dateStr][e.developerId] ??= { total: 0, pending: 0, confirmed: 0, flagged: 0 }
    entryCounts[dateStr][e.developerId].total++
    if (e.status === 'pending') entryCounts[dateStr][e.developerId].pending++
    else if (e.status === 'confirmed' || e.status === 'approved') entryCounts[dateStr][e.developerId].confirmed++
    else if (e.status === 'flagged') entryCounts[dateStr][e.developerId].flagged++
  }

  // Build per-date status with per-developer detail
  const dailyStatus = dates.map(dateStr => {
    const endOfDay = getEndOfDayUtc(dateStr)
    const dayIsComplete = now > endOfDay // day is fully in the past

    const devRows = developers.map(dev => {
      const sessions = sessionCounts[dateStr]?.[dev.id] ?? 0
      const commits = commitCounts[dateStr]?.[dev.id] ?? 0
      const ec = entryCounts[dateStr]?.[dev.id]
      const hasRawData = sessions > 0 || commits > 0
      const hasEntries = (ec?.total ?? 0) > 0

      // Sync is complete for this day if the last sync happened after the developer's
      // last raw activity on that date. This avoids false "not synced" when a developer
      // stops working at 4 PM, the 4 PM sync captures everything, but no sync runs
      // after midnight (because the agent correctly finds nothing new to send).
      const devLastSync = lastSyncByDev[dev.id]
      const devLastActivity = lastActivityByDevDate[dateStr]?.[dev.id]
      const syncComplete = devLastSync
        ? devLastSync > (devLastActivity ?? endOfDay)
        : false

      return {
        developerId: dev.id,
        displayName: dev.displayName,
        sessions,
        commits,
        entries: ec?.total ?? 0,
        pending: (ec?.pending ?? 0) + (ec?.flagged ?? 0),
        hasRawData,
        hasEntries,
        syncComplete,
      }
    }).filter(d => d.hasRawData || d.hasEntries) // only include devs with activity

    // Aggregate for the date header
    const totalSessions = devRows.reduce((s, d) => s + d.sessions, 0)
    const totalCommits = devRows.reduce((s, d) => s + d.commits, 0)
    const totalEntries = devRows.reduce((s, d) => s + d.entries, 0)
    const totalPending = devRows.reduce((s, d) => s + d.pending, 0)
    const devsWithRawData = devRows.filter(d => d.hasRawData).length
    const devsWithEntries = devRows.filter(d => d.hasEntries).length
    const allSyncsComplete = devRows.filter(d => d.hasRawData).every(d => d.syncComplete)

    // Can generate when:
    // 1. The day is fully in the past
    // 2. All developers with raw data have synced after that day ended
    // 3. At least one developer doesn't have entries yet
    const canGenerate = dayIsComplete && allSyncsComplete && devsWithRawData > devsWithEntries

    return {
      date: dateStr,
      totalSessions,
      totalCommits,
      totalEntries,
      totalPending,
      devsWithRawData,
      devsWithEntries,
      allSyncsComplete,
      dayIsComplete,
      canGenerate,
      developers: devRows,
    }
  })

  // Build agent status per developer (for the top card)
  const agentStatus = developers.map(dev => {
    const keys = agentKeys.filter(k => k.developerId === dev.id)
    const latestSync = keys
      .flatMap(k => k.syncLogs)
      .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())[0]

    return {
      developerId: dev.id,
      email: dev.email,
      displayName: dev.displayName,
      agents: keys.map(k => ({
        name: k.name,
        hostname: k.hostname,
        version: k.lastKnownVersion,
        lastReportedAt: k.lastReportedAt?.toISOString() ?? null,
      })),
      lastSync: latestSync ? {
        completedAt: latestSync.completedAt!.toISOString(),
        sessionsCount: latestSync.sessionsCount,
        commitsCount: latestSync.commitsCount,
      } : null,
    }
  })

  return NextResponse.json({ dailyStatus, agentStatus })
}
