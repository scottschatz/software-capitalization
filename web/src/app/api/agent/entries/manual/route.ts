import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgent } from '@/lib/agent-auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const manualEntrySchema = z.object({
  projectName: z.string().min(1),
  hours: z.number().positive(),
  description: z.string().min(1),
  date: z.string().optional(), // YYYY-MM-DD, defaults to today
  phase: z.string().optional(), // defaults to project's current phase
})

// POST /api/agent/entries/manual — Create a manual time entry
export async function POST(request: NextRequest) {
  const auth = await authenticateAgent(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { developer } = auth

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = manualEntrySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const data = parsed.data

  // Find project by name (case-insensitive)
  const project = await prisma.project.findFirst({
    where: {
      name: { contains: data.projectName, mode: 'insensitive' },
      monitored: true,
    },
  })

  if (!project) {
    return NextResponse.json(
      { error: `Project "${data.projectName}" not found` },
      { status: 404 }
    )
  }

  const date = data.date ? new Date(data.date) : new Date()
  // Normalize to date only (strip time)
  const dateOnly = new Date(date.toISOString().split('T')[0])

  const entry = await prisma.manualEntry.create({
    data: {
      developerId: developer.id,
      date: dateOnly,
      projectId: project.id,
      hours: data.hours,
      phase: data.phase ?? project.phase,
      description: data.description,
    },
  })

  return NextResponse.json({
    id: entry.id,
    projectName: project.name,
    hours: entry.hours,
    phase: entry.phase,
    date: dateOnly.toISOString().split('T')[0],
    description: entry.description,
  }, { status: 201 })
}
