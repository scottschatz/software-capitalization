import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const rejectSchema = z.object({
  reason: z.string().min(10, 'Rejection reason must be at least 10 characters'),
})

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const developer = await getDeveloper()
  if (!developer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (developer.role !== 'admin' && developer.role !== 'manager') {
    return NextResponse.json({ error: 'Manager or admin access required' }, { status: 403 })
  }

  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = rejectSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const entry = await prisma.manualEntry.findUnique({
    where: { id },
    select: { id: true, status: true, developerId: true },
  })

  if (!entry) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
  }

  if (entry.status !== 'pending_approval') {
    return NextResponse.json({ error: 'Entry must be pending approval' }, { status: 400 })
  }

  if (entry.developerId === developer.id) {
    return NextResponse.json({ error: 'Cannot reject your own entries (segregation of duties)' }, { status: 403 })
  }

  // Get current revision count for this entry
  const revisionCount = await prisma.manualEntryRevision.count({
    where: { entryId: id },
  })

  const [updated] = await prisma.$transaction([
    prisma.manualEntry.update({
      where: { id },
      data: {
        status: 'rejected',
        rejectedById: developer.id,
        rejectedAt: new Date(),
        rejectionReason: parsed.data.reason,
      },
      include: {
        project: { select: { id: true, name: true, phase: true } },
        developer: { select: { displayName: true, email: true } },
      },
    }),
    prisma.manualEntryRevision.create({
      data: {
        entryId: id,
        revision: revisionCount + 1,
        changedById: developer.id,
        field: 'status',
        oldValue: 'pending_approval',
        newValue: 'rejected',
        reason: parsed.data.reason,
        authMethod: 'web_session',
      },
    }),
  ])

  return NextResponse.json(updated)
}
