import { requireDeveloper } from '@/lib/get-developer'
import { ProjectForm } from '@/components/projects/project-form'

export default async function NewProjectPage() {
  await requireDeveloper()

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">New Project</h1>
        <p className="text-sm text-muted-foreground">
          Create a new software project to track for capitalization.
        </p>
      </div>
      <ProjectForm mode="create" />
    </div>
  )
}
