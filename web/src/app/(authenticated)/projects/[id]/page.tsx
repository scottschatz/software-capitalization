import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireDeveloper } from '@/lib/get-developer'
import { getProject } from '@/lib/actions/project-actions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PhaseBadge, StatusBadge } from '@/components/projects/phase-badge'
import { PhaseChangeDialog } from '@/components/projects/phase-change-dialog'
import { PhaseChangeReview } from '@/components/projects/phase-change-review'
import { Pencil, GitBranch, FolderCode } from 'lucide-react'
import { format } from 'date-fns'

const APPROVAL_EMAIL = 'scott.schatz@townsquaremedia.com'

const phaseLabels: Record<string, string> = {
  preliminary: 'Preliminary',
  application_development: 'Application Development',
  post_implementation: 'Post-Implementation',
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const developer = await requireDeveloper()
  const { id } = await params

  let project
  try {
    project = await getProject(id)
  } catch {
    notFound()
  }

  const canReview = developer.role === 'admin' && developer.email === APPROVAL_EMAIL
  const capitalizable = project.phase === 'application_development'

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{project.name}</h1>
            <PhaseBadge phase={project.phase} />
            <StatusBadge status={project.status} />
            {capitalizable ? (
              <Badge className="bg-green-100 text-green-800 border-green-200">Capitalizable</Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">Expensed</Badge>
            )}
          </div>
          {project.description && (
            <p className="text-muted-foreground">{project.description}</p>
          )}
        </div>
        <div className="flex gap-2">
          <PhaseChangeDialog projectId={project.id} currentPhase={project.phase} />
          <Link href={`/projects/${project.id}/edit`}>
            <Button variant="outline" size="sm">
              <Pencil className="h-4 w-4 mr-1" /> Edit
            </Button>
          </Link>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="phase-changes">
            Phase Changes
            {project.phaseChangeRequests.filter((r) => r.status === 'pending').length > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 w-5 p-0 text-xs justify-center">
                {project.phaseChangeRequests.filter((r) => r.status === 'pending').length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Capitalization Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Phase</span>
                  <span>{phaseLabels[project.phase]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Management Authorized</span>
                  <span>{project.managementAuthorized ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Probable to Complete</span>
                  <span>{project.probableToComplete ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Development Uncertainty</span>
                  <span className="capitalize">{project.developmentUncertainty}</span>
                </div>
                {project.expectedCompletion && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Expected Completion</span>
                    <span>{format(new Date(project.expectedCompletion), 'MMM d, yyyy')}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  Business Justification
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">
                  {project.businessJustification || (
                    <span className="text-muted-foreground italic">No justification provided</span>
                  )}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Repos */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <GitBranch className="h-4 w-4" /> Repositories ({project.repos.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {project.repos.length === 0 ? (
                <p className="text-sm text-muted-foreground">No repositories linked.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {project.repos.map((repo) => (
                    <li key={repo.id} className="font-mono text-xs">
                      {repo.repoPath}
                      {repo.repoUrl && (
                        <span className="text-muted-foreground ml-2">({repo.repoUrl})</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Claude Paths */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <FolderCode className="h-4 w-4" /> Claude Code Paths ({project.claudePaths.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {project.claudePaths.length === 0 ? (
                <p className="text-sm text-muted-foreground">No Claude paths linked.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {project.claudePaths.map((cp) => (
                    <li key={cp.id} className="font-mono text-xs">
                      {cp.localPath}{' '}
                      <span className="text-muted-foreground">→ {cp.claudePath}</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          {project.history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No history entries yet.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Field</TableHead>
                    <TableHead>Old Value</TableHead>
                    <TableHead>New Value</TableHead>
                    <TableHead>Changed By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {project.history.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="text-sm">
                        {format(new Date(h.changedAt), 'MMM d, yyyy HH:mm')}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{h.field}</TableCell>
                      <TableCell className="text-sm max-w-xs truncate">
                        {h.oldValue ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm max-w-xs truncate">
                        {h.newValue ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm">{h.changedBy.displayName}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Phase Changes Tab */}
        <TabsContent value="phase-changes">
          {project.phaseChangeRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No phase change requests.</p>
          ) : (
            <div className="space-y-4">
              {project.phaseChangeRequests.map((pcr) => (
                <Card key={pcr.id}>
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <PhaseBadge phase={pcr.currentPhase} />
                        <span className="text-muted-foreground">→</span>
                        <PhaseBadge phase={pcr.requestedPhase} />
                        <Badge
                          variant={
                            pcr.status === 'approved'
                              ? 'default'
                              : pcr.status === 'rejected'
                                ? 'destructive'
                                : 'secondary'
                          }
                        >
                          {pcr.status}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(pcr.createdAt), 'MMM d, yyyy HH:mm')}
                      </span>
                    </div>

                    <p className="text-sm">{pcr.reason}</p>

                    <div className="text-xs text-muted-foreground">
                      Requested by {pcr.requestedBy.displayName}
                      {pcr.reviewedBy && (
                        <span>
                          {' · '}
                          {pcr.status === 'approved' ? 'Approved' : 'Rejected'} by{' '}
                          {pcr.reviewedBy.displayName}
                          {pcr.reviewedAt && (
                            <> on {format(new Date(pcr.reviewedAt), 'MMM d, yyyy HH:mm')}</>
                          )}
                        </span>
                      )}
                      {pcr.reviewNote && <span> · Note: {pcr.reviewNote}</span>}
                    </div>

                    {pcr.status === 'pending' && (
                      <PhaseChangeReview
                        projectId={project.id}
                        requestId={pcr.id}
                        canReview={canReview}
                      />
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity">
          <p className="text-sm text-muted-foreground py-4">
            Activity data will appear here once the agent begins syncing session and commit data.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  )
}
