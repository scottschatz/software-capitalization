import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgent } from '@/lib/agent-auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const confirmSchema = z.object({
  date: z.string(), // YYYY-MM-DD
  adjustments: z.array(z.object({
    entryId: z.string(),
    hours: z.number().optional(),
    phase: z.string().optional(),
    description: z.string().optional(),
  })).optional(),
})

// POST /api/agent/entries/confirm — Confirm entries (with optional adjustments)
export async function POST(request: NextRequest) {
  const auth = await authenticateAgent(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { developer } = auth

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = confirmSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { date, adjustments } = parsed.data
  const adjustmentMap = new Map(
    (adjustments ?? []).map((a) => [a.entryId, a])
  )

  // Find all pending entries for this date
  const entries = await prisma.dailyEntry.findMany({
    where: {
      developerId: developer.id,
      date: new Date(date),
      status: 'pending',
    },
  })

  if (entries.length === 0) {
    return NextResponse.json({ error: 'No pending entries for this date' }, { status: 404 })
  }

  let confirmed = 0
  for (const entry of entries) {
    const adj = adjustmentMap.get(entry.id)
    await prisma.dailyEntry.update({
      where: { id: entry.id },
      data: {
        hoursConfirmed: adj?.hours ?? entry.hoursEstimated,
        phaseConfirmed: adj?.phase ?? entry.phaseAuto,
        descriptionConfirmed: adj?.description ?? entry.descriptionAuto,
        confirmedAt: new Date(),
        confirmedById: developer.id,
        adjustmentReason: adj ? 'Adjusted via MCP' : null,
        status: 'confirmed',
      },
    })
    confirmed++
  }

  return NextResponse.json({ confirmed, date })
}
