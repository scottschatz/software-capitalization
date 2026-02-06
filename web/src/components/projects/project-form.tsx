'use client'

import { useRouter } from 'next/navigation'
import { useForm, useFieldArray } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'
import { localPathToClaudePath } from '@/lib/claude-paths'

const formSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(200),
  description: z.string().optional(),
  businessJustification: z.string().optional(),
  phase: z.enum(['preliminary', 'application_development', 'post_implementation']),
  managementAuthorized: z.boolean(),
  authorizationDate: z.string().optional(),
  authorizationEvidence: z.string().optional(),
  probableToComplete: z.boolean(),
  developmentUncertainty: z.enum(['low', 'medium', 'high']),
  status: z.enum(['active', 'paused', 'completed', 'abandoned']),
  expectedCompletion: z.string().optional(),
  repos: z.array(z.object({
    repoPath: z.string().min(1, 'Path required'),
    repoUrl: z.string().optional(),
  })),
  claudePaths: z.array(z.object({
    claudePath: z.string().min(1, 'Claude path required'),
    localPath: z.string().min(1, 'Local path required'),
  })),
})

type FormValues = z.infer<typeof formSchema>

interface ProjectFormProps {
  mode: 'create' | 'edit'
  initialData?: Partial<FormValues> & { id?: string }
}

