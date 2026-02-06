import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

type RouteParams = { params: Promise<{ id: string }> }

const confirmSchema = z.object({
  hoursConfirmed: z.number().min(0),
  phaseConfirmed: z.enum(['preliminary', 'application_development', 'post_implementation']),
  descriptionConfirmed: z.string().min(1),
  projectId: z.string().optional(),
  adjustmentReason: z.string().optional().nullable(),
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
    })

    if (entry.developerId !== developer.id) {
      return NextResponse.json({ error: 'Not your entry' }, { status: 403 })
    }

    const { hoursConfirmed, phaseConfirmed, descriptionConfirmed, projectId, adjustmentReason } =
      parsed.data

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

    // Record revision if entry was previously confirmed
    if (entry.confirmedAt) {
      const revisionCount = await prisma.dailyEntryRevision.count({
        where: { entryId: id },
      })

      const fields = ['hoursConfirmed', 'phaseConfirmed', 'descriptionConfirmed'] as const
      for (const field of fields) {
        const oldVal = entry[field]
        const newVal = parsed.data[field]
        if (String(oldVal ?? '') !== String(newVal)) {
          await prisma.dailyEntryRevision.create({
            data: {
              entryId: id,
              revision: revisionCount + 1,
              changedById: developer.id,
              field,
              oldValue: oldVal == null ? null : String(oldVal),
              newValue: String(newVal),
              reason: adjustmentReason,
            },
          })
        }
      }
    }

    const updated = await prisma.dailyEntry.update({
      where: { id },
      data: {
        hoursConfirmed,
        phaseConfirmed,
        descriptionConfirmed,
        projectId: projectId ?? entry.projectId,
        confirmedAt: new Date(),
        confirmedById: developer.id,
        adjustmentReason: adjustmentReason ?? null,
        status: 'confirmed',
      },
      include: {
        project: { select: { id: true, name: true, phase: true } },
      },
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('Error in confirming entry:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
