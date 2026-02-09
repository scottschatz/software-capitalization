import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

type RouteParams = { params: Promise<{ id: string }> }

const noteSchema = z.object({
  developerNote: z.string().max(500).nullable(),
})

// PATCH /api/entries/[id]/note — Save or clear a developer note
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const developer = await getDeveloper()
  if (!developer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const parsed = noteSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  try {
    const entry = await prisma.dailyEntry.findUniqueOrThrow({ where: { id } })

    if (entry.developerId !== developer.id) {
      return NextResponse.json({ error: 'Not your entry' }, { status: 403 })
    }

    const updated = await prisma.dailyEntry.update({
      where: { id },
      data: { developerNote: parsed.data.developerNote },
    })

    return NextResponse.json({ id: updated.id, developerNote: updated.developerNote })
  } catch (err) {
    console.error('Error saving developer note:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
