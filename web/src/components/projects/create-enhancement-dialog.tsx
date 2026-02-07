'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'

interface CreateEnhancementDialogProps {
  parentProjectId: string
  parentProjectName: string
}

export function CreateEnhancementDialog({
  parentProjectId,
  parentProjectName,
}: CreateEnhancementDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!label.trim()) {
      toast.error('Please provide an enhancement label')
      return
    }

    setSubmitting(true)
    const res = await fetch(`/api/projects/${parentProjectId}/enhancements`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enhancementLabel: label,
        description: description || null,
      }),
    })

    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error || 'Failed to create enhancement project')
      setSubmitting(false)
      return
    }

    const project = await res.json()
    toast.success(`Enhancement project created: ${project.name}`)
    setOpen(false)
    setLabel('')
    setDescription('')
    setSubmitting(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 mr-1" /> Create Enhancement
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Enhancement Project</DialogTitle>
          <DialogDescription>
            Creates a new capitalizable project linked to <strong>{parentProjectName}</strong>.
            The enhancement will inherit the parent&apos;s repositories and Claude paths, and start in the
            Application Development phase.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Enhancement Label</Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g., Phase 2 - New Integrations"
            />
            <p className="text-xs text-muted-foreground">
              The project will be named &quot;{parentProjectName} - {label || '...'}&quot;
            </p>
          </div>

          <div className="space-y-2">
            <Label>Description (optional)</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the new development work being done..."
              rows={3}
            />
          </div>

          <div className="text-xs text-muted-foreground p-3 bg-muted rounded-md">
            <strong>Why enhancement projects?</strong> Under ASC 350-40, new development work on a
            post-implementation project must be tracked as a separate capitalizable asset because the
            original project&apos;s costs are already depreciating.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Enhancement'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
