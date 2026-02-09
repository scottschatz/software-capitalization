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
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { CheckCircle } from 'lucide-react'

interface ConfirmAllButtonProps {
  date: string
  pendingCount: number
  onConfirmed?: (count: number) => void
}

export function ConfirmAllButton({ date, pendingCount, onConfirmed }: ConfirmAllButtonProps) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)

  if (pendingCount === 0) return null

  async function handleConfirmAll() {
    setShowConfirmDialog(false)
    setSubmitting(true)
    const res = await fetch('/api/entries/confirm-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date }),
    })

    if (!res.ok) {
      toast.error('Failed to confirm entries')
      setSubmitting(false)
      return
    }

    const result = await res.json()
    toast.success(`${result.confirmed} entries confirmed`)
    setSubmitting(false)
    onConfirmed?.(result.confirmed)
    router.refresh()
  }

  return (
    <>
      <Button onClick={() => setShowConfirmDialog(true)} disabled={submitting}>
        <CheckCircle className="h-4 w-4 mr-1" />
        {submitting ? 'Confirming...' : `Confirm All (${pendingCount})`}
      </Button>

      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm All {pendingCount} Entries?</DialogTitle>
            <DialogDescription>
              This will accept the AI-suggested hours, phases, and descriptions for all
              pending entries on {date}. Bulk-confirmed entries are tracked separately
              in the audit trail.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmAll}>
              <CheckCircle className="h-4 w-4 mr-1" />
              Confirm All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
