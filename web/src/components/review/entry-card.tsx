'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
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
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { toast } from 'sonner'
import { CheckCircle, XCircle, ChevronDown, ChevronUp } from 'lucide-react'

interface Project {
  id: string
  name: string
  phase: string
}

interface EntryCardProps {
  entry: {
    id: string
    hoursEstimated: number | null
    phaseAuto: string | null
    descriptionAuto: string | null
    hoursConfirmed: number | null
    phaseConfirmed: string | null
    descriptionConfirmed: string | null
    confirmedAt: string | null
    adjustmentReason: string | null
    status: string
    sourceSessionIds: string[]
    sourceCommitIds: string[]
    project: Project | null
  }
  projects: Project[]
  onConfirmed?: (entryId: string) => void
}

export function EntryCard({ entry, projects, onConfirmed }: EntryCardProps) {
  const router = useRouter()
  const isConfirmed = entry.status === 'confirmed'

  // Parse AI description (split off confidence/reasoning)
  const [aiSummary, aiMeta] = (entry.descriptionAuto ?? '').split('\n---\n')

  const [hours, setHours] = useState(
    entry.hoursConfirmed ?? entry.hoursEstimated ?? 0
  )
  const [phase, setPhase] = useState(
    entry.phaseConfirmed ?? entry.phaseAuto ?? entry.project?.phase ?? 'application_development'
  )
  const [description, setDescription] = useState(
    entry.descriptionConfirmed ?? aiSummary ?? ''
  )
  const [projectId, setProjectId] = useState(entry.project?.id ?? '')
  const [adjustmentReason, setAdjustmentReason] = useState(entry.adjustmentReason ?? '')
  const [showSource, setShowSource] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const capitalizable = phase === 'application_development'
  const hoursChanged =
    entry.hoursEstimated != null &&
    Math.abs(hours - entry.hoursEstimated) / entry.hoursEstimated > 0.2
  const needsReason = hoursChanged && !adjustmentReason.trim()

  async function handleConfirm() {
    if (needsReason) {
      toast.error('Please provide a reason for the hours adjustment (>20% change)')
      return
    }

    setSubmitting(true)
    const res = await fetch(`/api/entries/${entry.id}/confirm`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hoursConfirmed: hours,
        phaseConfirmed: phase,
        descriptionConfirmed: description,
        projectId: projectId || undefined,
        adjustmentReason: adjustmentReason || null,
      }),
    })

    if (!res.ok) {
      const err = await res.json()
      toast.error(err.error || 'Failed to confirm')
      setSubmitting(false)
      return
    }

    toast.success('Entry confirmed')
    setSubmitting(false)
    onConfirmed?.(entry.id)
    router.refresh()
  }

  return (
    <Card className={isConfirmed ? 'border-green-200 bg-green-50/30' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold">
              {entry.project?.name ?? 'Unmatched Project'}
            </span>
            {capitalizable ? (
              <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">
                <CheckCircle className="h-3 w-3 mr-1" /> Capitalizable
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground text-xs">
                <XCircle className="h-3 w-3 mr-1" /> Expensed
              </Badge>
            )}
            {isConfirmed && (
              <Badge variant="default" className="text-xs">Confirmed</Badge>
            )}
          </div>
          {entry.hoursEstimated != null && (
            <span className="text-sm text-muted-foreground">
              AI estimate: {entry.hoursEstimated}h
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Project selector */}
          <div className="space-y-1">
            <Label className="text-xs">Project</Label>
            <Select value={projectId} onValueChange={setProjectId} disabled={isConfirmed}>
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

          {/* Hours */}
          <div className="space-y-1">
            <Label className="text-xs">
              Hours
              <span className="text-muted-foreground ml-1 font-normal">
                (active dev time, not wall clock)
              </span>
            </Label>
            <Input
              type="number"
              step="0.25"
              min="0"
              max="24"
              value={hours}
              onChange={(e) => setHours(parseFloat(e.target.value) || 0)}
              disabled={isConfirmed}
            />
          </div>

          {/* Phase */}
          <div className="space-y-1">
            <Label className="text-xs">Phase</Label>
            <Select value={phase} onValueChange={setPhase} disabled={isConfirmed}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="preliminary">Preliminary (Expensed)</SelectItem>
                <SelectItem value="application_development">App Development (Capitalized)</SelectItem>
                <SelectItem value="post_implementation">Post-Implementation (Expensed)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1">
          <Label className="text-xs">Description</Label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            disabled={isConfirmed}
          />
        </div>

        {/* Adjustment reason (conditional) */}
        {hoursChanged && !isConfirmed && (
          <div className="space-y-1">
            <Label className="text-xs text-amber-600">
              Adjustment Reason (required — hours changed &gt;20%)
            </Label>
            <Input
              value={adjustmentReason}
              onChange={(e) => setAdjustmentReason(e.target.value)}
              placeholder="Why did you adjust the hours?"
            />
          </div>
        )}

        {/* Source data toggle */}
        <div>
          <button
            onClick={() => setShowSource(!showSource)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {showSource ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Source data ({entry.sourceSessionIds.length} sessions, {entry.sourceCommitIds.length} commits)
          </button>
          {showSource && (
            <div className="mt-2 text-xs text-muted-foreground bg-muted/50 rounded p-2 space-y-1">
              {aiMeta && (
                <>
                  <p className="whitespace-pre-wrap">{aiMeta}</p>
                  <Separator className="my-1" />
                </>
              )}
              <p>Session IDs: {entry.sourceSessionIds.join(', ') || 'none'}</p>
              <p>Commit IDs: {entry.sourceCommitIds.join(', ') || 'none'}</p>
            </div>
          )}
        </div>

        {/* Confirm button */}
        {!isConfirmed && (
          <div className="flex justify-end">
            <Button onClick={handleConfirm} disabled={submitting || needsReason} size="sm">
              {submitting ? 'Confirming...' : 'Confirm Entry'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
