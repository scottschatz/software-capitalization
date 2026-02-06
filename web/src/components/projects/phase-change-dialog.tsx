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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

interface PhaseChangeDialogProps {
  projectId: string
  currentPhase: string
}

const phaseLabels: Record<string, string> = {
  preliminary: 'Preliminary',
  application_development: 'Application Development',
  post_implementation: 'Post-Implementation',
}

const allPhases = ['preliminary', 'application_development', 'post_implementation'] as const

export function PhaseChangeDialog({ projectId, currentPhase }: PhaseChangeDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [requestedPhase, setRequestedPhase] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const availablePhases = allPhases.filter((p) => p !== currentPhase)

  async function handleSubmit() {
    if (!requestedPhase || !reason.trim()) {
      toast.error('Please select a phase and provide a reason')
      return
    }

    setSubmitting(true)
    const res = await fetch(`/api/projects/${projectId}/phase-change`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestedPhase, reason }),
    })

    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error || 'Failed to submit request')
      setSubmitting(false)
      return
    }

    toast.success('Phase change request submitted for approval')
    setOpen(false)
    setRequestedPhase('')
    setReason('')
    setSubmitting(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          Request Phase Change
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request Phase Change</DialogTitle>
          <DialogDescription>
            Phase changes require approval from the designated administrator. Current phase:{' '}
            <strong>{phaseLabels[currentPhase]}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Requested Phase</Label>
            <Select value={requestedPhase} onValueChange={setRequestedPhase}>
              <SelectTrigger>
                <SelectValue placeholder="Select new phase" />
              </SelectTrigger>
              <SelectContent>
                {availablePhases.map((p) => (
                  <SelectItem key={p} value={p}>
                    {phaseLabels[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Reason for Change</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this project should move to the new phase..."
              rows={3}
            />
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            <p><strong>Preliminary</strong> — Conceptual design, evaluating alternatives. Hours are <em>expensed</em>.</p>
            <p><strong>Application Development</strong> — Active coding, testing, installation. Hours are <em>capitalized</em>.</p>
            <p><strong>Post-Implementation</strong> — Maintenance, bug fixes, training. Hours are <em>expensed</em>.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? 'Submitting...' : 'Submit Request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
