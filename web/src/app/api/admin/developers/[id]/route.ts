import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

type RouteParams = { params: Promise<{ id: string }> }

const updateDeveloperSchema = z.object({
  role: z.enum(['developer', 'manager', 'admin']).optional(),
  active: z.boolean().optional(),
  displayName: z.string().min(1).optional(),
})

// PATCH /api/admin/developers/[id] — Update developer role/status
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const developer = await getDeveloper()
  if (!developer || developer.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const parsed = updateDeveloperSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  // Prevent admin from demoting themselves
  if (id === developer.id && parsed.data.role && parsed.data.role !== 'admin') {
    return NextResponse.json(
      { error: 'Cannot change your own admin role' },
      { status: 400 }
    )
  }

  // Prevent deactivating yourself
  if (id === developer.id && parsed.data.active === false) {
    return NextResponse.json(
      { error: 'Cannot deactivate your own account' },
      { status: 400 }
    )
  }

  const target = await prisma.developer.findUnique({ where: { id } })
  if (!target) {
    return NextResponse.json({ error: 'Developer not found' }, { status: 404 })
  }

  const updated = await prisma.developer.update({
    where: { id },
    data: parsed.data,
    select: {
      id: true,
      email: true,
      displayName: true,
      role: true,
      active: true,
    },
  })

  return NextResponse.json(updated)
}
