import Link from 'next/link'
import { requireDeveloper } from '@/lib/get-developer'
import { listProjects } from '@/lib/actions/project-actions'
import { Button } from '@/components/ui/button'
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
import { Plus, AlertCircle, Scan } from 'lucide-react'

export default async function ProjectsPage() {
  await requireDeveloper()
  const projects = await listProjects()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-sm text-muted-foreground">
            All projects in your environment. Toggle monitoring to include in capitalization tracking.
          </p>
        </div>
        <Link href="/projects/new">
          <Button>
            <Plus className="h-4 w-4 mr-1" /> New Project
          </Button>
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Scan className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="text-lg font-medium">No projects yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Run <code className="bg-muted px-1 rounded">cap sync</code> from your machine
            to auto-discover projects, or create one manually.
          </p>
          <Link href="/projects/new">
            <Button className="mt-4">
              <Plus className="h-4 w-4 mr-1" /> Create Project
            </Button>
          </Link>
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
                <TableHead className="text-center">Monitored</TableHead>
                <TableHead className="text-right">Pending</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => {
                const pendingCount = project._count.phaseChangeRequests
                return (
                  <TableRow key={project.id} className={!project.monitored ? 'opacity-60' : undefined}>
                    <TableCell>
                      <Link
                        href={`/projects/${project.id}`}
                        className="font-medium hover:underline"
                      >
                        {project.name}
                      </Link>
                      {project.description && (
                        <p className="text-xs text-muted-foreground truncate max-w-xs">
                          {project.description}
                        </p>
                      )}
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
                    <TableCell className="text-center">
                      <MonitoringToggle
                        projectId={project.id}
                        initialMonitored={project.monitored}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      {pendingCount > 0 && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertCircle className="h-3 w-3" />
                          {pendingCount}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
