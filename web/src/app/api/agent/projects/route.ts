import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgent } from '@/lib/agent-auth'
import { prisma } from '@/lib/prisma'

// GET /api/agent/projects — Return project definitions with repos + claude paths
export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request)
  if (!auth) {
    return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 })
  }

  try {
    const projects = await prisma.project.findMany({
      where: { status: { not: 'abandoned' } },
      select: {
        id: true,
        name: true,
        phase: true,
        status: true,
        monitored: true,
        repos: {
          select: {
            repoPath: true,
            repoUrl: true,
          },
        },
        claudePaths: {
          select: {
            claudePath: true,
            localPath: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json(projects)
  } catch (err) {
    console.error('Error in fetching agent projects:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
