import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'
import { assertPeriodOpen, PeriodLockedError } from '@/lib/period-lock'
import { z } from 'zod'

type RouteParams = { params: Promise<{ id: string }> }

const confirmSchema = z.object({
  hoursConfirmed: z.number().min(0),
  phaseConfirmed: z.enum(['preliminary', 'application_development', 'post_implementation']),
  descriptionConfirmed: z.string().min(1),
  projectId: z.string().optional(),
  adjustmentReason: z.string().optional().nullable(),
  adjustmentFactor: z.number().min(0).max(1.5).optional(),
  developerNote: z.string().max(500).optional().nullable(),
})

// PATCH /api/entries/[id]/confirm — Confirm a single daily entry
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const developer = await getDeveloper()
  if (!developer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const parsed = confirmSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  try {
    const entry = await prisma.dailyEntry.findUniqueOrThrow({
      where: { id },
      include: { project: { select: { requiresManagerApproval: true } } },
    })

    if (entry.developerId !== developer.id) {
      return NextResponse.json({ error: 'Not your entry' }, { status: 403 })
    }

    if (entry.status === 'approved' || entry.status === 'rejected') {
      return NextResponse.json(
        { error: 'Cannot modify approved or rejected entries' },
        { status: 403 }
      )
    }

    // Period lock check — prevent modifications to locked accounting periods
    try {
      await assertPeriodOpen(entry.date)
    } catch (err) {
      if (err instanceof PeriodLockedError) {
        return NextResponse.json({ error: err.message }, { status: 423 })
      }
      throw err
    }

    const { hoursConfirmed, phaseConfirmed, descriptionConfirmed, projectId, adjustmentReason, adjustmentFactor, developerNote } =
      parsed.data

    // Daily hours cap: total confirmed hours for this developer on this date must not exceed 14h
    const existingHours = await prisma.dailyEntry.aggregate({
      where: {
        developerId: developer.id,
        date: entry.date,
        id: { not: id }, // exclude current entry being confirmed
      },
      _sum: { hoursConfirmed: true, hoursEstimated: true },
    })
    const existingManualHours = await prisma.manualEntry.aggregate({
      where: { developerId: developer.id, date: entry.date },
      _sum: { hours: true },
    })
    const otherHours =
      (existingHours._sum.hoursConfirmed ?? existingHours._sum.hoursEstimated ?? 0) +
      (existingManualHours._sum.hours ?? 0)
    if (otherHours + hoursConfirmed > 14) {
      return NextResponse.json(
        { error: `Total hours for this date would exceed 14h (existing: ${otherHours}h, confirming: ${hoursConfirmed}h)` },
        { status: 400 }
      )
    }

    // Check if hours changed >20% and adjustment reason is required
    if (entry.hoursEstimated) {
      const pctChange = Math.abs(hoursConfirmed - entry.hoursEstimated) / entry.hoursEstimated
      if (pctChange > 0.2 && !adjustmentReason) {
        return NextResponse.json(
          { error: 'Adjustment reason required when hours change more than 20%' },
          { status: 400 }
        )
      }
    }

    // Record revisions and update entry in a single transaction
    const updated = await prisma.$transaction(async (tx) => {
      // Record revisions: on first confirm, compare against AI originals;
      // on re-confirm, compare against previous confirmed values.
      const isReconfirm = !!entry.confirmedAt
      const revisionCount = await tx.dailyEntryRevision.count({
        where: { entryId: id },
      })

      // Strip AI metadata suffix from descriptionAuto for comparison
      const aiDescClean = entry.descriptionAuto?.split('\n---\n')[0]?.trim() ?? ''

      const comparisons: Array<{ field: string; oldVal: string | null; newVal: string }> = isReconfirm
        ? [
            { field: 'hoursConfirmed', oldVal: entry.hoursConfirmed == null ? null : String(entry.hoursConfirmed), newVal: String(hoursConfirmed) },
            { field: 'phaseConfirmed', oldVal: entry.phaseConfirmed, newVal: phaseConfirmed },
            { field: 'descriptionConfirmed', oldVal: entry.descriptionConfirmed, newVal: descriptionConfirmed },
          ]
        : [
            { field: 'hoursConfirmed', oldVal: entry.hoursEstimated == null ? null : String(entry.hoursEstimated), newVal: String(hoursConfirmed) },
            { field: 'phaseConfirmed', oldVal: entry.phaseAuto, newVal: phaseConfirmed },
            { field: 'descriptionConfirmed', oldVal: aiDescClean || null, newVal: descriptionConfirmed },
          ]

      // Track adjustment factor change if provided
      if (adjustmentFactor != null && adjustmentFactor !== (entry.adjustmentFactor ?? 1.0)) {
        comparisons.push({
          field: 'adjustmentFactor',
          oldVal: String(entry.adjustmentFactor ?? 1.0),
          newVal: String(adjustmentFactor),
        })
      }

      let revNum = revisionCount
      for (const { field, oldVal, newVal } of comparisons) {
        if (String(oldVal ?? '') !== String(newVal)) {
          revNum++
          await tx.dailyEntryRevision.create({
            data: {
              entryId: id,
              revision: revNum,
              changedById: developer.id,
              field,
              oldValue: oldVal,
              newValue: newVal,
              reason: adjustmentReason,
              authMethod: 'web_session',
            },
          })
        }
      }

      // Recalculate hoursEstimated if adjustment factor was changed
      const newFactor = adjustmentFactor ?? entry.adjustmentFactor
      const recalcEstimated = (adjustmentFactor != null && entry.hoursRaw != null)
        ? Math.round(entry.hoursRaw * adjustmentFactor * 100) / 100
        : undefined

      const result = await tx.dailyEntry.update({
        where: { id },
        data: {
          hoursConfirmed,
          phaseConfirmed,
          descriptionConfirmed,
          projectId: projectId ?? entry.projectId,
          confirmedAt: new Date(),
          confirmedById: developer.id,
          adjustmentReason: adjustmentReason ?? null,
          confirmationMethod: 'individual',
          status: entry.project?.requiresManagerApproval ? 'pending_approval' : 'confirmed',
          ...(newFactor != null ? { adjustmentFactor: newFactor } : {}),
          ...(recalcEstimated != null ? { hoursEstimated: recalcEstimated } : {}),
          ...(developerNote !== undefined ? { developerNote: developerNote ?? null } : {}),
        },
        include: {
          project: { select: { id: true, name: true, phase: true } },
        },
      })

      return result
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('Error in confirming entry:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
