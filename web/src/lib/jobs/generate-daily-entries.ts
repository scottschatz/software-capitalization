import { prisma } from '@/lib/prisma'
import { generateDailyEntries } from '@/lib/ai/generate-entries'
import type { DailyActivityContext } from '@/lib/ai/prompts'
import { format, subDays } from 'date-fns'

// Day boundaries use Eastern time so "Feb 6" means midnight-to-midnight ET.
// This matches the agent-side JSONL parser's dailyBreakdown dates.
const DAY_TZ = process.env.CAP_TIMEZONE ?? 'America/New_York'

/** Get UTC timestamps for the start and end of a calendar day in Eastern time. */
function getLocalDayBounds(dateStr: string): { startOfDay: Date; endOfDay: Date } {
  // Build a date string in the target timezone, then convert to UTC.
  // E.g. "2026-02-06" in America/New_York → 2026-02-06T05:00:00Z (EST) or T04:00 (EDT)
  const fakeStart = new Date(`${dateStr}T00:00:00`)
  const fakeEnd = new Date(`${dateStr}T23:59:59.999`)

  // Use Intl to find the UTC offset for this date in the target timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: DAY_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  })

  // Determine offset: create a date at midnight UTC, format in target TZ, compute difference
  const refDate = new Date(`${dateStr}T12:00:00Z`) // noon UTC to avoid DST edge
  const parts = formatter.formatToParts(refDate)
  const getPart = (type: string) => parts.find(p => p.type === type)?.value ?? '0'
  const tzHour = parseInt(getPart('hour'))
  const tzDay = parseInt(getPart('day'))
  const utcDay = refDate.getUTCDate()

  // If TZ day > UTC day, TZ is ahead of UTC (positive offset)
  // If TZ day < UTC day, TZ is behind UTC (negative offset, e.g. America/New_York)
  let offsetHours: number
  if (tzDay === utcDay) {
    offsetHours = tzHour - 12
  } else if (tzDay > utcDay) {
    offsetHours = tzHour - 12 + 24
  } else {
    offsetHours = tzHour - 12 - 24
  }

  // Start of day in TZ = midnight local = midnight - offset in UTC
  const startOfDay = new Date(`${dateStr}T00:00:00Z`)
  startOfDay.setUTCHours(startOfDay.getUTCHours() - offsetHours)

  const endOfDay = new Date(`${dateStr}T23:59:59.999Z`)
  endOfDay.setUTCHours(endOfDay.getUTCHours() - offsetHours)

  return { startOfDay, endOfDay }
}

/**
 * Generate AI-suggested daily entries for a given date (defaults to yesterday).
 * Groups raw_sessions + raw_commits by developer, calls AI, creates daily_entries.
 */
