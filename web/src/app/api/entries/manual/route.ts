import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const manualEntrySchema = z.object({
  date: z.string(),
  projectId: z.string(),
  hours: z.number().min(0.25).max(24),
  phase: z.enum(['preliminary', 'application_development', 'post_implementation']),
  description: z.string().min(1),
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

  const entry = await prisma.manualEntry.create({
    data: {
      developerId: developer.id,
      date: new Date(`${date}T00:00:00.000Z`),
      projectId,
      hours,
      phase,
      description,
    },
    include: {
      project: { select: { id: true, name: true, phase: true } },
    },
  })

  return NextResponse.json(entry, { status: 201 })
}
