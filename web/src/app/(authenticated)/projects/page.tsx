import Link from 'next/link'
import { requireDeveloper } from '@/lib/get-developer'
import { listProjects } from '@/lib/actions/project-actions'
import { prisma } from '@/lib/prisma'
import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { PhaseBadge, StatusBadge } from '@/components/projects/phase-badge'
import { MonitoringToggle } from '@/components/projects/monitoring-toggle'
import { ProjectsGuide } from '@/components/projects/projects-guide'
import { ProjectDeveloperFilter } from '@/components/projects/developer-filter'
import { NewProjectButton } from '@/components/projects/new-project-button'
import { AlertCircle, Scan } from 'lucide-react'

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ developer?: string }>
}) {
  const developer = await requireDeveloper()
  const isManager = developer.role === 'admin' || developer.role === 'manager'
  const params = await searchParams

  // Role-based visibility: developers see only their projects; admins/managers see all
  const query: { developerId?: string } = {}
  if (!isManager) {
    query.developerId = developer.id
  } else if (params.developer) {
    query.developerId = params.developer
  }

  const projects = await listProjects(query)

  // Fetch active developers for admin filter dropdown
  const developers = isManager
    ? await prisma.developer.findMany({
        where: { active: true },
        select: { id: true, displayName: true },
        orderBy: { displayName: 'asc' },
      })
    : []

  // Get unique developers per project for the "Developers" column
  const projectIds = projects.map((p) => p.id)
  const projectDevRows = projectIds.length > 0
    ? await prisma.dailyEntry.findMany({
        where: { projectId: { in: projectIds } },
        select: {
          projectId: true,
          developer: { select: { id: true, displayName: true } },
        },
        distinct: ['projectId', 'developerId'],
      })
    : []

  const devsByProject = new Map<string, Array<{ id: string; displayName: string }>>()
  for (const row of projectDevRows) {
    if (!row.projectId) continue
    const list = devsByProject.get(row.projectId) ?? []
    list.push(row.developer)
    devsByProject.set(row.projectId, list)
  }

  // Group projects into parent → enhancement hierarchy
  const parentProjects = projects.filter((p) => !p.parentProjectId)
  const enhancementsByParent = new Map<string, typeof projects>()

  for (const p of projects) {
    if (p.parentProjectId) {
      const list = enhancementsByParent.get(p.parentProjectId) ?? []
      list.push(p)
      enhancementsByParent.set(p.parentProjectId, list)
    }
  }

  // Sort enhancements by enhancementNumber
  for (const [, enhancements] of enhancementsByParent) {
    enhancements.sort((a, b) => (a.enhancementNumber ?? 0) - (b.enhancementNumber ?? 0))
  }

  // Build ordered row list: parent, its enhancements, next parent, etc.
  type ProjectRow = { project: (typeof projects)[0]; isEnhancement: boolean }
  const rows: ProjectRow[] = []

  for (const parent of parentProjects) {
    rows.push({ project: parent, isEnhancement: false })
    const enhancements = enhancementsByParent.get(parent.id) ?? []
    for (const enh of enhancements) {
      rows.push({ project: enh, isEnhancement: true })
    }
    enhancementsByParent.delete(parent.id)
  }

  // Orphaned enhancements (parent filtered out or not in current view)
  for (const [, enhancements] of enhancementsByParent) {
    for (const enh of enhancements) {
      rows.push({ project: enh, isEnhancement: true })
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-sm text-muted-foreground">
            {isManager
              ? 'All projects in your environment. Toggle monitoring to include in capitalization tracking.'
              : 'Projects you have logged time against.'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isManager && (
            <ProjectDeveloperFilter
              developers={developers}
              currentDevId={params.developer ?? 'all'}
            />
          )}
          <NewProjectButton isManager={isManager} />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Scan className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="text-lg font-medium">No projects yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Run <code className="bg-muted px-1 rounded">cap sync</code> from your project
            directory to auto-discover projects, or create one manually.
          </p>
          <NewProjectButton isManager={isManager} variant="empty-state" />
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phase</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Developers</TableHead>
                {isManager && <TableHead className="text-center">Monitored</TableHead>}
                {isManager && <TableHead className="text-right">Pending</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ project, isEnhancement }) => {
                const pendingCount = project._count.phaseChangeRequests
                const enhancementCount = project._count.enhancementProjects
                const projectDevs = devsByProject.get(project.id) ?? []
                return (
                  <TableRow
                    key={project.id}
                    className={cn(
                      !project.monitored && 'opacity-60',
                      isEnhancement && 'bg-muted/30'
                    )}
                  >
                    <TableCell>
                      <div className={cn(isEnhancement && 'pl-6')}>
                        <div className="flex items-center gap-2">
                          {isEnhancement && (
                            <Badge variant="outline" className="text-xs font-normal shrink-0">
                              Enhancement
                            </Badge>
                          )}
                          <Link
                            href={`/projects/${project.id}`}
                            className="font-medium hover:underline"
                          >
                            {project.name}
                          </Link>
                          {!isEnhancement && enhancementCount > 0 && (
                            <Badge variant="secondary" className="text-xs shrink-0">
                              {enhancementCount} enhancement{enhancementCount !== 1 ? 's' : ''}
                            </Badge>
                          )}
                        </div>
                        {isEnhancement && project.parentProject && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Enhancement of{' '}
                            <Link
                              href={`/projects/${project.parentProject.id}`}
                              className="underline hover:text-foreground"
                            >
                              {project.parentProject.name}
                            </Link>
                          </p>
                        )}
                        {!isEnhancement && project.description && (
                          <p className="text-xs text-muted-foreground truncate max-w-xs">
                            {project.description}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <PhaseBadge phase={project.phase} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={project.status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {project.repos.length > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {project.repos.length} repo{project.repos.length !== 1 ? 's' : ''}
                          </Badge>
                        )}
                        {project.claudePaths.length > 0 && (
                          <Badge variant="outline" className="text-xs">
                            claude
                          </Badge>
                        )}
                        {project.autoDiscovered && (
                          <Badge variant="secondary" className="text-xs">
                            auto
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {projectDevs.length === 0 ? (
                          <span className="text-xs text-muted-foreground">&mdash;</span>
                        ) : projectDevs.length <= 3 ? (
                          projectDevs.map((d) => (
                            <Badge key={d.id} variant="outline" className="text-xs font-normal">
                              {d.displayName.split(' ')[0]}
                            </Badge>
                          ))
                        ) : (
                          <>
                            {projectDevs.slice(0, 2).map((d) => (
                              <Badge key={d.id} variant="outline" className="text-xs font-normal">
                                {d.displayName.split(' ')[0]}
                              </Badge>
                            ))}
                            <Badge variant="outline" className="text-xs font-normal">
                              +{projectDevs.length - 2}
                            </Badge>
                          </>
                        )}
                      </div>
                    </TableCell>
                    {isManager && (
                      <TableCell className="text-center">
                        <MonitoringToggle
                          projectId={project.id}
                          initialMonitored={project.monitored}
                        />
                      </TableCell>
                    )}
                    {isManager && (
                      <TableCell className="text-right">
                        {pendingCount > 0 && (
                          <Badge variant="destructive" className="gap-1">
                            <AlertCircle className="h-3 w-3" />
                            {pendingCount}
                          </Badge>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <ProjectsGuide />
    </div>
  )
}
