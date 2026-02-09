import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

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

const createSchema = z.object({
  email: z.string().email().refine((e) => e.endsWith('@townsquaremedia.com'), {
    message: 'Email must be a @townsquaremedia.com address',
  }),
  displayName: z.string().min(1).max(100),
  role: z.enum(['developer', 'manager', 'admin']),
})

// POST /api/admin/developers — Pre-provision a developer before they sign in via SSO
export async function POST(request: NextRequest) {
  const developer = await getDeveloper()
  if (!developer || developer.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = createSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const existing = await prisma.developer.findUnique({
    where: { email: parsed.data.email },
  })

  if (existing) {
    return NextResponse.json(
      { error: 'Developer with this email already exists' },
      { status: 409 }
    )
  }

  const created = await prisma.developer.create({
    data: {
      email: parsed.data.email,
      displayName: parsed.data.displayName,
      role: parsed.data.role,
    },
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      active: true,
      createdAt: true,
    },
  })

  return NextResponse.json(created, { status: 201 })
}
