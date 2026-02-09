import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'

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

  const entry = await prisma.dailyEntry.findUnique({
    where: { id },
    select: { id: true, status: true, developerId: true },
  })

  if (!entry) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
  }

  if (entry.status !== 'flagged') {
    return NextResponse.json({ error: 'Entry must be flagged' }, { status: 400 })
  }

  // Get current revision count for this entry
  const revisionCount = await prisma.dailyEntryRevision.count({
    where: { entryId: id },
  })

  const [updated] = await prisma.$transaction([
    prisma.dailyEntry.update({
      where: { id },
      data: {
        status: 'pending',
      },
    }),
    prisma.dailyEntryRevision.create({
      data: {
        entryId: id,
        revision: revisionCount + 1,
        changedById: developer.id,
        field: 'status',
        oldValue: 'flagged',
        newValue: 'pending',
        reason: 'Unflagged by manager — returned to pending',
        authMethod: 'web_session',
      },
    }),
  ])

  return NextResponse.json(updated)
}
