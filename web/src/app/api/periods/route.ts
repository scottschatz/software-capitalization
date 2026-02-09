import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

// GET /api/periods — List all period locks (any authenticated user)
export async function GET(request: NextRequest) {
  const developer = await getDeveloper()
  if (!developer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const yearParam = searchParams.get('year')
  const monthParam = searchParams.get('month')

  // If year and month are specified, return a single period lock
  if (yearParam && monthParam) {
    const year = parseInt(yearParam, 10)
    const month = parseInt(monthParam, 10)

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json({ error: 'Invalid year or month' }, { status: 400 })
    }

    const lock = await prisma.periodLock.findUnique({
      where: { year_month: { year, month } },
      include: { lockedBy: { select: { displayName: true, email: true } } },
    })

    // Return a default "open" status if no record exists
    if (!lock) {
      return NextResponse.json({ year, month, status: 'open', lockedBy: null, lockedAt: null, note: null })
    }

    return NextResponse.json(lock)
  }

  // Otherwise list all period locks
  const locks = await prisma.periodLock.findMany({
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    include: { lockedBy: { select: { displayName: true, email: true } } },
  })

  return NextResponse.json(locks)
}

const periodLockSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
  status: z.enum(['open', 'soft_close', 'locked']),
  note: z.string().optional(),
})

// POST /api/periods — Lock/unlock a period (admin only)
export async function POST(request: NextRequest) {
  const developer = await getDeveloper()
  if (!developer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (developer.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = periodLockSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { year, month, status, note } = parsed.data

  const lock = await prisma.periodLock.upsert({
    where: { year_month: { year, month } },
    create: {
      year,
      month,
      status,
      note: note ?? null,
      lockedById: status === 'locked' ? developer.id : null,
      lockedAt: status === 'locked' ? new Date() : null,
    },
    update: {
      status,
      note: note ?? null,
      lockedById: status === 'locked' ? developer.id : (status === 'open' ? null : undefined),
      lockedAt: status === 'locked' ? new Date() : (status === 'open' ? null : undefined),
    },
    include: { lockedBy: { select: { displayName: true, email: true } } },
  })

  return NextResponse.json(lock)
}
