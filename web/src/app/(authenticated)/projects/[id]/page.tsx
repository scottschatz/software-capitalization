import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireDeveloper } from '@/lib/get-developer'
import { getProject, listEnhancementProjects } from '@/lib/actions/project-actions'
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
import { CreateEnhancementDialog } from '@/components/projects/create-enhancement-dialog'
import { ProjectNarrative } from '@/components/projects/project-narrative'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { Pencil, GitBranch, FolderCode, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'

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

  const isAdmin = developer.role === 'admin' || developer.role === 'manager'
  const canReview = isAdmin
  const capitalizable = project.phase === 'application_development'
  const isEnhancement = !!project.parentProjectId
  const isPostImpl = project.phase === 'post_implementation'
  const enhancements = isPostImpl && !isEnhancement ? await listEnhancementProjects(id) : []

  return (
    <div className="space-y-6">
      {/* Parent project breadcrumb for enhancement projects */}
      {isEnhancement && project.parentProjectId && (
        <div className="text-sm text-muted-foreground">
          Enhancement of{' '}
          <Link href={`/projects/${project.parentProjectId}`} className="underline hover:text-foreground">
            parent project
          </Link>
        </div>
      )}

      {/* Authorization warning for capitalizable projects */}
      {capitalizable && (!project.managementAuthorized || !project.probableToComplete) && (
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            Hours on this project cannot be capitalized until management authorization is documented (ASU 2025-06).
            {!project.managementAuthorized && ' Management authorization is not yet recorded.'}
            {!project.probableToComplete && ' Probability of completion has not been assessed.'}
          </span>
        </div>
      )}

      {/* Suspended/Abandoned project warning */}
      {(project.status === 'suspended' || project.status === 'abandoned') && (
        <div className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-200">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            This project is {project.status}. No new daily entries will be generated and hours cannot be capitalized.
          </span>
        </div>
      )}

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
            {isEnhancement && (
              <Badge variant="outline" className="border-blue-300 text-blue-700">Enhancement</Badge>
            )}
          </div>
          {project.description && (
            <p className="text-muted-foreground">{project.description}</p>
          )}
          {/* Go-live date and phase effective date */}
          {(project.goLiveDate || project.phaseEffectiveDate) && (
            <div className="flex gap-4 text-xs text-muted-foreground">
              {project.goLiveDate && (
                <span>Go-live: {format(new Date(project.goLiveDate), 'MMM d, yyyy')}</span>
              )}
              {project.phaseEffectiveDate && (
                <span>Phase effective: {format(new Date(project.phaseEffectiveDate), 'MMM d, yyyy')}</span>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <PhaseChangeDialog projectId={project.id} currentPhase={project.phase} isAdmin={isAdmin} />
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
          <TabsTrigger value="narrative">Narrative</TabsTrigger>
          {isPostImpl && !isEnhancement && (
            <TabsTrigger value="enhancements">
              Enhancements
              {enhancements.length > 0 && (
                <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
                  {enhancements.length}
                </Badge>
              )}
            </TabsTrigger>
          )}
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
                  <span className="text-muted-foreground">Phase <InfoTooltip text="Phase transitions require admin/manager approval and are logged for audit purposes per ASC 350-40-35." /></span>
                  <span>{phaseLabels[project.phase]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Management Authorized <InfoTooltip text="ASU 2025-06 requires documented management authorization before capitalization can begin. This includes commitment to fund the project and an assessment that completion is probable." /></span>
                  <span>{project.managementAuthorized ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Probable to Complete <InfoTooltip text="ASU 2025-06 requires ongoing assessment that the project is probable to be completed and used as intended." /></span>
                  <span>{project.probableToComplete ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Development Uncertainty</span>
                  <span className="capitalize">{project.developmentUncertainty}</span>
                </div>
                {project.goLiveDate && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Go-Live Date</span>
                    <span>{format(new Date(project.goLiveDate), 'MMM d, yyyy')}</span>
                  </div>
                )}
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

        {/* Narrative Tab */}
        <TabsContent value="narrative" className="space-y-4">
          <ProjectNarrative projectId={project.id} role={developer.role} />
        </TabsContent>

        {/* Enhancements Tab — only for post-impl parent projects */}
        {isPostImpl && !isEnhancement && (
          <TabsContent value="enhancements" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Enhancement projects track new development work on this post-implementation project.
                Each enhancement is a separate capitalizable asset under ASC 350-40.
              </p>
              <CreateEnhancementDialog parentProjectId={project.id} parentProjectName={project.name} />
            </div>

            {enhancements.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">No enhancement projects yet.</p>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>#</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Phase</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {enhancements.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell>{e.enhancementNumber}</TableCell>
                        <TableCell>
                          <Link href={`/projects/${e.id}`} className="underline hover:text-foreground">
                            {e.enhancementLabel || e.name}
                          </Link>
                        </TableCell>
                        <TableCell><PhaseBadge phase={e.phase} /></TableCell>
                        <TableCell><StatusBadge status={e.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
