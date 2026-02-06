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

  let sessionsCreated = 0
  let sessionsSkipped = 0
  let commitsCreated = 0
  let commitsSkipped = 0

  try {
    // Upsert sessions (skip duplicates via unique constraint)
    for (const session of sessions) {
      try {
        await prisma.rawSession.create({
          data: {
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
          },
        })
        sessionsCreated++
      } catch (err: unknown) {
        // Skip duplicates (unique constraint on developerId + sessionId)
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
        await prisma.rawCommit.create({
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
        // Skip duplicates (unique constraint on commitHash + repoPath)
        if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
          commitsSkipped++
        } else {
          throw err
        }
      }
    }

    // Mark sync complete
    await prisma.agentSyncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        sessionsCount: sessionsCreated,
        commitsCount: commitsCreated,
      },
    })

    return NextResponse.json({
      syncLogId: syncLog.id,
      sessionsCreated,
      sessionsSkipped,
      commitsCreated,
      commitsSkipped,
    })
  } catch (err) {
    // Mark sync failed
    await prisma.agentSyncLog.update({
      where: { id: syncLog.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
        sessionsCount: sessionsCreated,
        commitsCount: commitsCreated,
      },
    })

    return NextResponse.json(
      { error: 'Sync failed', details: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
