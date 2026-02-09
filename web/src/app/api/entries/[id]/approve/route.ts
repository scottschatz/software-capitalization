import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'
import { assertPeriodOpen, PeriodLockedError } from '@/lib/period-lock'

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
    select: { id: true, status: true, developerId: true, confirmedById: true, date: true },
  })

  if (!entry) {
    return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
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

  if (entry.status !== 'confirmed' && entry.status !== 'pending_approval' && entry.status !== 'flagged') {
    return NextResponse.json({ error: 'Entry must be confirmed, pending approval, or flagged' }, { status: 400 })
  }

  if (entry.developerId === developer.id) {
    return NextResponse.json({ error: 'Cannot approve your own entries (segregation of duties)' }, { status: 403 })
  }

  const updated = await prisma.dailyEntry.update({
    where: { id },
    data: {
      approvedById: developer.id,
      approvedAt: new Date(),
      status: 'approved',
    },
  })

  return NextResponse.json(updated)
}
