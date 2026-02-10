import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgent } from '@/lib/agent-auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const stateSchema = z.object({
  hostname: z.string(),
  osInfo: z.string(),
  discoveredPaths: z.array(z.object({
    localPath: z.string(),
    claudePath: z.string().nullable(),
    hasGit: z.boolean(),
    excluded: z.boolean(),
  })),
  hooksInstalled: z.boolean(),
})

// POST /api/agent/report-state — Agent reports its machine state
export async function POST(request: NextRequest) {
  const auth = await authenticateAgent(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const parsed = stateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }

    await prisma.agentKey.update({
      where: { id: auth.agentKey.id },
      data: {
        hostname: parsed.data.hostname,
        osInfo: parsed.data.osInfo,
        discoveredPaths: parsed.data.discoveredPaths,
        hooksInstalled: parsed.data.hooksInstalled,
        lastReportedAt: new Date(),
      },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error saving agent state:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
