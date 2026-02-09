import 'dotenv/config'
import { prisma } from '@/lib/prisma'
import { buildDailyEntryPrompt, type DailyActivityContext } from '@/lib/ai/prompts'
import { subDays } from 'date-fns'

const DAY_TZ = process.env.CAP_TIMEZONE ?? 'America/New_York'

function getLocalDayBounds(dateStr: string): { startOfDay: Date; endOfDay: Date } {
  const refDate = new Date(`${dateStr}T12:00:00Z`)
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: DAY_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
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
  const startOfDay = new Date(`${dateStr}T00:00:00Z`)
  startOfDay.setUTCHours(startOfDay.getUTCHours() - offsetHours)
  const endOfDay = new Date(`${dateStr}T23:59:59.999Z`)
  endOfDay.setUTCHours(endOfDay.getUTCHours() - offsetHours)
  return { startOfDay, endOfDay }
}

// Rough token estimate: ~4 chars per token for English text
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

async function main() {
  // Get all dates with activity
  const dates = await prisma.$queryRawUnsafe<Array<{ d: string }>>(`
    SELECT DISTINCT d.value->>'date' as d
    FROM raw_sessions s, jsonb_array_elements(s.daily_breakdown::jsonb) d
    WHERE s.developer_id = (SELECT id FROM developers LIMIT 1)
      AND d.value->>'date' >= '2025-12-01'
    ORDER BY d
  `)

  const developer = await prisma.developer.findFirst({
    where: { active: true },
    select: { id: true, email: true, displayName: true },
  })
  if (!developer) { console.log('No developer found'); return }

  const projects = await prisma.project.findMany({
    where: { status: { notIn: ['abandoned', 'suspended'] }, monitored: true },
    include: {
      repos: { select: { repoPath: true } },
      claudePaths: { select: { claudePath: true, localPath: true } },
    },
  })

  interface DailyBreakdownEntry {
    date: string; firstTimestamp?: string; lastTimestamp?: string
    activeMinutes?: number; wallClockMinutes?: number
    messageCount: number; toolUseCount: number; userPromptCount: number
    userPromptSamples: string[]; userPrompts?: Array<{ time: string; text: string }>
  }

  console.log('Date         Chars    ~Tokens  Sessions  Note')
  console.log('------------ ------   -------  --------  ----')

  for (const { d: dateStr } of dates) {
    const { startOfDay, endOfDay } = getLocalDayBounds(dateStr)

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
        sessionId: true, projectPath: true, startedAt: true, endedAt: true,
        durationSeconds: true, totalInputTokens: true, totalOutputTokens: true,
        messageCount: true, toolUseCount: true, model: true,
        toolBreakdown: true, filesReferenced: true, firstUserPrompt: true,
        userPromptCount: true, dailyBreakdown: true,
      },
    })

    const commits = await prisma.rawCommit.findMany({
      where: {
        developerId: developer.id,
        committedAt: { gte: startOfDay, lte: endOfDay },
      },
      select: {
        commitHash: true, repoPath: true, committedAt: true,
        message: true, filesChanged: true, insertions: true, deletions: true,
      },
    })

    const toolEvents = await prisma.rawToolEvent.findMany({
      where: { developerId: developer.id, timestamp: { gte: startOfDay, lte: endOfDay } },
      select: { toolName: true, projectPath: true, toolInput: true, timestamp: true },
      orderBy: { timestamp: 'asc' },
    })

    const filteredSessions = sessions.filter((s) => {
      const breakdown = s.dailyBreakdown as DailyBreakdownEntry[] | null
      if (!breakdown || breakdown.length === 0) return true
      const dayData = breakdown.find((d) => d.date === dateStr)
      return dayData != null && ((dayData.messageCount ?? 0) > 0 || (dayData.activeMinutes ?? 0) > 0)
    })

    if (filteredSessions.length === 0 && commits.length === 0) continue

    const mappedSessions = filteredSessions.map((s) => {
      const breakdown = s.dailyBreakdown as DailyBreakdownEntry[] | null
      const dayData = breakdown?.find((d) => d.date === dateStr)
      return {
        sessionId: s.sessionId, projectPath: s.projectPath,
        startedAt: s.startedAt, endedAt: s.endedAt,
        durationSeconds: s.durationSeconds, totalInputTokens: s.totalInputTokens,
        totalOutputTokens: s.totalOutputTokens,
        messageCount: dayData?.messageCount ?? s.messageCount,
        toolUseCount: dayData?.toolUseCount ?? s.toolUseCount,
        model: s.model, toolBreakdown: s.toolBreakdown as Record<string, number> | null,
        filesReferenced: s.filesReferenced, firstUserPrompt: s.firstUserPrompt,
        userPromptCount: dayData?.userPromptCount ?? s.userPromptCount,
        userPromptSamples: dayData?.userPromptSamples ?? [],
        activeWindow: dayData?.firstTimestamp && dayData?.lastTimestamp
          ? { first: dayData.firstTimestamp, last: dayData.lastTimestamp, minutes: dayData.activeMinutes ?? 0, wallClockMinutes: dayData.wallClockMinutes ?? 0 }
          : null,
        userPrompts: dayData?.userPrompts ?? [],
      }
    })

    const ctx: DailyActivityContext = {
      developer: { displayName: developer.displayName, email: developer.email },
      date: dateStr,
      projects: projects.map((p) => ({
        id: p.id, name: p.name, phase: p.phase, description: p.description,
        goLiveDate: p.goLiveDate, parentProjectId: p.parentProjectId,
        enhancementLabel: p.enhancementLabel, repos: p.repos, claudePaths: p.claudePaths,
      })),
      sessions: mappedSessions,
      commits: commits.map((c) => ({
        commitHash: c.commitHash, repoPath: c.repoPath, committedAt: c.committedAt,
        message: c.message, filesChanged: c.filesChanged, insertions: c.insertions, deletions: c.deletions,
      })),
      toolEvents: toolEvents.map((e) => ({
        toolName: e.toolName, projectPath: e.projectPath, timestamp: e.timestamp,
        filePath: (e.toolInput as Record<string, unknown> | null)?.file_path as string | undefined,
      })),
    }

    const prompt = buildDailyEntryPrompt(ctx)
    const chars = prompt.length
    const tokens = estimateTokens(prompt)
    const note = tokens > 30000 ? '⚠️ EXCEEDS 32K' : tokens > 20000 ? '⚡ LARGE' : ''

    console.log(`${dateStr}  ${String(chars).padStart(7)}  ${String(tokens).padStart(7)}  ${String(filteredSessions.length).padStart(8)}  ${note}`)
  }

  await prisma.$disconnect()
}

main().catch((err) => { console.error(err); process.exit(1) })
