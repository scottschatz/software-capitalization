import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgent } from '@/lib/agent-auth'
import { prisma } from '@/lib/prisma'
import { assertPeriodOpen, PeriodLockedError } from '@/lib/period-lock'
import { z } from 'zod'

const VALID_PHASES = ['preliminary', 'application_development', 'post_implementation'] as const

const confirmSchema = z.object({
  date: z.string(), // YYYY-MM-DD
  adjustments: z.array(z.object({
    entryId: z.string(),
    hours: z.number().optional(),
    phase: z.enum(VALID_PHASES).optional(),
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
  const entryDate = new Date(date)

  // Period lock check — prevent modifications to locked accounting periods
  try {
    await assertPeriodOpen(entryDate)
  } catch (err) {
    if (err instanceof PeriodLockedError) {
      return NextResponse.json({ error: err.message }, { status: 423 })
    }
    throw err
  }

  const adjustmentMap = new Map(
    (adjustments ?? []).map((a) => [a.entryId, a])
  )

  // Find all pending entries for this date
  const entries = await prisma.dailyEntry.findMany({
    where: {
      developerId: developer.id,
      date: entryDate,
      status: 'pending',
    },
  })

  if (entries.length === 0) {
    return NextResponse.json({ error: 'No pending entries for this date' }, { status: 404 })
  }

  // Daily hours cap: total confirmed hours for this developer on this date must not exceed 14h
  const existingHours = await prisma.dailyEntry.aggregate({
    where: {
      developerId: developer.id,
      date: entryDate,
      status: { notIn: ['pending'] },
      id: { notIn: entries.map((e) => e.id) }, // exclude entries being confirmed
    },
    _sum: { hoursConfirmed: true, hoursEstimated: true },
  })
  const existingManualHours = await prisma.manualEntry.aggregate({
    where: { developerId: developer.id, date: entryDate },
    _sum: { hours: true },
  })
  const otherHours =
    (existingHours._sum.hoursConfirmed ?? existingHours._sum.hoursEstimated ?? 0) +
    (existingManualHours._sum.hours ?? 0)

  // Calculate total hours being confirmed in this batch
  let batchHours = 0
  for (const entry of entries) {
    const adj = adjustmentMap.get(entry.id)
    batchHours += adj?.hours ?? entry.hoursEstimated ?? 0
  }

  if (otherHours + batchHours > 14) {
    return NextResponse.json(
      { error: `Total hours for this date would exceed 14h (existing: ${otherHours}h, confirming: ${batchHours}h)` },
      { status: 400 }
    )
  }

  let confirmed = 0
  for (const entry of entries) {
    const adj = adjustmentMap.get(entry.id)
    const hoursConfirmed = adj?.hours ?? entry.hoursEstimated
    const phaseConfirmed = adj?.phase ?? entry.phaseAuto
    const descriptionConfirmed = adj?.description ?? entry.descriptionAuto

    // Create revision records for changed fields
    const revisionCount = await prisma.dailyEntryRevision.count({
      where: { entryId: entry.id },
    })

    const comparisons: Array<{ field: string; oldVal: string | null; newVal: string }> = [
      { field: 'hoursConfirmed', oldVal: entry.hoursEstimated == null ? null : String(entry.hoursEstimated), newVal: String(hoursConfirmed) },
      { field: 'phaseConfirmed', oldVal: entry.phaseAuto, newVal: phaseConfirmed ?? '' },
      { field: 'descriptionConfirmed', oldVal: entry.descriptionAuto?.split('\n---\n')[0]?.trim() ?? null, newVal: descriptionConfirmed ?? '' },
    ]

    let revNum = revisionCount
    for (const { field, oldVal, newVal } of comparisons) {
      if (String(oldVal ?? '') !== String(newVal)) {
        revNum++
        await prisma.dailyEntryRevision.create({
          data: {
            entryId: entry.id,
            revision: revNum,
            changedById: developer.id,
            field,
            oldValue: oldVal,
            newValue: newVal,
            reason: adj ? 'Adjusted via MCP' : null,
            authMethod: 'agent_api',
          },
        })
      }
    }

    await prisma.dailyEntry.update({
      where: { id: entry.id },
      data: {
        hoursConfirmed,
        phaseConfirmed,
        descriptionConfirmed,
        confirmedAt: new Date(),
        confirmedById: developer.id,
        adjustmentReason: adj ? 'Adjusted via MCP' : null,
        confirmationMethod: 'agent',
        status: 'confirmed',
      },
    })
    confirmed++
  }

  return NextResponse.json({ confirmed, date })
}
