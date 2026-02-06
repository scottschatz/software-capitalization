import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { updateProjectSchema } from '@/lib/validations/project'
import { getProject, updateProject, deleteProject } from '@/lib/actions/project-actions'

type RouteParams = { params: Promise<{ id: string }> }

// GET /api/projects/[id] — Project detail with repos, claude paths, history, phase changes
export async function GET(request: NextRequest, { params }: RouteParams) {
  const developer = await getDeveloper()
  if (!developer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    const project = await getProject(id)
    return NextResponse.json(project)
  } catch {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }
}

// PUT /api/projects/[id] — Update non-phase fields
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const developer = await getDeveloper()
  if (!developer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json()
  const parsed = updateProjectSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  try {
    const project = await updateProject(id, parsed.data, developer.id)
    return NextResponse.json(project)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

// DELETE /api/projects/[id] — Soft delete (sets status to 'abandoned')
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const developer = await getDeveloper()
  if (!developer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    const project = await deleteProject(id, developer.id)
    return NextResponse.json(project)
  } catch {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }
}
