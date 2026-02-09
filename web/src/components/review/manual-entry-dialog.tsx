'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'

interface Project {
  id: string
  name: string
  phase: string
}

interface ManualEntryDialogProps {
  date: string
  projects: Project[]
}

export function ManualEntryDialog({ date, projects }: ManualEntryDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [hours, setHours] = useState('1')
  const [phase, setPhase] = useState('application_development')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    if (!projectId || !description.trim()) {
      toast.error('Project and description are required')
      return
    }

    setSubmitting(true)
    const res = await fetch('/api/entries/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        date,
        projectId,
        hours: parseFloat(hours),
        phase,
        description,
      }),
    })

    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error || 'Failed to create entry')
      setSubmitting(false)
      return
    }

    const result = await res.json()
    if (result.status === 'pending_approval') {
      toast.info('Manual entry created — pending manager approval (>2h)')
    } else {
      toast.success('Manual entry created')
    }
    setOpen(false)
    setProjectId('')
    setHours('1')
    setPhase('application_development')
    setDescription('')
    setSubmitting(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Plus className="h-4 w-4 mr-1" /> Add Manual Entry
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Manual Time Entry</DialogTitle>
          <DialogDescription>
            Record time that wasn&apos;t captured by Claude Code sessions or git commits.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Project</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Hours</Label>
              <Input
                type="number"
                step="0.25"
                min="0.25"
                max="24"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Phase</Label>
              <Select value={phase} onValueChange={setPhase}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="preliminary">Preliminary</SelectItem>
                  <SelectItem value="application_development">App Development</SelectItem>
                  <SelectItem value="post_implementation">Post-Implementation</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What did you work on?"
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Entry'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
