'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { CheckCircle, XCircle, ShieldCheck, Loader2, AlertTriangle, Undo2 } from 'lucide-react'

const PHASE_LABELS: Record<string, string> = {
  preliminary: 'Preliminary',
  application_development: 'App Dev',
  post_implementation: 'Post-Impl',
}

interface PendingEntry {
  id: string
  type: 'daily' | 'manual'
  date: string
  developerName: string
  developerEmail: string
  developerId: string
  projectName: string
  hours: number
  phase: string
  phaseEffective: string | null
  description: string
  status: string
}

interface ApprovalsClientProps {
  entries: PendingEntry[]
  currentDeveloperId: string
}

export function ApprovalsClient({ entries, currentDeveloperId }: ApprovalsClientProps) {
  const router = useRouter()
  const [processing, setProcessing] = useState<string | null>(null)
  const [rejectDialogEntry, setRejectDialogEntry] = useState<PendingEntry | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkApproving, setBulkApproving] = useState(false)

  async function handleApprove(entry: PendingEntry) {
    if (entry.developerId === currentDeveloperId) {
      toast.error('Cannot approve your own entries (segregation of duties)')
      return
    }

    setProcessing(entry.id)
    try {
      const url = entry.type === 'daily'
        ? `/api/entries/${entry.id}/approve`
        : `/api/entries/manual/${entry.id}/approve`

      const res = await fetch(url, { method: 'PATCH' })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || 'Failed to approve entry')
        return
      }
      toast.success(`Approved ${entry.type} entry for ${entry.developerName}`)
      router.refresh()
    } finally {
      setProcessing(null)
    }
  }

  function openRejectDialog(entry: PendingEntry) {
    if (entry.developerId === currentDeveloperId) {
      toast.error('Cannot reject your own entries (segregation of duties)')
      return
    }
    setRejectDialogEntry(entry)
    setRejectReason('')
  }

  async function handleReject() {
    if (!rejectDialogEntry) return
    if (rejectReason.trim().length < 10) {
      toast.error('Rejection reason must be at least 10 characters')
      return
    }

    setRejecting(true)
    try {
      const url = rejectDialogEntry.type === 'daily'
        ? `/api/entries/${rejectDialogEntry.id}/reject`
        : `/api/entries/manual/${rejectDialogEntry.id}/reject`

      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason.trim() }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || 'Failed to reject entry')
        return
      }
      toast.success(`Rejected ${rejectDialogEntry.type} entry for ${rejectDialogEntry.developerName}`)
      setRejectDialogEntry(null)
      router.refresh()
    } finally {
      setRejecting(false)
    }
  }

  async function handleUnflag(entry: PendingEntry) {
    setProcessing(entry.id)
    try {
      const res = await fetch(`/api/entries/${entry.id}/unflag`, { method: 'PATCH' })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || 'Failed to unflag entry')
        return
      }
      toast.success(`Returned entry for ${entry.developerName} to pending`)
      router.refresh()
    } finally {
      setProcessing(null)
    }
  }

  // Bulk approval: only daily entries that are not the current user's own entries can be bulk-approved
  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  function toggleSelectAll(approvableEntries: PendingEntry[]) {
    const approvableIds = approvableEntries
      .filter((e) => e.type === 'daily' && e.developerId !== currentDeveloperId)
      .map((e) => e.id)
    const allSelected = approvableIds.every((id) => selectedIds.has(id))
    if (allSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        approvableIds.forEach((id) => next.delete(id))
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        approvableIds.forEach((id) => next.add(id))
        return next
      })
    }
  }

  async function handleBulkApprove() {
    if (selectedIds.size === 0) return
    setBulkApproving(true)
    try {
      const res = await fetch('/api/entries/approve-bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryIds: Array.from(selectedIds) }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || 'Failed to bulk approve entries')
        return
      }
      const result = await res.json() as { approved: number; skipped: Array<{ id: string; reason: string }> }
      if (result.approved > 0) {
        toast.success(`Approved ${result.approved} ${result.approved === 1 ? 'entry' : 'entries'}`)
      }
      if (result.skipped.length > 0) {
        const reasons = [...new Set(result.skipped.map((s) => s.reason))]
        toast.warning(`Skipped ${result.skipped.length}: ${reasons.join('; ')}`)
      }
      setSelectedIds(new Set())
      router.refresh()
    } finally {
      setBulkApproving(false)
    }
  }

  const pendingEntries = entries.filter((e) => e.status === 'pending_approval')
  const flaggedEntries = entries.filter((e) => e.status === 'flagged')

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldCheck className="h-6 w-6" />
          Approvals
        </h1>
        <p className="text-sm text-muted-foreground">
          Review and approve or reject entries that require manager authorization.
        </p>
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold">No pending approvals</h3>
            <p className="text-muted-foreground mt-1">
              All entries are up to date. Check back later.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Flagged entries section */}
          {flaggedEntries.length > 0 && (
            <>
              <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="font-medium text-amber-700">
                  {flaggedEntries.length} flagged {flaggedEntries.length === 1 ? 'entry' : 'entries'}
                </span>
                <span className="text-muted-foreground">— requires review due to cross-validation anomalies</span>
              </div>

              <div className="border border-amber-200 rounded-lg overflow-hidden bg-amber-50/30">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-amber-100/50 border-b border-amber-200">
                        <th className="text-left px-4 py-3 font-medium">Date</th>
                        <th className="text-left px-4 py-3 font-medium">Developer</th>
                        <th className="text-left px-4 py-3 font-medium">Project</th>
                        <th className="text-left px-4 py-3 font-medium">Status</th>
                        <th className="text-right px-4 py-3 font-medium">Hours</th>
                        <th className="text-left px-4 py-3 font-medium">Phase</th>
                        <th className="text-left px-4 py-3 font-medium">Description</th>
                        <th className="text-right px-4 py-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {flaggedEntries.map((entry) => {
                        const isOwnEntry = entry.developerId === currentDeveloperId
                        const isProcessing = processing === entry.id

                        return (
                          <tr key={`${entry.type}-${entry.id}`} className="border-b border-amber-200 last:border-0 hover:bg-amber-50/50">
                            <td className="px-4 py-3 whitespace-nowrap">{entry.date}</td>
                            <td className="px-4 py-3 whitespace-nowrap">{entry.developerName}</td>
                            <td className="px-4 py-3 whitespace-nowrap">{entry.projectName}</td>
                            <td className="px-4 py-3">
                              <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-100">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Flagged
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right font-medium">{entry.hours.toFixed(1)}h</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                <Badge variant="outline" className="text-xs">
                                  {PHASE_LABELS[entry.phase] ?? entry.phase}
                                </Badge>
                                {entry.phaseEffective && entry.phaseEffective !== entry.phase && (
                                  <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-[10px]">
                                    Eff: {PHASE_LABELS[entry.phaseEffective] ?? entry.phaseEffective}
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 max-w-xs truncate" title={entry.description}>
                              {entry.description.split('\n')[0].slice(0, 100)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                  onClick={() => handleApprove(entry)}
                                  disabled={isOwnEntry || isProcessing}
                                  title={isOwnEntry ? 'Cannot approve your own entry' : 'Approve'}
                                >
                                  {isProcessing ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <CheckCircle className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => openRejectDialog(entry)}
                                  disabled={isOwnEntry || isProcessing}
                                  title={isOwnEntry ? 'Cannot reject your own entry' : 'Reject'}
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                                {entry.type === 'daily' && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                    onClick={() => handleUnflag(entry)}
                                    disabled={isProcessing}
                                    title="Return to pending"
                                  >
                                    <Undo2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Pending approval entries section */}
          {pendingEntries.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  {pendingEntries.length} {pendingEntries.length === 1 ? 'entry' : 'entries'} pending approval
                </div>
                {selectedIds.size > 0 && (
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={handleBulkApprove}
                    disabled={bulkApproving}
                  >
                    {bulkApproving ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        Approving...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Approve Selected ({selectedIds.size})
                      </>
                    )}
                  </Button>
                )}
              </div>

              <div className="border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 border-b">
                        <th className="px-4 py-3 w-10">
                          <input
                            type="checkbox"
                            className="rounded border-gray-300"
                            checked={
                              pendingEntries
                                .filter((e) => e.type === 'daily' && e.developerId !== currentDeveloperId)
                                .length > 0 &&
                              pendingEntries
                                .filter((e) => e.type === 'daily' && e.developerId !== currentDeveloperId)
                                .every((e) => selectedIds.has(e.id))
                            }
                            onChange={() => toggleSelectAll(pendingEntries)}
                            title="Select all approvable entries"
                          />
                        </th>
                        <th className="text-left px-4 py-3 font-medium">Date</th>
                        <th className="text-left px-4 py-3 font-medium">Developer</th>
                        <th className="text-left px-4 py-3 font-medium">Project</th>
                        <th className="text-left px-4 py-3 font-medium">Type</th>
                        <th className="text-right px-4 py-3 font-medium">Hours</th>
                        <th className="text-left px-4 py-3 font-medium">Phase</th>
                        <th className="text-left px-4 py-3 font-medium">Description</th>
                        <th className="text-right px-4 py-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingEntries.map((entry) => {
                        const isOwnEntry = entry.developerId === currentDeveloperId
                        const isProcessing = processing === entry.id
                        const canBulkSelect = entry.type === 'daily' && !isOwnEntry

                        return (
                          <tr key={`${entry.type}-${entry.id}`} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="px-4 py-3">
                              {canBulkSelect ? (
                                <input
                                  type="checkbox"
                                  className="rounded border-gray-300"
                                  checked={selectedIds.has(entry.id)}
                                  onChange={() => toggleSelected(entry.id)}
                                />
                              ) : (
                                <input
                                  type="checkbox"
                                  className="rounded border-gray-300 opacity-30"
                                  disabled
                                  title={isOwnEntry ? 'Cannot approve your own entry' : 'Only daily entries can be bulk approved'}
                                />
                              )}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">{entry.date}</td>
                            <td className="px-4 py-3 whitespace-nowrap">{entry.developerName}</td>
                            <td className="px-4 py-3 whitespace-nowrap">{entry.projectName}</td>
                            <td className="px-4 py-3">
                              <Badge variant={entry.type === 'manual' ? 'outline' : 'secondary'} className="text-xs">
                                {entry.type === 'daily' ? 'Daily' : 'Manual'}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-right font-medium">{entry.hours.toFixed(1)}h</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1">
                                <Badge variant="outline" className="text-xs">
                                  {PHASE_LABELS[entry.phase] ?? entry.phase}
                                </Badge>
                                {entry.phaseEffective && entry.phaseEffective !== entry.phase && (
                                  <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-[10px]">
                                    Eff: {PHASE_LABELS[entry.phaseEffective] ?? entry.phaseEffective}
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 max-w-xs truncate" title={entry.description}>
                              {entry.description.split('\n')[0].slice(0, 100)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                  onClick={() => handleApprove(entry)}
                                  disabled={isOwnEntry || isProcessing}
                                  title={isOwnEntry ? 'Cannot approve your own entry' : 'Approve'}
                                >
                                  {isProcessing ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <CheckCircle className="h-4 w-4" />
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => openRejectDialog(entry)}
                                  disabled={isOwnEntry || isProcessing}
                                  title={isOwnEntry ? 'Cannot reject your own entry' : 'Reject'}
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Reject dialog */}
      <Dialog open={!!rejectDialogEntry} onOpenChange={(open) => !open && setRejectDialogEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Entry</DialogTitle>
            <DialogDescription>
              {rejectDialogEntry && (
                <>
                  Rejecting {rejectDialogEntry.type} entry for{' '}
                  <strong>{rejectDialogEntry.developerName}</strong> on {rejectDialogEntry.date} (
                  {rejectDialogEntry.hours}h — {rejectDialogEntry.projectName}).
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <label className="text-sm font-medium">Rejection Reason (min 10 characters)</label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explain why this entry is being rejected..."
              rows={3}
            />
            {rejectReason.length > 0 && rejectReason.length < 10 && (
              <p className="text-xs text-red-500">
                {10 - rejectReason.length} more characters needed
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogEntry(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejecting || rejectReason.trim().length < 10}
            >
              {rejecting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Rejecting...
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 mr-1" />
                  Reject Entry
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
