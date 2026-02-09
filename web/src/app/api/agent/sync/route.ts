import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgent } from '@/lib/agent-auth'
import { prisma } from '@/lib/prisma'
import { syncPayloadSchema } from '@/lib/validations/sync'

// POST /api/agent/sync — Receive session + commit data from local agent
export async function POST(request: NextRequest) {
  const auth = await authenticateAgent(request)
  if (!auth) {
    return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 })
  }

  const { developer, agentKey } = auth
  const body = await request.json()
  const parsed = syncPayloadSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { sessions, commits, syncType, fromDate, toDate } = parsed.data
  const isReparse = syncType === 'reparse'

  // Create sync log
  const syncLog = await prisma.agentSyncLog.create({
    data: {
      developerId: developer.id,
      agentKeyId: agentKey.id,
      syncType,
      startedAt: new Date(),
      status: 'running',
      fromDate: fromDate ? new Date(fromDate) : null,
      toDate: toDate ? new Date(toDate) : null,
    },
  })

  try {
    // Wrap all session and commit upserts in a single transaction (with extended timeout for large payloads)
    const result = await prisma.$transaction(async (tx) => {
      let sessionsCreated = 0
      let sessionsSkipped = 0
      let sessionsUpdated = 0
      let commitsCreated = 0
      let commitsSkipped = 0

      for (const session of sessions) {
        try {
          const sessionData = {
            developerId: developer.id,
            sessionId: session.sessionId,
            projectPath: session.projectPath,
            gitBranch: session.gitBranch ?? null,
            claudeVersion: session.claudeVersion ?? null,
            slug: session.slug ?? null,
            startedAt: new Date(session.startedAt),
            endedAt: session.endedAt ? new Date(session.endedAt) : null,
            durationSeconds: session.durationSeconds ?? null,
            totalInputTokens: session.totalInputTokens,
            totalOutputTokens: session.totalOutputTokens,
            totalCacheReadTokens: session.totalCacheReadTokens,
            totalCacheCreateTokens: session.totalCacheCreateTokens,
            messageCount: session.messageCount,
            toolUseCount: session.toolUseCount,
            model: session.model ?? null,
            rawJsonlPath: session.rawJsonlPath ?? null,
            isBackfill: session.isBackfill,
            syncLogId: syncLog.id,
            toolBreakdown: session.toolBreakdown ?? undefined,
            filesReferenced: session.filesReferenced ?? [],
            userPromptCount: session.userPromptCount ?? null,
            firstUserPrompt: session.firstUserPrompt ?? null,
            dailyBreakdown: session.dailyBreakdown ?? undefined,
          }

          // Always upsert: session files grow as conversations continue,
          // so we need to update core metrics (duration, messages, tokens)
          // on every sync, not just on first creation.
          const existing = await tx.rawSession.findUnique({
            where: {
              developerId_sessionId: {
                developerId: developer.id,
                sessionId: session.sessionId,
              },
            },
            select: { id: true },
          })

          if (existing) {
            await tx.rawSession.update({
              where: { id: existing.id },
              data: {
                endedAt: sessionData.endedAt,
                durationSeconds: sessionData.durationSeconds,
                totalInputTokens: sessionData.totalInputTokens,
                totalOutputTokens: sessionData.totalOutputTokens,
                totalCacheReadTokens: sessionData.totalCacheReadTokens,
                totalCacheCreateTokens: sessionData.totalCacheCreateTokens,
                messageCount: sessionData.messageCount,
                toolUseCount: sessionData.toolUseCount,
                model: sessionData.model,
                toolBreakdown: sessionData.toolBreakdown,
                filesReferenced: sessionData.filesReferenced,
                userPromptCount: sessionData.userPromptCount,
                firstUserPrompt: sessionData.firstUserPrompt,
                dailyBreakdown: sessionData.dailyBreakdown,
              },
            })
            sessionsUpdated++
          } else {
            await tx.rawSession.create({ data: sessionData })
            sessionsCreated++
          }
        } catch (err: unknown) {
          if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
            sessionsSkipped++
          } else {
            throw err
          }
        }
      }

      // Upsert commits (skip duplicates via unique constraint)
      for (const commit of commits) {
        try {
          await tx.rawCommit.create({
            data: {
              developerId: developer.id,
              commitHash: commit.commitHash,
              repoPath: commit.repoPath,
              branch: commit.branch ?? null,
              authorName: commit.authorName,
              authorEmail: commit.authorEmail,
              committedAt: new Date(commit.committedAt),
              message: commit.message,
              filesChanged: commit.filesChanged,
              insertions: commit.insertions,
              deletions: commit.deletions,
              isBackfill: commit.isBackfill,
              syncLogId: syncLog.id,
            },
          })
          commitsCreated++
        } catch (err: unknown) {
          if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
            commitsSkipped++
          } else {
            throw err
          }
        }
      }

      return { sessionsCreated, sessionsUpdated, sessionsSkipped, commitsCreated, commitsSkipped }
    }, { timeout: 30000 })

    // Mark sync complete
    await prisma.agentSyncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        sessionsCount: result.sessionsCreated + result.sessionsUpdated,
        commitsCount: result.commitsCreated,
      },
    })

    return NextResponse.json({
      syncLogId: syncLog.id,
      ...result,
    })
  } catch (err) {
    await prisma.agentSyncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
      },
    })

    return NextResponse.json(
      { error: 'Sync failed', details: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
