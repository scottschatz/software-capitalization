import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgent } from '@/lib/agent-auth'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const discoveredProjectSchema = z.object({
  name: z.string().min(1),
  localPath: z.string().min(1),
  claudePath: z.string().nullable(),
  repoPath: z.string().nullable(),
  repoUrl: z.string().nullable(),
  hasGit: z.boolean(),
  hasClaude: z.boolean(),
})

const discoverPayloadSchema = z.object({
  projects: z.array(discoveredProjectSchema),
})

// POST /api/agent/discover — Register discovered projects from agent environment scan
export async function POST(request: NextRequest) {
  const auth = await authenticateAgent(request)
  if (!auth) {
    return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const payload = discoverPayloadSchema.parse(body)

    let created = 0
    let updated = 0

    // Filter out non-project directories (home dirs, generic containers)
    const validProjects = payload.projects.filter((disc) => {
      // Skip if the name looks like a username or generic dir
      const lowerName = disc.name.toLowerCase()
      const genericNames = ['projects', 'repos', 'code', 'src', 'work', 'dev', 'workspace', 'workspaces']
      if (genericNames.includes(lowerName)) return false
      // Skip home directories: /home/<name> or /Users/<name> where name matches project name
      if (disc.localPath.match(/^\/(?:home|Users)\/[^/]+$/) && disc.name === disc.localPath.split('/').pop()) return false
      return true
    })

    for (const disc of validProjects) {
      // Check if project already exists by matching repo path, claude path, or repo URL
      const existingByRepo = disc.repoPath
        ? await prisma.projectRepo.findFirst({
            where: { repoPath: disc.repoPath },
            include: { project: true },
          })
        : null

      const existingByClaudePath = disc.claudePath
        ? await prisma.projectClaudePath.findFirst({
            where: { claudePath: disc.claudePath },
            include: { project: true },
          })
        : null

      // Match by git remote URL — same repo across different machines
      const existingByRepoUrl = !existingByRepo && disc.repoUrl
        ? await prisma.projectRepo.findFirst({
            where: { repoUrl: disc.repoUrl },
            include: { project: true },
          })
        : null

      const existingProject = existingByRepo?.project ?? existingByClaudePath?.project ?? existingByRepoUrl?.project

      if (existingProject) {
        // Update: add missing repo or claude path links
        let didUpdate = false

        if (disc.repoPath && !existingByRepo) {
          await prisma.projectRepo.create({
            data: {
              projectId: existingProject.id,
              repoPath: disc.repoPath,
              repoUrl: disc.repoUrl,
            },
          }).catch(() => {
            // Unique constraint — already exists
          })
          didUpdate = true
        }

        if (disc.claudePath && !existingByClaudePath) {
          await prisma.projectClaudePath.create({
            data: {
              projectId: existingProject.id,
              claudePath: disc.claudePath,
              localPath: disc.localPath,
            },
          }).catch(() => {
            // Unique constraint — already exists
          })
          didUpdate = true
        }

        // Update repo URL if we have a new one
        if (disc.repoUrl && existingByRepo && !existingByRepo.repoUrl) {
          await prisma.projectRepo.update({
            where: { id: existingByRepo.id },
            data: { repoUrl: disc.repoUrl },
          })
          didUpdate = true
        }

        if (didUpdate) updated++
      } else {
        // Create new auto-discovered project
        await prisma.project.create({
          data: {
            name: disc.name,
            autoDiscovered: true,
            createdById: auth.developer.id,
            repos: disc.repoPath
              ? {
                  create: {
                    repoPath: disc.repoPath,
                    repoUrl: disc.repoUrl,
                  },
                }
              : undefined,
            claudePaths: disc.claudePath
              ? {
                  create: {
                    claudePath: disc.claudePath,
                    localPath: disc.localPath,
                  },
                }
              : undefined,
          },
        })

        created++
      }
    }

    // Return full project list
    const projects = await prisma.project.findMany({
      where: { status: { not: 'abandoned' } },
      select: {
        id: true,
        name: true,
        phase: true,
        status: true,
        monitored: true,
        repos: { select: { repoPath: true, repoUrl: true } },
        claudePaths: { select: { claudePath: true, localPath: true } },
      },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({
      created,
      updated,
      total: projects.length,
      projects,
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid payload', details: err.issues }, { status: 400 })
    }
    console.error('Error in project discovery:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
