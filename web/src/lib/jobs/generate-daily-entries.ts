import { prisma } from '@/lib/prisma'
import { generateDailyEntries } from '@/lib/ai/generate-entries'
import type { DailyActivityContext } from '@/lib/ai/prompts'
import { format, subDays } from 'date-fns'

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
  const startOfDay = new Date(`${dateStr}T00:00:00.000Z`)
  const endOfDay = new Date(`${dateStr}T23:59:59.999Z`)

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

    // Fetch raw sessions for this developer on this date
    const sessions = await prisma.rawSession.findMany({
      where: {
        developerId: developer.id,
        startedAt: { gte: startOfDay, lte: endOfDay },
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

    // Skip if no activity
    if (sessions.length === 0 && commits.length === 0) continue

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
      sessions: sessions.map((s) => ({
        sessionId: s.sessionId,
        projectPath: s.projectPath,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        durationSeconds: s.durationSeconds,
        totalInputTokens: s.totalInputTokens,
        totalOutputTokens: s.totalOutputTokens,
        messageCount: s.messageCount,
        toolUseCount: s.toolUseCount,
        model: s.model,
        toolBreakdown: s.toolBreakdown as Record<string, number> | null,
        filesReferenced: s.filesReferenced,
        firstUserPrompt: s.firstUserPrompt,
        userPromptCount: s.userPromptCount,
      })),
      commits: commits.map((c) => ({
        commitHash: c.commitHash,
        repoPath: c.repoPath,
        committedAt: c.committedAt,
        message: c.message,
        filesChanged: c.filesChanged,
        insertions: c.insertions,
        deletions: c.deletions,
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
