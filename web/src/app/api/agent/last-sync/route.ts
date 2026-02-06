import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgent } from '@/lib/agent-auth'
import { prisma } from '@/lib/prisma'

// GET /api/agent/last-sync — Return most recent successful sync timestamp
export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request)
  if (!auth) {
    return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 })
  }

  const lastSync = await prisma.agentSyncLog.findFirst({
    where: {
      developerId: auth.developer.id,
      status: 'completed',
    },
    orderBy: { completedAt: 'desc' },
    select: {
      id: true,
      completedAt: true,
      sessionsCount: true,
      commitsCount: true,
      syncType: true,
    },
  })

  return NextResponse.json({
    lastSync: lastSync
      ? {
          id: lastSync.id,
          completedAt: lastSync.completedAt,
          sessionsCount: lastSync.sessionsCount,
          commitsCount: lastSync.commitsCount,
          syncType: lastSync.syncType,
        }
      : null,
  })
}
