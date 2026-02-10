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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

interface PhaseChangeDialogProps {
  projectId: string
  currentPhase: string
  isAdmin?: boolean
}

const phaseLabels: Record<string, string> = {
  preliminary: 'Preliminary',
  application_development: 'Application Development',
  post_implementation: 'Post-Implementation',
}

const allPhases = ['preliminary', 'application_development', 'post_implementation'] as const

export function PhaseChangeDialog({ projectId, currentPhase, isAdmin }: PhaseChangeDialogProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [requestedPhase, setRequestedPhase] = useState('')
  const [reason, setReason] = useState('')
  const [effectiveDate, setEffectiveDate] = useState(
    new Date().toISOString().split('T')[0]
  )
  const [goLiveDate, setGoLiveDate] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const availablePhases = allPhases.filter((p) => p !== currentPhase)
  const showGoLiveDate = requestedPhase === 'post_implementation'

  async function handleSubmit() {
    if (!requestedPhase || !reason.trim()) {
      toast.error('Please select a phase and provide a reason')
      return
    }

    setSubmitting(true)

    if (isAdmin) {
      // Direct phase change (admin)
      const res = await fetch(`/api/projects/${projectId}/phase-change/direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          newPhase: requestedPhase,
          reason,
          effectiveDate: effectiveDate || null,
          goLiveDate: showGoLiveDate ? (goLiveDate || effectiveDate || null) : null,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        const errorMsg = err.error || 'Failed to change phase'

        // Conflict of interest — admin has entries on this project.
        // Fall back to submitting a request for another admin/manager to approve.
        if (errorMsg.includes('conflict of interest') || errorMsg.includes('recorded hours')) {
          const reqRes = await fetch(`/api/projects/${projectId}/phase-change`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requestedPhase, reason }),
          })

          if (!reqRes.ok) {
            const reqErr = await reqRes.json()
            toast.error(reqErr.error || 'Failed to submit request')
            setSubmitting(false)
            return
          }

          toast.success('You have hours on this project, so a phase change request was submitted for another admin/manager to approve.')
          setOpen(false)
          setRequestedPhase('')
          setReason('')
          setGoLiveDate('')
          setSubmitting(false)
          router.refresh()
          return
        }

        toast.error(errorMsg)
        setSubmitting(false)
        return
      }

      toast.success(`Phase changed to ${phaseLabels[requestedPhase]}`)
    } else {
      // Request workflow (non-admin)
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
    }

    setOpen(false)
    setRequestedPhase('')
    setReason('')
    setGoLiveDate('')
    setSubmitting(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {isAdmin ? 'Change Phase' : 'Request Phase Change'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isAdmin ? 'Change Project Phase' : 'Request Phase Change'}
          </DialogTitle>
          <DialogDescription>
            {isAdmin
              ? 'As an admin, you can directly change the project phase. This is logged in the audit trail.'
              : 'Phase changes require approval from the designated administrator.'}{' '}
            Current phase: <strong>{phaseLabels[currentPhase]}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>New Phase</Label>
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

          {isAdmin && (
            <div className="space-y-2">
              <Label>Effective Date</Label>
              <Input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                When this phase becomes effective. Defaults to today.
              </p>
            </div>
          )}

          {isAdmin && showGoLiveDate && (
            <div className="space-y-2">
              <Label>Go-Live Date</Label>
              <Input
                type="date"
                value={goLiveDate || effectiveDate}
                onChange={(e) => setGoLiveDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                When the project entered production. This marks the start of depreciation.
                Defaults to the effective date.
              </p>
            </div>
          )}

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
            {submitting
              ? 'Submitting...'
              : isAdmin
                ? 'Apply Phase Change'
                : 'Submit Request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
