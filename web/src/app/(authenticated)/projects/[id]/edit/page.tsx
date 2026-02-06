import { notFound } from 'next/navigation'
import { requireDeveloper } from '@/lib/get-developer'
import { getProject } from '@/lib/actions/project-actions'
import { ProjectForm } from '@/components/projects/project-form'

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireDeveloper()
  const { id } = await params

  let project
  try {
    project = await getProject(id)
  } catch {
    notFound()
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Edit: {project.name}</h1>
        <p className="text-sm text-muted-foreground">
          Update project details. Phase changes require a separate approval workflow.
        </p>
      </div>
      <ProjectForm
        mode="edit"
        initialData={{
          id: project.id,
          name: project.name,
          description: project.description ?? '',
          businessJustification: project.businessJustification ?? '',
          phase: project.phase as 'preliminary' | 'application_development' | 'post_implementation',
          managementAuthorized: project.managementAuthorized,
          authorizationDate: project.authorizationDate
            ? new Date(project.authorizationDate).toISOString().split('T')[0]
            : '',
          authorizationEvidence: project.authorizationEvidence ?? '',
          probableToComplete: project.probableToComplete,
          developmentUncertainty: project.developmentUncertainty as 'low' | 'medium' | 'high',
          status: project.status as 'active' | 'paused' | 'completed' | 'abandoned',
          expectedCompletion: project.expectedCompletion
            ? new Date(project.expectedCompletion).toISOString().split('T')[0]
            : '',
          repos: project.repos.map((r) => ({
            repoPath: r.repoPath,
            repoUrl: r.repoUrl ?? '',
          })),
          claudePaths: project.claudePaths.map((c) => ({
            claudePath: c.claudePath,
            localPath: c.localPath,
          })),
        }}
      />
    </div>
  )
}
