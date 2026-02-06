import { NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'

// GET /api/admin/developers — List all developers with stats
export async function GET() {
  const developer = await getDeveloper()
  if (!developer || developer.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  try {
    const developers = await prisma.developer.findMany({
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        active: true,
        createdAt: true,
        lastLoginAt: true,
        agentKeys: {
          where: { active: true },
          select: { id: true, keyPrefix: true, machineName: true, lastUsedAt: true, createdAt: true },
        },
        _count: {
          select: {
            rawSessions: true,
            rawCommits: true,
            dailyEntries: true,
          },
        },
      },
      orderBy: { displayName: 'asc' },
    })

    // Get last sync for each developer
    const lastSyncs = await prisma.agentSyncLog.findMany({
      where: { status: 'success' },
      orderBy: { completedAt: 'desc' },
      distinct: ['developerId'],
      select: { developerId: true, completedAt: true, syncType: true },
    })

    const syncMap = new Map(lastSyncs.map((s) => [s.developerId, s]))

    return NextResponse.json(
      developers.map((d) => ({
        ...d,
        lastSync: syncMap.get(d.id) ?? null,
      }))
    )
  } catch (err) {
    console.error('Error in listing developers:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
