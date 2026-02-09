import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { directPhaseChangeSchema } from '@/lib/validations/project'
import { directPhaseChange } from '@/lib/actions/project-actions'

type RouteParams = { params: Promise<{ id: string }> }

// POST /api/projects/[id]/phase-change/direct — Admin direct phase change (bypasses request workflow)
export async function POST(request: NextRequest, { params }: RouteParams) {
  const developer = await getDeveloper()
  if (!developer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (developer.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const parsed = directPhaseChangeSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  try {
    const result = await directPhaseChange(id, parsed.data, developer.id, developer.role)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Phase change failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
