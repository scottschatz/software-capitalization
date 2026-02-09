import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'
import { assertPeriodOpen, PeriodLockedError } from '@/lib/period-lock'
import { z } from 'zod'

const bulkReassignSchema = z.object({
  entryIds: z.array(z.string()).min(1).max(200),
  enhancementProjectId: z.string(),
})

// PATCH /api/entries/reassign-bulk — Bulk reassign entries to an enhancement project
export async function PATCH(request: NextRequest) {
  const developer = await getDeveloper()
  if (!developer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = bulkReassignSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { entryIds, enhancementProjectId } = parsed.data
  const isManager = developer.role === 'admin' || developer.role === 'manager'

  try {
    // Validate enhancement project
    const enhancement = await prisma.project.findUniqueOrThrow({
      where: { id: enhancementProjectId },
    })

    if (enhancement.phase !== 'application_development') {
      return NextResponse.json(
        { error: 'Enhancement project must be in application_development phase' },
        { status: 400 }
      )
    }

    if (!enhancement.parentProjectId) {
      return NextResponse.json(
        { error: 'Target project must be an enhancement (child) project' },
        { status: 400 }
      )
    }

    // Fetch all entries
    const entries = await prisma.dailyEntry.findMany({
      where: { id: { in: entryIds } },
    })

    const reassigned: string[] = []
    const skipped: Array<{ id: string; reason: string }> = []

    const result = await prisma.$transaction(async (tx) => {
      for (const entry of entries) {
        // Ownership check
        if (entry.developerId !== developer.id && !isManager) {
          skipped.push({ id: entry.id, reason: 'Not your entry' })
          continue
        }

        // Must be unconfirmed
        if (entry.status === 'confirmed' || entry.status === 'approved' || entry.status === 'rejected') {
          skipped.push({ id: entry.id, reason: `Entry is ${entry.status}` })
          continue
        }

        // Enhancement must be child of entry's project
        if (enhancement.parentProjectId !== entry.projectId) {
          skipped.push({ id: entry.id, reason: 'Enhancement is not a child of entry\'s project' })
          continue
        }

        // Period lock check
        try {
          await assertPeriodOpen(entry.date)
        } catch (err) {
          if (err instanceof PeriodLockedError) {
            skipped.push({ id: entry.id, reason: err.message })
            continue
          }
          throw err
        }

        // Record revision
        const revisionCount = await tx.dailyEntryRevision.count({
          where: { entryId: entry.id },
        })

        await tx.dailyEntryRevision.create({
          data: {
            entryId: entry.id,
            revision: revisionCount + 1,
            changedById: developer.id,
            field: 'projectId',
            oldValue: entry.projectId,
            newValue: enhancementProjectId,
            reason: 'Bulk reassigned to enhancement project (post-implementation reclassification)',
            authMethod: 'web_session',
          },
        })

        // Clean enhancement warning from description
        const enhIdx = entry.descriptionAuto?.indexOf('\n⚠️ Enhancement Suggested:') ?? -1
        const cleanDescription = enhIdx >= 0
          ? entry.descriptionAuto!.slice(0, enhIdx).trim()
          : entry.descriptionAuto

        await tx.dailyEntry.update({
          where: { id: entry.id },
          data: {
            projectId: enhancementProjectId,
            phaseAuto: 'application_development',
            status: 'pending',
            descriptionAuto: cleanDescription,
          },
        })

        reassigned.push(entry.id)
      }

      return { reassigned: reassigned.length, skipped }
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('Error in bulk reassignment:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
