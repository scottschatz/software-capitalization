import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'
import { assertPeriodOpen, PeriodLockedError } from '@/lib/period-lock'
import { z } from 'zod'

type RouteParams = { params: Promise<{ id: string }> }

const reassignSchema = z.object({
  enhancementProjectId: z.string(),
})

// PATCH /api/entries/[id]/reassign — Reassign an entry to an enhancement project
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const developer = await getDeveloper()
  if (!developer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const parsed = reassignSchema.safeParse(body)

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

    // Ownership check: entry must belong to current developer (or admin/manager)
    const isManager = developer.role === 'admin' || developer.role === 'manager'
    if (entry.developerId !== developer.id && !isManager) {
      return NextResponse.json({ error: 'Not your entry' }, { status: 403 })
    }

    // Entry must be unconfirmed
    if (entry.status === 'confirmed' || entry.status === 'approved' || entry.status === 'rejected') {
      return NextResponse.json(
        { error: 'Cannot reassign confirmed, approved, or rejected entries' },
        { status: 403 }
      )
    }

    // Period lock check
    try {
      await assertPeriodOpen(entry.date)
    } catch (err) {
      if (err instanceof PeriodLockedError) {
        return NextResponse.json({ error: err.message }, { status: 423 })
      }
      throw err
    }

    // Validate enhancement project
    const enhancement = await prisma.project.findUniqueOrThrow({
      where: { id: parsed.data.enhancementProjectId },
    })

    // Enhancement must be a child of the entry's current project
    if (enhancement.parentProjectId !== entry.projectId) {
      return NextResponse.json(
        { error: 'Enhancement project must be a child of the entry\'s current project' },
        { status: 400 }
      )
    }

    // Enhancement must be in application_development phase
    if (enhancement.phase !== 'application_development') {
      return NextResponse.json(
        { error: 'Enhancement project must be in application_development phase' },
        { status: 400 }
      )
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Record revision for the project change
      const revisionCount = await tx.dailyEntryRevision.count({
        where: { entryId: id },
      })

      await tx.dailyEntryRevision.create({
        data: {
          entryId: id,
          revision: revisionCount + 1,
          changedById: developer.id,
          field: 'projectId',
          oldValue: entry.projectId,
          newValue: parsed.data.enhancementProjectId,
          reason: 'Reassigned to enhancement project (post-implementation reclassification)',
          authMethod: 'web_session',
        },
      })

      // Remove enhancement warning from description
      const enhIdx = entry.descriptionAuto?.indexOf('\n⚠️ Enhancement Suggested:') ?? -1
      const cleanDescription = enhIdx >= 0
        ? entry.descriptionAuto!.slice(0, enhIdx).trim()
        : entry.descriptionAuto

      // Update the entry
      const result = await tx.dailyEntry.update({
        where: { id },
        data: {
          projectId: parsed.data.enhancementProjectId,
          phaseAuto: 'application_development',
          status: 'pending',
          descriptionAuto: cleanDescription,
        },
        include: {
          project: { select: { id: true, name: true, phase: true } },
        },
      })

      return result
    })

    return NextResponse.json(updated)
  } catch (err) {
    console.error('Error reassigning entry:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
