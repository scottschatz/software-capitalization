'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { CheckCircle, XCircle } from 'lucide-react'

interface PhaseChangeReviewProps {
  projectId: string
  requestId: string
  canReview: boolean
}

export function PhaseChangeReview({ projectId, requestId, canReview }: PhaseChangeReviewProps) {
  const router = useRouter()
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (!canReview) return null

  async function handleAction(action: 'approve' | 'reject') {
    setSubmitting(true)
    const res = await fetch(
      `/api/projects/${projectId}/phase-change/${requestId}/${action}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewNote: note || null }),
      }
    )

    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error || `Failed to ${action}`)
      setSubmitting(false)
      return
    }

    toast.success(action === 'approve' ? 'Phase change approved' : 'Phase change rejected')
    setSubmitting(false)
    router.refresh()
  }

  return (
    <div className="flex items-center gap-2">
      <Textarea
        placeholder="Review note (optional)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={1}
        className="max-w-xs text-sm"
      />
      <Button
        size="sm"
        variant="default"
        onClick={() => handleAction('approve')}
        disabled={submitting}
      >
        <CheckCircle className="h-4 w-4 mr-1" /> Approve
      </Button>
      <Button
        size="sm"
        variant="destructive"
        onClick={() => handleAction('reject')}
        disabled={submitting}
      >
        <XCircle className="h-4 w-4 mr-1" /> Reject
      </Button>
    </div>
  )
}
