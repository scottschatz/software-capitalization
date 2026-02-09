import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'
import { assertPeriodOpen, PeriodLockedError } from '@/lib/period-lock'
import { z } from 'zod'
import { MANUAL_ENTRY_AUTO_APPROVE_THRESHOLD } from '@/lib/constants'

const manualEntrySchema = z.object({
  date: z.string(),
  projectId: z.string(),
  hours: z.number().min(0.25).max(10),
  phase: z.enum(['preliminary', 'application_development', 'post_implementation']),
  description: z.string().min(10),
})

// POST /api/entries/manual — Create a manual time entry
export async function POST(request: NextRequest) {
  const developer = await getDeveloper()
  if (!developer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = manualEntrySchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { date, projectId, hours, phase, description } = parsed.data

  // Period lock check — prevent entries in locked accounting periods
  const entryDate = new Date(`${date}T00:00:00.000Z`)
  try {
    await assertPeriodOpen(entryDate)
  } catch (err) {
    if (err instanceof PeriodLockedError) {
      return NextResponse.json({ error: err.message }, { status: 423 })
    }
    throw err
  }

  // Date validation: block future dates and dates > 90 days in the past
  const today = new Date()
  const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
  if (entryDate > todayUTC) {
    return NextResponse.json(
      { error: 'Cannot create entries for future dates' },
      { status: 400 }
    )
  }
  const ninetyDaysAgo = new Date(todayUTC)
  ninetyDaysAgo.setUTCDate(ninetyDaysAgo.getUTCDate() - 90)
  if (entryDate < ninetyDaysAgo) {
    return NextResponse.json(
      { error: 'Cannot create entries more than 90 days in the past' },
      { status: 400 }
    )
  }

  // Reasonableness check: total hours for this developer on this date must not exceed 12
  const existingDailyHours = await prisma.dailyEntry.aggregate({
    where: { developerId: developer.id, date: new Date(`${date}T00:00:00.000Z`) },
    _sum: { hoursConfirmed: true, hoursEstimated: true },
  })
  const existingManualHours = await prisma.manualEntry.aggregate({
    where: { developerId: developer.id, date: new Date(`${date}T00:00:00.000Z`) },
    _sum: { hours: true },
  })
  const totalExisting = (existingDailyHours._sum.hoursConfirmed ?? existingDailyHours._sum.hoursEstimated ?? 0) + (existingManualHours._sum.hours ?? 0)
  if (totalExisting + hours > 12) {
    return NextResponse.json(
      { error: `Total hours for this date would exceed 12h (existing: ${totalExisting}h, adding: ${hours}h)` },
      { status: 400 }
    )
  }

  try {
    const status = hours <= MANUAL_ENTRY_AUTO_APPROVE_THRESHOLD ? 'confirmed' : 'pending_approval'

    const entry = await prisma.manualEntry.create({
      data: {
        developerId: developer.id,
        date: new Date(`${date}T00:00:00.000Z`),
        projectId,
        hours,
        phase,
        description,
        status,
      },
      include: {
        project: { select: { id: true, name: true, phase: true } },
      },
    })

    return NextResponse.json(entry, { status: 201 })
  } catch (err) {
    console.error('Error in creating manual entry:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
