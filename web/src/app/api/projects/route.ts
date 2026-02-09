import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { createProjectSchema, listProjectsQuerySchema } from '@/lib/validations/project'
import { createProject, listProjects } from '@/lib/actions/project-actions'

// GET /api/projects — List projects with optional filters
export async function GET(request: NextRequest) {
  const developer = await getDeveloper()
  if (!developer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const isManager = developer.role === 'admin' || developer.role === 'manager'
  const { searchParams } = request.nextUrl
  const query = listProjectsQuerySchema.safeParse({
    status: searchParams.get('status') || undefined,
    phase: searchParams.get('phase') || undefined,
    search: searchParams.get('search') || undefined,
    // Role-based: developers see only projects they have entries against
    developerId: !isManager ? developer.id : (searchParams.get('developerId') || undefined),
  })

  if (!query.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters', details: query.error.flatten() },
      { status: 400 }
    )
  }

  try {
    const projects = await listProjects(query.data)
    return NextResponse.json(projects)
  } catch (err) {
    console.error('Error listing projects:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/projects — Create a new project (admin/manager only)
export async function POST(request: NextRequest) {
  const developer = await getDeveloper()
  if (!developer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!['admin', 'manager'].includes(developer.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await request.json()
  const parsed = createProjectSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  try {
    const project = await createProject(parsed.data, developer.id)
    return NextResponse.json(project, { status: 201 })
  } catch (err) {
    console.error('Error creating project:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