export async function generateEntriesForDate(targetDate?: Date): Promise<{
  date: string
  developers: number
  entriesCreated: number
  errors: string[]
}> {
  const date = targetDate ?? subDays(new Date(), 1)
  const dateStr = format(date, 'yyyy-MM-dd')
  const { startOfDay, endOfDay } = getLocalDayBounds(dateStr)

  const errors: string[] = []
  let entriesCreated = 0

  // Get all active developers who have synced data
  const developers = await prisma.developer.findMany({
    where: { active: true },
    select: { id: true, email: true, displayName: true },
  })

  // Get all active projects with repos and claude paths
  const projects = await prisma.project.findMany({
    where: { status: { not: 'abandoned' } },
    include: {
      repos: { select: { repoPath: true } },
      claudePaths: { select: { claudePath: true, localPath: true } },
    },
  })

  for (const developer of developers) {
    // Check if entries already exist for this date
    const existingEntries = await prisma.dailyEntry.count({
      where: {
        developerId: developer.id,
        date: startOfDay,
      },
    })
    if (existingEntries > 0) continue

    // Fetch raw sessions that overlap this date.
    // Sessions can span multiple days (context continuations append to same JSONL).
    // Include any session that was active during the target date.
    const sessions = await prisma.rawSession.findMany({
      where: {
        developerId: developer.id,
        startedAt: { lte: endOfDay },
        OR: [
          { endedAt: { gte: startOfDay } },
          { endedAt: null, startedAt: { gte: startOfDay } },
        ],
      },
      select: {
        id: true,
        sessionId: true,
        projectPath: true,
        startedAt: true,
        endedAt: true,
        durationSeconds: true,
        totalInputTokens: true,
        totalOutputTokens: true,
        messageCount: true,
        toolUseCount: true,
        model: true,
        toolBreakdown: true,
        filesReferenced: true,
        firstUserPrompt: true,
        userPromptCount: true,
        dailyBreakdown: true,
      },
    })

    // Fetch raw commits for this developer on this date
    const commits = await prisma.rawCommit.findMany({
      where: {
        developerId: developer.id,
        committedAt: { gte: startOfDay, lte: endOfDay },
      },
      select: {
        id: true,
        commitHash: true,
        repoPath: true,
        committedAt: true,
        message: true,
        filesChanged: true,
        insertions: true,
        deletions: true,
      },
    })

    // Fetch real-time tool events from hooks (if any) for this developer on this date
    const toolEvents = await prisma.rawToolEvent.findMany({
      where: {
        developerId: developer.id,
        timestamp: { gte: startOfDay, lte: endOfDay },
      },
      select: {
        toolName: true,
        projectPath: true,
        toolInput: true,
        timestamp: true,
      },
      orderBy: { timestamp: 'asc' },
    })

    // Skip if no activity
    if (sessions.length === 0 && commits.length === 0 && toolEvents.length === 0) continue

    // For multi-day sessions, extract the per-day breakdown for the target date.
    // This gives the AI accurate per-day metrics, time window, and real human prompts.
    interface DailyBreakdownEntry {
      date: string
      firstTimestamp?: string
      lastTimestamp?: string
      activeMinutes?: number
      wallClockMinutes?: number
      messageCount: number
      toolUseCount: number
      userPromptCount: number
      userPromptSamples: string[]
      userPrompts?: Array<{ time: string; text: string }>
    }

    const mappedSessions = sessions.map((s) => {
      const breakdown = s.dailyBreakdown as DailyBreakdownEntry[] | null
      const dayData = breakdown?.find((d) => d.date === dateStr)

      return {
        sessionId: s.sessionId,
        projectPath: s.projectPath,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        durationSeconds: s.durationSeconds,
        totalInputTokens: s.totalInputTokens,
        totalOutputTokens: s.totalOutputTokens,
        // Use per-day counts when available, fall back to session totals
        messageCount: dayData?.messageCount ?? s.messageCount,
        toolUseCount: dayData?.toolUseCount ?? s.toolUseCount,
        model: s.model,
        toolBreakdown: s.toolBreakdown as Record<string, number> | null,
        filesReferenced: s.filesReferenced,
        firstUserPrompt: s.firstUserPrompt,
        userPromptCount: dayData?.userPromptCount ?? s.userPromptCount,
        userPromptSamples: dayData?.userPromptSamples ?? [],
        // Time window and full timestamped transcript
        activeWindow: dayData?.firstTimestamp && dayData?.lastTimestamp
          ? {
              first: dayData.firstTimestamp,
              last: dayData.lastTimestamp,
              minutes: dayData.activeMinutes ?? 0,
              wallClockMinutes: dayData.wallClockMinutes ?? 0,
            }
          : null,
        userPrompts: dayData?.userPrompts ?? [],
      }
    })

    const ctx: DailyActivityContext = {
      developer: { displayName: developer.displayName, email: developer.email },
      date: dateStr,
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        phase: p.phase,
        description: p.description,
        repos: p.repos,
        claudePaths: p.claudePaths,
      })),
      sessions: mappedSessions,
      commits: commits.map((c) => ({
        commitHash: c.commitHash,
        repoPath: c.repoPath,
        committedAt: c.committedAt,
        message: c.message,
        filesChanged: c.filesChanged,
        insertions: c.insertions,
        deletions: c.deletions,
      })),
      toolEvents: toolEvents.map((e) => ({
        toolName: e.toolName,
        projectPath: e.projectPath,
        timestamp: e.timestamp,
        filePath: (e.toolInput as Record<string, unknown> | null)?.file_path as string | undefined,
      })),
    }

    try {
      const aiEntries = await generateDailyEntries(ctx)

      for (const entry of aiEntries) {
        // Collect source IDs for sessions matching this project
        const matchingProject = projects.find((p) => p.id === entry.projectId)
        const projectClaudePaths = matchingProject?.claudePaths.map((c) => c.claudePath) ?? []
        const projectRepoPaths = matchingProject?.repos.map((r) => r.repoPath) ?? []

        const sourceSessionIds = sessions
          .filter((s) => projectClaudePaths.includes(s.projectPath))
          .map((s) => s.id)
        const sourceCommitIds = commits
          .filter((c) => projectRepoPaths.includes(c.repoPath))
          .map((c) => c.id)

        await prisma.dailyEntry.create({
          data: {
            developerId: developer.id,
            date: startOfDay,
            projectId: entry.projectId,
            hoursEstimated: entry.hoursEstimate,
            phaseAuto: entry.phase,
            descriptionAuto: `${entry.summary}\n\n---\nConfidence: ${(entry.confidence * 100).toFixed(0)}%\nReasoning: ${entry.reasoning}`,
            sourceSessionIds,
            sourceCommitIds,
            status: 'pending',
          },
        })
        entriesCreated++
      }
    } catch (err) {
      const msg = `Failed to generate entries for ${developer.email}: ${err instanceof Error ? err.message : err}`
      errors.push(msg)
      console.error(msg)
    }
  }

  return {
    date: dateStr,
    developers: developers.length,
    entriesCreated,
    errors,
  }
}