export function ProjectForm({ mode, initialData }: ProjectFormProps) {
  const router = useRouter()

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialData?.name ?? '',
      description: initialData?.description ?? '',
      businessJustification: initialData?.businessJustification ?? '',
      phase: initialData?.phase ?? 'application_development',
      managementAuthorized: initialData?.managementAuthorized ?? false,
      authorizationDate: initialData?.authorizationDate ?? '',
      authorizationEvidence: initialData?.authorizationEvidence ?? '',
      probableToComplete: initialData?.probableToComplete ?? true,
      developmentUncertainty: initialData?.developmentUncertainty ?? 'low',
      status: initialData?.status ?? 'active',
      expectedCompletion: initialData?.expectedCompletion ?? '',
      repos: initialData?.repos ?? [],
      claudePaths: initialData?.claudePaths ?? [],
    },
  })

  const repoFields = useFieldArray({ control: form.control, name: 'repos' })
  const claudePathFields = useFieldArray({ control: form.control, name: 'claudePaths' })

  async function onSubmit(values: FormValues) {
    const url = mode === 'create' ? '/api/projects' : `/api/projects/${initialData?.id}`
    const method = mode === 'create' ? 'POST' : 'PUT'

    // Clean up empty optional strings
    const body = {
      ...values,
      description: values.description || null,
      businessJustification: values.businessJustification || null,
      authorizationDate: values.authorizationDate || null,
      authorizationEvidence: values.authorizationEvidence || null,
      expectedCompletion: values.expectedCompletion || null,
    }

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error || 'Something went wrong')
      return
    }

    const project = await res.json()
    toast.success(mode === 'create' ? 'Project created' : 'Project updated')
    router.push(`/projects/${project.id}`)
    router.refresh()
  }

  function handleAutoClaudePath(index: number) {
    const localPath = form.getValues(`claudePaths.${index}.localPath`)
    if (localPath) {
      form.setValue(`claudePaths.${index}.claudePath`, localPathToClaudePath(localPath))
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-3xl">
      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>Project Details</CardTitle>
          <CardDescription>Basic information about the software project.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Project Name *</Label>
            <Input id="name" {...form.register('name')} />
            {form.formState.errors.name && (
              <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" {...form.register('description')} rows={3} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="businessJustification">Business Justification</Label>
            <Textarea
              id="businessJustification"
              {...form.register('businessJustification')}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Describe why this software is being built. This is auditor-facing — keep it factual.
              E.g., &ldquo;Automate invoice processing to reduce manual data entry by 80%.&rdquo;
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={form.watch('status')}
                onValueChange={(v) => form.setValue('status', v as FormValues['status'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="expectedCompletion">Expected Completion</Label>
              <Input
                id="expectedCompletion"
                type="date"
                {...form.register('expectedCompletion')}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Phase & Capitalization */}
      <Card>
        <CardHeader>
          <CardTitle>Phase & Capitalization</CardTitle>
          <CardDescription>
            ASC 350-40 requires tracking the phase of software development. Only hours in the
            &ldquo;Application Development&rdquo; phase are capitalizable.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {mode === 'create' ? (
            <div className="space-y-2">
              <Label>Initial Phase</Label>
              <Select
                value={form.watch('phase')}
                onValueChange={(v) => form.setValue('phase', v as FormValues['phase'])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="preliminary">
                    Preliminary — Conceptual design, evaluating alternatives
                  </SelectItem>
                  <SelectItem value="application_development">
                    Application Development — Active coding, testing, installation
                  </SelectItem>
                  <SelectItem value="post_implementation">
                    Post-Implementation — Training, maintenance, bug fixes
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                After creation, phase changes require approval from the designated administrator.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Current Phase</Label>
              <p className="text-sm text-muted-foreground">
                Phase is read-only here. Use the &ldquo;Request Phase Change&rdquo; button on the
                project detail page to request a change.
              </p>
            </div>
          )}

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="managementAuthorized"
                className="h-4 w-4"
                checked={form.watch('managementAuthorized')}
                onChange={(e) => form.setValue('managementAuthorized', e.target.checked)}
              />
              <Label htmlFor="managementAuthorized">Management has authorized this project</Label>
            </div>
            <p className="text-xs text-muted-foreground ml-6">
              Has management formally approved and committed funding? Required for capitalization.
            </p>
          </div>

          {form.watch('managementAuthorized') && (
            <div className="grid grid-cols-2 gap-4 ml-6">
              <div className="space-y-2">
                <Label htmlFor="authorizationDate">Authorization Date</Label>
                <Input
                  id="authorizationDate"
                  type="date"
                  {...form.register('authorizationDate')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="authorizationEvidence">Authorization Evidence</Label>
                <Input
                  id="authorizationEvidence"
                  placeholder="e.g., Email from VP of Engineering, Jira ticket"
                  {...form.register('authorizationEvidence')}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="probableToComplete"
                className="h-4 w-4"
                checked={form.watch('probableToComplete')}
                onChange={(e) => form.setValue('probableToComplete', e.target.checked)}
              />
              <Label htmlFor="probableToComplete">Probable to complete</Label>
            </div>
            <p className="text-xs text-muted-foreground ml-6">
              Is it probable this project will be completed and used as intended? If significant
              uncertainty exists, costs may need to be expensed.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Development Uncertainty</Label>
            <Select
              value={form.watch('developmentUncertainty')}
              onValueChange={(v) =>
                form.setValue('developmentUncertainty', v as FormValues['developmentUncertainty'])
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low — Clear requirements, known technology</SelectItem>
                <SelectItem value="medium">
                  Medium — Some unknowns, may need prototyping
                </SelectItem>
                <SelectItem value="high">
                  High — Significant unknowns, experimental technology
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Repos */}
      <Card>
        <CardHeader>
          <CardTitle>Git Repositories</CardTitle>
          <CardDescription>
            Link git repos to this project. The agent uses these to collect commit data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {repoFields.fields.map((field, index) => (
            <div key={field.id} className="flex gap-2 items-start">
              <div className="flex-1 space-y-1">
                <Input
                  placeholder="/home/user/projects/repo-name"
                  {...form.register(`repos.${index}.repoPath`)}
                />
              </div>
              <div className="flex-1 space-y-1">
                <Input
                  placeholder="https://github.com/org/repo (optional)"
                  {...form.register(`repos.${index}.repoUrl`)}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => repoFields.remove(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => repoFields.append({ repoPath: '', repoUrl: '' })}
          >
            <Plus className="h-4 w-4 mr-1" /> Add Repository
          </Button>
        </CardContent>
      </Card>

      {/* Claude Paths */}
      <Card>
        <CardHeader>
          <CardTitle>Claude Code Paths</CardTitle>
          <CardDescription>
            Map local paths to Claude session paths. The agent uses these to match session logs to
            this project. Enter the local path and click &ldquo;Auto&rdquo; to generate the
            Claude path.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {claudePathFields.fields.map((field, index) => (
            <div key={field.id} className="flex gap-2 items-start">
              <div className="flex-1 space-y-1">
                <Input
                  placeholder="/home/user/projects/my-project"
                  {...form.register(`claudePaths.${index}.localPath`)}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-0"
                onClick={() => handleAutoClaudePath(index)}
              >
                Auto
              </Button>
              <div className="flex-1 space-y-1">
                <Input
                  placeholder="-home-user-projects-my-project"
                  {...form.register(`claudePaths.${index}.claudePath`)}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => claudePathFields.remove(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => claudePathFields.append({ claudePath: '', localPath: '' })}
          >
            <Plus className="h-4 w-4 mr-1" /> Add Claude Path
          </Button>
        </CardContent>
      </Card>

      {/* Submit */}
      <div className="flex gap-3">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting
            ? 'Saving...'
            : mode === 'create'
              ? 'Create Project'
              : 'Save Changes'}
        </Button>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
