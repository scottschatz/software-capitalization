import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgent } from '@/lib/agent-auth'
import { prisma } from '@/lib/prisma'

// GET /api/agent/activity — Tool usage summary from raw_tool_events + raw_sessions
export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { developer } = auth
  const { searchParams } = new URL(request.url)
  const dateParam = searchParams.get('date')

  // Default to today
  const targetDate = dateParam ? new Date(dateParam) : new Date()
  const dayStart = new Date(targetDate.toISOString().split('T')[0])
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)

  // Get tool events for the day
  const toolEvents = await prisma.rawToolEvent.findMany({
    where: {
      developerId: developer.id,
      timestamp: { gte: dayStart, lt: dayEnd },
    },
    select: {
      toolName: true,
      projectPath: true,
      timestamp: true,
    },
    orderBy: { timestamp: 'asc' },
  })

  // Get sessions for the day
  const sessions = await prisma.rawSession.findMany({
    where: {
      developerId: developer.id,
      startedAt: { gte: dayStart, lt: dayEnd },
    },
    select: {
      sessionId: true,
      projectPath: true,
      startedAt: true,
      endedAt: true,
      durationSeconds: true,
      messageCount: true,
      toolUseCount: true,
      toolBreakdown: true,
    },
  })

  // Get commits for the day
  const commits = await prisma.rawCommit.findMany({
    where: {
      developerId: developer.id,
      committedAt: { gte: dayStart, lt: dayEnd },
    },
    select: {
      commitHash: true,
      repoPath: true,
      message: true,
      filesChanged: true,
      insertions: true,
      deletions: true,
    },
  })

  // Aggregate tool breakdown from real-time events
  const toolBreakdown: Record<string, number> = {}
  for (const event of toolEvents) {
    toolBreakdown[event.toolName] = (toolBreakdown[event.toolName] || 0) + 1
  }

  // If no real-time events, fall back to session-level tool breakdowns
  if (toolEvents.length === 0) {
    for (const session of sessions) {
      if (session.toolBreakdown && typeof session.toolBreakdown === 'object') {
        const breakdown = session.toolBreakdown as Record<string, number>
        for (const [tool, count] of Object.entries(breakdown)) {
          toolBreakdown[tool] = (toolBreakdown[tool] || 0) + count
        }
      }
    }
  }

  // Collect unique project paths
  const projectPaths = new Set<string>()
  for (const event of toolEvents) {
    if (event.projectPath) projectPaths.add(event.projectPath)
  }
  for (const session of sessions) {
    if (session.projectPath) projectPaths.add(session.projectPath)
  }

  return NextResponse.json({
    date: dayStart.toISOString().split('T')[0],
    toolEvents: toolEvents.length,
    toolBreakdown,
    sessions: sessions.length,
    totalMessages: sessions.reduce((sum, s) => sum + s.messageCount, 0),
    totalToolUses: sessions.reduce((sum, s) => sum + s.toolUseCount, 0),
    commits: commits.length,
    commitSummary: commits.map((c) => ({
      hash: c.commitHash.slice(0, 8),
      repo: c.repoPath.split('/').pop(),
      message: c.message.slice(0, 80),
      changes: `+${c.insertions}/-${c.deletions}`,
    })),
    projectPaths: [...projectPaths],
  })
}
