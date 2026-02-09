import { prisma } from '@/lib/prisma'
import { generateDailyEntries } from '@/lib/ai/generate-entries'
import { classifyWorkType, type ClassificationInput } from '@/lib/ai/classify-work-type'
import { crossValidateEntry } from '@/lib/ai/cross-validate'
import { assertPeriodOpen, PeriodLockedError } from '@/lib/period-lock'
import type { DailyActivityContext } from '@/lib/ai/prompts'
import { subDays } from 'date-fns'

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
  // Use company timezone for date string — critical: format() uses local timezone
  // which can shift the date when callers pass UTC-midnight dates (new Date('YYYY-MM-DD')).
  const dateStr = new Intl.DateTimeFormat('en-CA', { timeZone: DAY_TZ }).format(date)
  const { startOfDay, endOfDay } = getLocalDayBounds(dateStr)

  // Check if the period is locked before generating any entries
  try {
    await assertPeriodOpen(startOfDay)
  } catch (err) {
    if (err instanceof PeriodLockedError) {
      console.log('Skipping entry generation for locked period:', dateStr)
      return { date: dateStr, developers: 0, entriesCreated: 0, errors: [] }
    }
    throw err
  }

  const errors: string[] = []
  let entriesCreated = 0

  // Get all active developers who have synced data
  const developers = await prisma.developer.findMany({
    where: { active: true },
    select: { id: true, email: true, displayName: true, adjustmentFactor: true },
  })

  // Get all monitored, non-abandoned projects with repos, claude paths, and lifecycle fields
  const projects = await prisma.project.findMany({
    where: { status: { notIn: ['abandoned', 'suspended'] }, monitored: true },
    include: {
      repos: { select: { repoPath: true } },
      claudePaths: { select: { claudePath: true, localPath: true } },
    },
  })
  // Note: goLiveDate, parentProjectId, enhancementLabel are direct fields on Project

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

    // Skip if no activity at all for this date
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

    // Filter sessions: if dailyBreakdown exists, only include sessions that had
    // actual activity on this date. Without this filter, a 9-day session with 17k
    // messages would show all messages for a date where it had 0 activity, causing
    // the AI to massively overestimate hours.
    const filteredSessions = sessions.filter((s) => {
      const breakdown = s.dailyBreakdown as DailyBreakdownEntry[] | null
      if (!breakdown || breakdown.length === 0) {
        // No dailyBreakdown data (older sessions) — include based on time overlap
        return true
      }
      const dayData = breakdown.find((d) => d.date === dateStr)
      // Exclude if breakdown exists but this date has no entry or 0 activity
      return dayData != null && ((dayData.messageCount ?? 0) > 0 || (dayData.activeMinutes ?? 0) > 0)
    })

    const mappedSessions = filteredSessions.map((s) => {
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

    // After filtering, skip if no sessions with actual activity remain (and no commits/toolEvents)
    if (mappedSessions.length === 0 && commits.length === 0 && toolEvents.length === 0) continue

    const ctx: DailyActivityContext = {
      developer: { displayName: developer.displayName, email: developer.email },
      date: dateStr,
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        phase: p.phase,
        description: p.description,
        goLiveDate: p.goLiveDate,
        parentProjectId: p.parentProjectId,
        enhancementLabel: p.enhancementLabel,
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

    // Query last 30 days of confirmed entries for historical context + cross-validation
    const recentEntries = await prisma.dailyEntry.findMany({
      where: {
        developerId: developer.id,
        status: 'confirmed',
        date: { gte: subDays(new Date(), 30) },
      },
      select: { date: true, hoursConfirmed: true, projectId: true },
    })

    const confirmedDays = new Set(recentEntries.map(e => e.date.toISOString().slice(0, 10))).size
    const totalHours = recentEntries.reduce((sum, e) => sum + (e.hoursConfirmed ?? 0), 0)
    const avgHoursPerDay = confirmedDays > 0 ? totalHours / confirmedDays : 0
    const projectsByDay = new Map<string, Set<string>>()
    for (const e of recentEntries) {
      const d = e.date.toISOString().slice(0, 10)
      if (!projectsByDay.has(d)) projectsByDay.set(d, new Set())
      if (e.projectId) projectsByDay.get(d)!.add(e.projectId)
    }
    const avgProjectsPerDay = confirmedDays > 0
      ? [...projectsByDay.values()].reduce((s, ps) => s + ps.size, 0) / confirmedDays
      : 0

    const historicalStats = confirmedDays > 0
      ? { avgHoursPerDay, avgProjectsPerDay, confirmedDays, periodDays: 30 }
      : undefined

    try {
      const { entries: aiEntries, modelUsed, fallback: modelFallback } = await generateDailyEntries(ctx, historicalStats)

      // --- Feature H: Classify work types (parallel, async) ---
      // Build classification inputs from session/commit data matched to each AI entry
      const classificationInputs: ClassificationInput[] = aiEntries.map((entry) => {
        const matchingProject = projects.find((p) => p.id === entry.projectId)
        const projectClaudePaths = matchingProject?.claudePaths.map((c) => c.claudePath) ?? []
        const projectRepoPaths = matchingProject?.repos.map((r) => r.repoPath) ?? []

        // Aggregate tool breakdowns from sessions matched to this entry
        const matchedSessions = mappedSessions.filter((s) =>
          projectClaudePaths.includes(s.projectPath)
        )
        const aggregateToolBreakdown: Record<string, number> = {}
        for (const s of matchedSessions) {
          if (s.toolBreakdown) {
            for (const [tool, count] of Object.entries(s.toolBreakdown)) {
              aggregateToolBreakdown[tool] = (aggregateToolBreakdown[tool] ?? 0) + count
            }
          }
        }

        // Collect files referenced from matched sessions
        const filesReferenced = matchedSessions.flatMap((s) => s.filesReferenced)

        // Collect user prompt samples from matched sessions
        const userPromptSamples = matchedSessions.flatMap((s) =>
          s.userPrompts?.map((p) => p.text) ?? s.userPromptSamples ?? []
        )

        // Collect commit messages for matched repos
        const commitMessages = commits
          .filter((c) => projectRepoPaths.includes(c.repoPath))
          .map((c) => c.message)

        return {
          toolBreakdown: Object.keys(aggregateToolBreakdown).length > 0 ? aggregateToolBreakdown : null,
          filesReferenced,
          userPromptSamples,
          commitMessages,
          summary: entry.summary,
        }
      })

      const classifications = await Promise.all(
        classificationInputs.map((input) => classifyWorkType(input))
      )

      // --- Feature G: Cross-validate entries (synchronous, pure computation) ---
      const validations = aiEntries.map((entry) =>
        crossValidateEntry({
          hoursEstimate: entry.hoursEstimate,
          projectId: entry.projectId,
          projectName: entry.projectName,
          historicalEntries: recentEntries,
        })
      )

      const adjFactor = developer.adjustmentFactor

      for (let i = 0; i < aiEntries.length; i++) {
        const entry = aiEntries[i]
        const classification = classifications[i]
        const validation = validations[i]
        // Look up the matched project from DB — this is the source of truth for phase
        const matchingProject = projects.find((p) => p.id === entry.projectId)

        // --- Unmatched entries: flag for categorization instead of creating a normal entry ---
        if (!matchingProject || !entry.projectId) {
          // AI found activity for an unmonitored/unmatched repo.
          // Create a flagged entry so the developer can assign it to a project or dismiss it.
          const sourceCommitIds = commits
            .filter((c) => entry.projectName.includes(c.repoPath.split('/').pop() ?? ''))
            .map((c) => c.id)

          await prisma.dailyEntry.create({
            data: {
              developerId: developer.id,
              date: startOfDay,
              projectId: null,
              hoursRaw: entry.hoursEstimate,
              adjustmentFactor: adjFactor,
              hoursEstimated: Math.round(entry.hoursEstimate * adjFactor * 100) / 100,
              phaseAuto: null,
              descriptionAuto: `⚠️ Unmatched Project: ${entry.projectName}\n\n${entry.summary}\n\n---\nConfidence: ${(entry.confidence * 100).toFixed(0)}%\nReasoning: ${entry.reasoning}\n\nAction needed: Assign to an existing project, create a new project, or dismiss.`,
              confidenceScore: entry.confidence,
              modelUsed,
              modelFallback,
              sourceSessionIds: [],
              sourceCommitIds,
              status: 'flagged', // always flagged for unmatched
              workType: classification?.workType ?? null,
              outlierFlag: validation?.flag ?? null,
            },
          })
          entriesCreated++
          continue
        }

        // --- Matched entries: server derives phase and capitalizability from project record ---
        const projectClaudePaths = matchingProject.claudePaths.map((c) => c.claudePath)
        const projectRepoPaths = matchingProject.repos.map((r) => r.repoPath)

        const sourceSessionIds = filteredSessions
          .filter((s) => projectClaudePaths.includes(s.projectPath))
          .map((s) => s.id)
        const sourceCommitIds = commits
          .filter((c) => projectRepoPaths.includes(c.repoPath))
          .map((c) => c.id)

        // Phase comes from the project record, not the AI
        const projectPhase = matchingProject.phase

        // Minimum activity threshold: even if a session path matches a project, check
        // that the matched sessions had meaningful activity on THIS date. A session with
        // < 3 messages and < 5 min active time on the target date is likely a brief
        // directory open, not real work — flag instead of creating as pending.
        const matchedSessionActivity = filteredSessions
          .filter((s) => projectClaudePaths.includes(s.projectPath))
          .reduce((acc, s) => {
            const breakdown = s.dailyBreakdown as DailyBreakdownEntry[] | null
            const dayData = breakdown?.find((d) => d.date === dateStr)
            return {
              messages: acc.messages + (dayData?.messageCount ?? s.messageCount ?? 0),
              activeMinutes: acc.activeMinutes + (dayData?.activeMinutes ?? 0),
            }
          }, { messages: 0, activeMinutes: 0 })

        const hasMinimalActivity = sourceSessionIds.length > 0
          && sourceCommitIds.length === 0
          && matchedSessionActivity.messages < 3
          && matchedSessionActivity.activeMinutes < 5

        // Zero-evidence guard: if the AI assigned a project but the actual session paths
        // and commit repo paths don't match any registered paths for that project, the AI
        // made a semantic guess that doesn't correspond to real project data. Flag it so
        // the developer can reassign or dismiss rather than silently misattributing work.
        if (sourceSessionIds.length === 0 && sourceCommitIds.length === 0) {
          await prisma.dailyEntry.create({
            data: {
              developerId: developer.id,
              date: startOfDay,
              projectId: null, // Don't assign — evidence doesn't support it
              hoursRaw: entry.hoursEstimate,
              adjustmentFactor: adjFactor,
              hoursEstimated: Math.round(entry.hoursEstimate * adjFactor * 100) / 100,
              phaseAuto: null,
              descriptionAuto: `⚠️ Unmatched Activity (AI suggested "${matchingProject.name}" but no matching source data found)\n\n${entry.summary}\n\n---\nConfidence: ${(entry.confidence * 100).toFixed(0)}%\nReasoning: ${entry.reasoning}\n\nAction needed: Assign to the correct project or dismiss. The session/commit paths did not match any registered paths for "${matchingProject.name}".`,
              confidenceScore: entry.confidence,
              modelUsed,
              modelFallback,
              sourceSessionIds: [],
              sourceCommitIds: [],
              status: 'flagged',
              workType: classification?.workType ?? null,
              outlierFlag: validation?.flag ?? null,
            },
          })
          entriesCreated++
          continue
        }

        // Minimal activity guard: session path matched but barely any work happened
        // on this date. Flag so the developer can verify or dismiss.
        if (hasMinimalActivity) {
          await prisma.dailyEntry.create({
            data: {
              developerId: developer.id,
              date: startOfDay,
              projectId: entry.projectId,
              hoursRaw: entry.hoursEstimate,
              adjustmentFactor: adjFactor,
              hoursEstimated: Math.round(entry.hoursEstimate * adjFactor * 100) / 100,
              phaseAuto: projectPhase,
              descriptionAuto: `⚠️ Low Activity: Session path matched "${matchingProject.name}" but only ${matchedSessionActivity.messages} message(s) and ${Math.round(matchedSessionActivity.activeMinutes)} min active time on this date.\n\n${entry.summary}\n\n---\nConfidence: ${(entry.confidence * 100).toFixed(0)}%\nReasoning: ${entry.reasoning}\n\nAction needed: Verify this work actually happened on this project, adjust hours, or dismiss.`,
              confidenceScore: entry.confidence,
              modelUsed,
              modelFallback,
              sourceSessionIds,
              sourceCommitIds: [],
              status: 'flagged',
              workType: classification?.workType ?? null,
              outlierFlag: 'low_activity',
            },
          })
          entriesCreated++
          continue
        }

        // Enhancement detection: AI suggests new feature work on a post-impl project
        let status: string = 'pending'
        let enhancementNote = ''
        if (entry.enhancementSuggested && entry.enhancementReason) {
          status = 'flagged'
          enhancementNote = `\n\n⚠️ Enhancement Suggested: ${entry.enhancementReason}`
        } else if (
          projectPhase === 'post_implementation' &&
          entry.phaseSuggestion === 'application_development'
        ) {
          // AI thinks this is active development on a post-impl project — auto-flag
          status = 'flagged'
          enhancementNote = '\n\n⚠️ Enhancement Detected: AI classified this as active development work on a post-implementation project. Consider creating an Enhancement Project.'
        }

        // Cross-validation outlier override: flag entries with anomalous hours
        if (validation?.isOutlier && status === 'pending') {
          status = 'flagged'
        }

        await prisma.dailyEntry.create({
          data: {
            developerId: developer.id,
            date: startOfDay,
            projectId: entry.projectId,
            hoursRaw: entry.hoursEstimate,
            adjustmentFactor: adjFactor,
            hoursEstimated: Math.round(entry.hoursEstimate * adjFactor * 100) / 100,
            phaseAuto: projectPhase, // from project record, not AI
            descriptionAuto: `${entry.summary}\n\n---\nConfidence: ${(entry.confidence * 100).toFixed(0)}%\nReasoning: ${entry.reasoning}${enhancementNote}`,
            confidenceScore: entry.confidence,
            modelUsed,
            modelFallback,
            sourceSessionIds,
            sourceCommitIds,
            status,
            workType: classification?.workType ?? null,
            outlierFlag: validation?.flag ?? null,
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

/**
 * Generate entries for yesterday, then backfill any missed dates in the last 7 days.
 * Checks for dates that have raw session activity but no daily entries.
 * Used by the daily cron/systemd timer to self-heal gaps.
 */
export async function generateWithGapDetection(): Promise<{
  primary: { date: string; entriesCreated: number; errors: string[] }
  backfilled: Array<{ date: string; entriesCreated: number; errors: string[] }>
}> {
  // Step 1: Generate for yesterday (normal daily run)
  const primary = await generateEntriesForDate()

  // Step 2: Check last 7 days for gaps
  const backfilled: Array<{ date: string; entriesCreated: number; errors: string[] }> = []
  const now = new Date()
  const lookbackDays = 7

  for (let i = 2; i <= lookbackDays; i++) {
    const checkDate = subDays(now, i)
    const checkStr = new Intl.DateTimeFormat('en-CA', { timeZone: DAY_TZ }).format(checkDate)
    const { startOfDay, endOfDay } = getLocalDayBounds(checkStr)

    // Check if any entries exist for this date (any developer)
    const entryCount = await prisma.dailyEntry.count({
      where: { date: startOfDay },
    })
    if (entryCount > 0) continue

    // Check if there's raw activity (sessions overlapping this date)
    const sessionCount = await prisma.rawSession.count({
      where: {
        startedAt: { lte: endOfDay },
        OR: [
          { endedAt: { gte: startOfDay } },
          { endedAt: null, startedAt: { gte: startOfDay } },
        ],
      },
    })
    const commitCount = await prisma.rawCommit.count({
      where: { committedAt: { gte: startOfDay, lte: endOfDay } },
    })

    if (sessionCount === 0 && commitCount === 0) continue

    // Gap detected: generate entries for this date
    console.log(`[gap-detection] Missing entries for ${checkStr} (${sessionCount} sessions, ${commitCount} commits) — generating...`)
    try {
      const result = await generateEntriesForDate(checkDate)
      backfilled.push({
        date: result.date,
        entriesCreated: result.entriesCreated,
        errors: result.errors,
      })
    } catch (err) {
      console.error(`[gap-detection] Failed for ${checkStr}:`, err)
      backfilled.push({
        date: checkStr,
        entriesCreated: 0,
        errors: [err instanceof Error ? err.message : String(err)],
      })
    }
  }

  return { primary, backfilled }
}
