import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { phaseChangeRequestSchema } from '@/lib/validations/project'
import { requestPhaseChange } from '@/lib/actions/project-actions'

type RouteParams = { params: Promise<{ id: string }> }

// POST /api/projects/[id]/phase-change — Request a phase change (creates pending request)
export async function POST(request: NextRequest, { params }: RouteParams) {
  const developer = await getDeveloper()
  if (!developer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const parsed = phaseChangeRequestSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  try {
    const pcr = await requestPhaseChange(id, parsed.data, developer.id)
    return NextResponse.json(pcr, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Phase change request failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
