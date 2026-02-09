import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { createEnhancementSchema } from '@/lib/validations/project'
import { createEnhancementProject, listEnhancementProjects } from '@/lib/actions/project-actions'

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/projects/[id]/enhancements — List enhancement projects
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const developer = await getDeveloper()
  if (!developer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const enhancements = await listEnhancementProjects(id)
  return NextResponse.json(enhancements)
}

// POST /api/projects/[id]/enhancements — Create enhancement project (admin/manager only)
export async function POST(request: NextRequest, { params }: RouteParams) {
  const developer = await getDeveloper()
  if (!developer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!['admin', 'manager'].includes(developer.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const parsed = createEnhancementSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  try {
    const project = await createEnhancementProject(id, parsed.data, developer.id)
    return NextResponse.json(project, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create enhancement project'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
