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
import { Plus, AlertCircle } from 'lucide-react'

export default async function ProjectsPage() {
  await requireDeveloper()
  const projects = await listProjects()

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-sm text-muted-foreground">
            Manage software projects tracked for capitalization under ASC 350-40.
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
          <h3 className="text-lg font-medium">No projects yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Create your first project to start tracking software capitalization hours.
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
                <TableHead>Repos</TableHead>
                <TableHead className="text-right">Pending</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((project) => {
                const pendingCount = project._count.phaseChangeRequests
                return (
                  <TableRow key={project.id}>
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
                    <TableCell className="text-muted-foreground text-sm">
                      {project.repos.length}
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
