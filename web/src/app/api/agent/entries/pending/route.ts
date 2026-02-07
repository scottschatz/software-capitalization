import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgent } from '@/lib/agent-auth'
import { prisma } from '@/lib/prisma'

// GET /api/agent/entries/pending — Unconfirmed entries for developer
export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { developer } = auth
  const { searchParams } = new URL(request.url)
  const dateParam = searchParams.get('date')

  const where: Record<string, unknown> = {
    developerId: developer.id,
    status: 'pending',
  }

  if (dateParam) {
    where.date = new Date(dateParam)
  }

  const entries = await prisma.dailyEntry.findMany({
    where,
    include: {
      project: { select: { id: true, name: true, phase: true } },
    },
    orderBy: { date: 'desc' },
    take: 50,
  })

  return NextResponse.json({
    entries: entries.map((e) => ({
      id: e.id,
      date: e.date.toISOString().split('T')[0],
      projectName: e.project?.name ?? 'Unassigned',
      projectId: e.projectId,
      hoursEstimated: e.hoursEstimated,
      phaseAuto: e.phaseAuto,
      descriptionAuto: e.descriptionAuto,
      status: e.status,
    })),
    count: entries.length,
  })
}
