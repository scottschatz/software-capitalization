import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const updateSchema = z.object({
  adjustmentFactor: z.number().min(0).max(1.5),
})

// GET /api/settings — Get current developer settings
export async function GET() {
  const developer = await getDeveloper()
  if (!developer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json({
    adjustmentFactor: developer.adjustmentFactor,
  })
}

// PATCH /api/settings — Update developer settings
export async function PATCH(request: NextRequest) {
  const developer = await getDeveloper()
  if (!developer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const parsed = updateSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  if (parsed.data.adjustmentFactor > 1.25 && developer.role !== 'admin' && developer.role !== 'manager') {
    return NextResponse.json(
      { error: 'Adjustment factors above 125% require admin or manager role' },
      { status: 403 }
    )
  }

  const updated = await prisma.developer.update({
    where: { id: developer.id },
    data: { adjustmentFactor: parsed.data.adjustmentFactor },
    select: { adjustmentFactor: true },
  })

  return NextResponse.json(updated)
}
