import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'
import { assertPeriodOpen, PeriodLockedError } from '@/lib/period-lock'
import { z } from 'zod'

const bulkApproveSchema = z.object({
  entryIds: z.array(z.string()).min(1, 'At least one entry ID is required'),
})

// PATCH /api/entries/approve-bulk — Bulk approve daily entries
export async function PATCH(request: NextRequest) {
  const developer = await getDeveloper()
  if (!developer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (developer.role !== 'admin' && developer.role !== 'manager') {
    return NextResponse.json({ error: 'Manager or admin access required' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = bulkApproveSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { entryIds } = parsed.data

  // Fetch all entries in one query
  const entries = await prisma.dailyEntry.findMany({
    where: { id: { in: entryIds } },
    select: { id: true, status: true, developerId: true, date: true },
  })

  const entryMap = new Map(entries.map((e) => [e.id, e]))
  const skipped: Array<{ id: string; reason: string }> = []
  const toApprove: Array<{ id: string; status: string }> = []

  for (const entryId of entryIds) {
    const entry = entryMap.get(entryId)
    if (!entry) {
      skipped.push({ id: entryId, reason: 'Entry not found' })
      continue
    }
    if (entry.status !== 'confirmed' && entry.status !== 'pending_approval' && entry.status !== 'flagged') {
      skipped.push({ id: entryId, reason: `Entry status "${entry.status}" is not approvable` })
      continue
    }
    if (entry.developerId === developer.id) {
      skipped.push({ id: entryId, reason: 'Cannot approve your own entries (segregation of duties)' })
      continue
    }

    // Period lock check — skip entries in locked accounting periods
    try {
      await assertPeriodOpen(entry.date)
    } catch (err) {
      if (err instanceof PeriodLockedError) {
        skipped.push({ id: entryId, reason: err.message })
        continue
      }
      throw err
    }

    toApprove.push({ id: entryId, status: entry.status })
  }

  // Approve all valid entries in a transaction with revision records
  let approvedCount = 0
  if (toApprove.length > 0) {
    await prisma.$transaction(async (tx) => {
      for (const entry of toApprove) {
        const revisionCount = await tx.dailyEntryRevision.count({
          where: { entryId: entry.id },
        })

        await tx.dailyEntry.update({
          where: { id: entry.id },
          data: {
            approvedById: developer.id,
            approvedAt: new Date(),
            status: 'approved',
          },
        })

        await tx.dailyEntryRevision.create({
          data: {
            entryId: entry.id,
            revision: revisionCount + 1,
            changedById: developer.id,
            field: 'status',
            oldValue: entry.status,
            newValue: 'approved',
            reason: null,
            authMethod: 'web_session',
          },
        })

        approvedCount++
      }
    })
  }

  return NextResponse.json({
    approved: approvedCount,
    skipped,
  })
}
