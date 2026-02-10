'use client'

import { useState, useRef, useCallback } from 'react'
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
import { Slider } from '@/components/ui/slider'
import { CheckCircle, XCircle, ChevronDown, ChevronUp, AlertTriangle, Cpu, Cloud, GitCommit, MessageSquare, Pencil, SlidersHorizontal, ArrowRight, Loader2, Plus } from 'lucide-react'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { DataQualityIndicators } from './data-quality-indicators'
import type { SerializedEntry, EnhancementProject } from './review-page-client'

interface Project {
  id: string
  name: string
  phase: string
  managementAuthorized?: boolean
  probableToComplete?: boolean
  authorizationDate?: string | null
}

interface EntryCardProps {
  entry: SerializedEntry
  projects: Project[]
  enhancements?: EnhancementProject[]
  onConfirmed?: (entryId: string) => void
}

const PHASE_LABELS: Record<string, string> = {
  preliminary: 'Preliminary',
  application_development: 'App Development',
  post_implementation: 'Post-Implementation',
}

const WORK_TYPE_LABELS: Record<string, string> = {
  coding: 'Coding',
  debugging: 'Debugging',
  refactoring: 'Refactoring',
  research: 'Research',
  code_review: 'Code Review',
  testing: 'Testing',
  documentation: 'Documentation',
  devops: 'DevOps',
}

function ModelBadge({ model, fallback }: { model: string | null; fallback: boolean }) {
  if (!model || model === 'none') return null

  const shortName = model.includes('/') ? model.split('/').pop()! : model
  const displayName = shortName.length > 20 ? shortName.slice(0, 18) + '...' : shortName

  if (fallback) {
    return (
      <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 gap-0.5">
        <Cloud className="h-2.5 w-2.5" />
        {displayName}
        <span className="text-amber-500">(fallback)</span>
      </Badge>
    )
  }

  return (
    <Badge variant="outline" className="text-[10px] text-muted-foreground gap-0.5">
      <Cpu className="h-2.5 w-2.5" />
      {displayName}
    </Badge>
  )
}

export function EntryCard({ entry, projects, enhancements = [], onConfirmed }: EntryCardProps) {
  const router = useRouter()
  const isConfirmed = entry.status === 'confirmed'

  // Parse AI description (split off confidence/reasoning and enhancement note)
  const fullDesc = entry.descriptionAuto ?? ''
  const [aiSummary, aiMeta] = fullDesc.split('\n---\n')
  const isFlagged = entry.status === 'flagged'
  const enhancementMatch = fullDesc.match(/⚠️ Enhancement Suggested: (.+)/)
  const enhancementReason = enhancementMatch?.[1] ?? null

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
  const [entryFactor, setEntryFactor] = useState(entry.adjustmentFactor ?? 1.0)
  const [manualHoursOverride, setManualHoursOverride] = useState(false)
  const [showSource, setShowSource] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [note, setNote] = useState(entry.developerNote ?? '')
  const [noteSaving, setNoteSaving] = useState(false)
  const noteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-save note with debounce (1s after last keystroke)
  const saveNote = useCallback(async (value: string) => {
    setNoteSaving(true)
    try {
      const res = await fetch(`/api/entries/${entry.id}/note`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ developerNote: value.trim() || null }),
      })
      if (!res.ok) {
        toast.error('Failed to save note')
      }
    } catch {
      toast.error('Failed to save note')
    } finally {
      setNoteSaving(false)
    }
  }, [entry.id])

  function handleNoteChange(value: string) {
    setNote(value)
    if (noteTimerRef.current) clearTimeout(noteTimerRef.current)
    noteTimerRef.current = setTimeout(() => saveNote(value), 1000)
  }

  // When factor changes, recalculate hours from raw
  function handleFactorChange(newFactor: number) {
    setEntryFactor(newFactor)
    setManualHoursOverride(false)
    if (entry.hoursRaw != null) {
      setHours(Math.round(entry.hoursRaw * newFactor * 100) / 100)
    }
  }

  const effectivePhaseForCap = entry.phaseEffective ?? phase
  const capitalizable = effectivePhaseForCap === 'application_development'
  const hasManagerOverride = entry.phaseEffective != null && entry.phaseEffective !== phase

  // Date-aware authorization check for hint display
  const proj = projects.find((p) => p.id === projectId)
  const projAuthDate = proj?.authorizationDate ? new Date(proj.authorizationDate) : null
  const authorizedAtDate = proj?.managementAuthorized === true
    && (projAuthDate === null || projAuthDate <= new Date(entry.date))
  const fullyAuthorized = authorizedAtDate && proj?.probableToComplete === true
  // Authorization hint: what to show alongside the "Capitalizable" badge
  const authHint = capitalizable && !fullyAuthorized
    ? !proj?.managementAuthorized
      ? 'pending authorization'
      : projAuthDate && projAuthDate > new Date(entry.date)
        ? 'before authorization date'
        : !proj?.probableToComplete
          ? 'completion not assessed'
          : null
    : null

  const hoursChanged =
    entry.hoursEstimated != null &&
    Math.abs(hours - entry.hoursEstimated) / entry.hoursEstimated > 0.2
  const needsReason = hoursChanged && !adjustmentReason.trim()

  // Phase mismatch: developer is overriding to a phase that contradicts the project's current phase
  const projectPhase = proj?.phase ?? entry.project?.phase
  const phaseContradiction = projectPhase && phase !== projectPhase
  const capitalizingPostImpl = projectPhase === 'post_implementation' && phase === 'application_development'

  // Detect overrides from AI originals (for confirmed entries)
  const overrides: string[] = []
  if (isConfirmed) {
    if (entry.hoursConfirmed != null && entry.hoursEstimated != null && entry.hoursConfirmed !== entry.hoursEstimated) {
      overrides.push(`Hours: AI suggested ${entry.hoursEstimated}h, confirmed ${entry.hoursConfirmed}h`)
    }
    if (entry.phaseConfirmed && entry.phaseAuto && entry.phaseConfirmed !== entry.phaseAuto) {
      overrides.push(`Phase: AI suggested ${PHASE_LABELS[entry.phaseAuto] ?? entry.phaseAuto}, confirmed ${PHASE_LABELS[entry.phaseConfirmed] ?? entry.phaseConfirmed}`)
    }
    const aiDescClean = aiSummary?.trim()
    if (entry.descriptionConfirmed && aiDescClean && entry.descriptionConfirmed.trim() !== aiDescClean) {
      overrides.push('Description was edited')
    }
  }

  async function handleConfirm() {
    if (needsReason) {
      toast.error('Please provide a reason for the hours adjustment (>20% change)')
      return
    }
    if (capitalizingPostImpl) {
      toast.error('To capitalize post-implementation work, reassign this entry to an enhancement project using the panel below the phase selector.')
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
        adjustmentFactor: entryFactor,
        developerNote: note.trim() || null,
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

  // Format the adjustment factor for display
  const adjPct = Math.round(entryFactor * 100)
  const showAdjInfo = entry.hoursRaw != null

  // Format minutes as "Xh Ym"
  function fmtMin(min: number): string {
    const h = Math.floor(min / 60)
    const m = min % 60
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  // Aggregate source stats (per-day when dailyBreakdown available, session-level fallback)
  const sessions = entry.sourceSessions ?? []
  const commits = entry.sourceCommits ?? []
  const totalMessages = sessions.reduce((sum, s) => sum + (s.messageCount ?? 0), 0)
  const totalToolUses = sessions.reduce((sum, s) => sum + (s.toolUseCount ?? 0), 0)
  const totalPrompts = sessions.reduce((sum, s) => sum + (s.userPromptCount ?? 0), 0)
  const totalHookEvents = sessions.reduce((sum, s) => sum + (s.hookEventCount ?? 0), 0)
  const totalActiveMin = sessions.reduce((sum, s) => sum + (s.activeMinutes ?? 0), 0)
  const hasActiveTime = sessions.some((s) => s.activeMinutes != null)
  const anyMultiDay = sessions.some((s) => s.isMultiDay)
  const totalInsertions = commits.reduce((sum, c) => sum + (c.insertions ?? 0), 0)
  const totalDeletions = commits.reduce((sum, c) => sum + (c.deletions ?? 0), 0)
  const totalFilesChanged = commits.reduce((sum, c) => sum + (c.filesChanged ?? 0), 0)

  return (
    <Card className={isConfirmed ? 'border-green-200 bg-green-50/30' : isFlagged ? 'border-amber-300 bg-amber-50/30' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-semibold">
              {entry.project?.name ?? 'Unmatched Project'}
            </span>
            {capitalizable ? (
              <>
                <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">
                  <CheckCircle className="h-3 w-3 mr-1" /> Capitalizable
                </Badge>
                {authHint && (
                  <span className="text-[10px] text-amber-600">({authHint})</span>
                )}
              </>
            ) : (
              <Badge variant="outline" className="text-muted-foreground text-xs">
                <XCircle className="h-3 w-3 mr-1" /> Expensed
              </Badge>
            )}
            <InfoTooltip text="Under ASC 350-40-25-2, costs are capitalizable only during the Application Development phase, after management has authorized and committed to funding the project (ASU 2025-06)." />
            {isConfirmed && (
              <Badge variant="default" className="text-xs">Confirmed</Badge>
            )}
            {isFlagged && (
              <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">
                <AlertTriangle className="h-3 w-3 mr-1" /> Flagged
              </Badge>
            )}
            {hasManagerOverride && (
              <Badge className="bg-purple-100 text-purple-800 border-purple-200 text-xs">
                Manager Override: {PHASE_LABELS[entry.phaseEffective!] ?? entry.phaseEffective}
              </Badge>
            )}
            {entry.workType && (
              <Badge variant="secondary" className="text-[10px] text-muted-foreground font-normal">
                {WORK_TYPE_LABELS[entry.workType] ?? entry.workType}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <DataQualityIndicators
              confidenceScore={entry.confidenceScore}
              confidenceReasoning={aiMeta ?? null}
              sessions={sessions}
              commits={commits}
              hookEventCount={totalHookEvents}
            />
            <ModelBadge model={entry.modelUsed} fallback={entry.modelFallback} />
            {entry.hoursEstimated != null && (
              <span className="text-sm text-muted-foreground">
                AI estimate: {entry.hoursEstimated}h
                {showAdjInfo && (
                  <span className="text-xs ml-1">
                    ({entry.hoursRaw}h &times; {adjPct}%)
                  </span>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Override indicators for confirmed entries */}
        {isConfirmed && overrides.length > 0 && (
          <div className="flex items-center gap-1 mt-1">
            <Pencil className="h-3 w-3 text-blue-500 flex-shrink-0" />
            <span className="text-[11px] text-blue-600">
              Overrides: {overrides.join(' | ')}
            </span>
            <InfoTooltip text="All changes from AI estimates are logged for audit trail compliance (DailyEntryRevision). Changes exceeding 20% require documented justification." />
          </div>
        )}
      </CardHeader>

      {isFlagged && enhancementReason && (
        <EnhancementReassignPanel
          entryId={entry.id}
          enhancementReason={enhancementReason}
          enhancements={enhancements}
          onReassigned={() => {
            onConfirmed?.(entry.id)
            router.refresh()
          }}
        />
      )}

      {isFlagged && entry.outlierFlag && (
        <div className="mx-6 mb-0 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-amber-800">Outlier Detected</p>
              <p className="text-amber-700 mt-1">{entry.outlierFlag}</p>
            </div>
          </div>
        </div>
      )}

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
              <InfoTooltip text="Estimate active development time, not wall-clock time. ASC 350-40 requires capitalizing only time directly attributable to software development activities. AI estimates use gap-aware active time (idle gaps >15 min excluded)." className="ml-0.5" />
            </Label>
            <Input
              type="number"
              step="0.25"
              min="0"
              max="24"
              value={hours}
              onChange={(e) => {
                setHours(parseFloat(e.target.value) || 0)
                setManualHoursOverride(true)
              }}
              disabled={isConfirmed}
            />
          </div>

          {/* Phase */}
          <div className="space-y-1">
            <Label className="text-xs">Phase <InfoTooltip text="ASC 350-40 requires categorizing work into phases. Only Application Development hours are capitalizable — Preliminary (research, planning) and Post-Implementation (maintenance, training) are expensed in the period incurred." className="ml-0.5" /></Label>
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
            {capitalizingPostImpl && !isConfirmed && (
              <PostImplEnhancementPanel
                entryId={entry.id}
                projectId={projectId}
                projectName={proj?.name ?? entry.project?.name ?? 'Unknown'}
                enhancements={enhancements}
                onReassigned={() => {
                  onConfirmed?.(entry.id)
                  router.refresh()
                }}
              />
            )}
            {phaseContradiction && !capitalizingPostImpl && !isConfirmed && (
              <p className="text-xs text-muted-foreground">
                Phase differs from project ({PHASE_LABELS[projectPhase] ?? projectPhase}).
              </p>
            )}
          </div>
        </div>

        {/* Per-entry adjustment factor */}
        {showAdjInfo && !isConfirmed && (
          <div className="flex items-center gap-3 px-3 py-2 bg-muted/30 rounded-md text-sm">
            <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-xs text-muted-foreground flex-shrink-0">Factor:</span>
            <div className="w-28 flex-shrink-0">
              <Slider
                value={[entryFactor]}
                onValueChange={([v]) => handleFactorChange(Math.round(v * 100) / 100)}
                min={0}
                max={1.5}
                step={0.05}
              />
            </div>
            <span className="text-xs font-medium w-10 text-center flex-shrink-0">{adjPct}%</span>
            {entryFactor !== 1.0 && (
              <button
                onClick={() => handleFactorChange(1.0)}
                className="text-[10px] text-muted-foreground hover:text-foreground underline flex-shrink-0"
              >
                reset
              </button>
            )}
            {entry.hoursRaw != null && (
              <span className="text-[10px] text-muted-foreground flex-shrink-0">
                {entry.hoursRaw}h raw &times; {adjPct}% = {hours}h
              </span>
            )}
            {entryFactor > 1.25 && (
              <span className="text-[10px] text-amber-600 flex-shrink-0">&gt;125% requires manager/admin</span>
            )}
            {manualHoursOverride && entry.hoursRaw != null && hours !== Math.round(entry.hoursRaw * entryFactor * 100) / 100 && (
              <span className="text-[10px] text-blue-600 flex-shrink-0">Hours manually adjusted</span>
            )}
          </div>
        )}
        {showAdjInfo && isConfirmed && entryFactor !== 1.0 && (
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground px-3">
            <SlidersHorizontal className="h-3 w-3" />
            Factor: {adjPct}% ({entry.hoursRaw}h raw &times; {adjPct}% = {entry.hoursEstimated}h)
          </div>
        )}

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

        {/* Developer note (optional, auto-saves) */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            Note <span className="font-normal">(optional)</span>
            {noteSaving && <span className="ml-1 text-[10px] text-blue-500">saving...</span>}
          </Label>
          <Input
            value={note}
            onChange={(e) => handleNoteChange(e.target.value)}
            placeholder="Add a note about this work..."
            maxLength={500}
            className="text-sm h-8"
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

        {/* Source data toggle — enriched */}
        <div>
          <button
            onClick={() => setShowSource(!showSource)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {showSource ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Evidence: {sessions.length} session{sessions.length !== 1 ? 's' : ''}, {commits.length} commit{commits.length !== 1 ? 's' : ''}
            {totalHookEvents > 0 && `, ${totalHookEvents} hook events`}
          </button>
          {showSource && (
            <div className="mt-2 text-xs bg-muted/50 rounded p-3 space-y-3">
              {/* AI Reasoning */}
              {aiMeta && (
                <>
                  <div>
                    <p className="font-medium text-foreground mb-1">AI Reasoning</p>
                    <p className="whitespace-pre-wrap text-muted-foreground">{aiMeta}</p>
                  </div>
                  <Separator />
                </>
              )}

              {/* Summary stats — per-day when available */}
              <div>
                <p className="font-medium text-foreground mb-1.5">
                  Activity Summary
                  {anyMultiDay && <span className="text-[10px] text-muted-foreground font-normal ml-1">(this day only)</span>}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {hasActiveTime && (
                    <div className="bg-background rounded px-2 py-1.5 text-center">
                      <div className="font-semibold text-sm">{fmtMin(totalActiveMin)}</div>
                      <div className="text-[10px] text-muted-foreground">Active Time</div>
                    </div>
                  )}
                  <div className="bg-background rounded px-2 py-1.5 text-center">
                    <div className="font-semibold text-sm">{totalPrompts}</div>
                    <div className="text-[10px] text-muted-foreground">Human Prompts</div>
                  </div>
                  <div className="bg-background rounded px-2 py-1.5 text-center">
                    <div className="font-semibold text-sm">{totalMessages}</div>
                    <div className="text-[10px] text-muted-foreground">Messages</div>
                  </div>
                  <div className="bg-background rounded px-2 py-1.5 text-center">
                    <div className="font-semibold text-sm">{totalToolUses}</div>
                    <div className="text-[10px] text-muted-foreground">Tool Uses</div>
                  </div>
                  {totalHookEvents > 0 && (
                    <div className="bg-background rounded px-2 py-1.5 text-center">
                      <div className="font-semibold text-sm">{totalHookEvents}</div>
                      <div className="text-[10px] text-muted-foreground">Hook Events</div>
                    </div>
                  )}
                  {commits.length > 0 && (
                    <>
                      <div className="bg-background rounded px-2 py-1.5 text-center">
                        <div className="font-semibold text-sm text-green-600">+{totalInsertions}</div>
                        <div className="text-[10px] text-muted-foreground">Insertions</div>
                      </div>
                      <div className="bg-background rounded px-2 py-1.5 text-center">
                        <div className="font-semibold text-sm text-red-600">-{totalDeletions}</div>
                        <div className="text-[10px] text-muted-foreground">Deletions</div>
                      </div>
                      <div className="bg-background rounded px-2 py-1.5 text-center">
                        <div className="font-semibold text-sm">{totalFilesChanged}</div>
                        <div className="text-[10px] text-muted-foreground">Files Changed</div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Sessions detail */}
              {sessions.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="font-medium text-foreground mb-1.5 flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" /> Sessions ({sessions.length})
                    </p>
                    <div className="space-y-1.5">
                      {sessions.map((s) => {
                        // Hide trivial continuation prompts that aren't meaningful
                        const trivialPrompts = ['please continue', 'continue', 'go on', 'proceed', 'keep going', 'yes']
                        const promptText = s.firstUserPrompt?.trim()
                        const isTrivialPrompt = !promptText || trivialPrompts.includes(promptText.toLowerCase().replace(/[.!?,]+$/, ''))

                        return (
                          <div key={s.sessionId} className="bg-background rounded px-2 py-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-[10px]">{s.sessionId.slice(0, 8)}</span>
                              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                                {s.activeMinutes != null && <span>{fmtMin(s.activeMinutes)} active</span>}
                                {s.messageCount != null && <span>{s.messageCount} msgs</span>}
                                {s.userPromptCount != null && <span>{s.userPromptCount} prompts</span>}
                                {s.toolUseCount != null && <span>{s.toolUseCount} tools</span>}
                                {(s.hookEventCount ?? 0) > 0 && <span>{s.hookEventCount} hooks</span>}
                                {s.model && <span className="text-muted-foreground/60">{s.model.split('/').pop()}</span>}
                                {s.isMultiDay && <span className="text-amber-500">multi-day</span>}
                              </div>
                            </div>
                            {!isTrivialPrompt && (
                              <p className="text-muted-foreground mt-0.5 italic truncate">
                                &ldquo;{promptText}&rdquo;
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </>
              )}

              {/* Commits detail */}
              {commits.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="font-medium text-foreground mb-1.5 flex items-center gap-1">
                      <GitCommit className="h-3 w-3" /> Commits ({commits.length})
                    </p>
                    <div className="space-y-1">
                      {commits.map((c) => (
                        <div key={c.commitHash} className="bg-background rounded px-2 py-1.5 flex items-start gap-2">
                          <span className="font-mono text-[10px] text-muted-foreground flex-shrink-0 mt-0.5">
                            {c.commitHash.slice(0, 7)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-foreground break-words">{c.message ?? 'No message'}</p>
                            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                              <span className="text-green-600">+{c.insertions ?? 0}</span>
                              <span className="text-red-600">-{c.deletions ?? 0}</span>
                              <span>{c.filesChanged ?? 0} files</span>
                              {c.repoPath && <span className="truncate">{c.repoPath.split('/').pop()}</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
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

// ============================================================
// Enhancement Reassign Panel (shown on flagged post-impl entries)
// ============================================================

function EnhancementReassignPanel({
  entryId,
  enhancementReason,
  enhancements,
  onReassigned,
}: {
  entryId: string
  enhancementReason: string
  enhancements: EnhancementProject[]
  onReassigned: () => void
}) {
  const [selectedEnhancement, setSelectedEnhancement] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleReassign() {
    if (!selectedEnhancement) {
      toast.error('Select an enhancement project first')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/entries/${entryId}/reassign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enhancementProjectId: selectedEnhancement }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || 'Failed to reassign entry')
        return
      }
      toast.success('Entry reassigned to enhancement project')
      onReassigned()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-6 mb-0 p-3 bg-amber-50 border border-amber-200 rounded-md text-sm">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-amber-800">Enhancement Detected</p>
          <p className="text-amber-700 mt-1">{enhancementReason}</p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {enhancements.length > 0 ? (
              <>
                <Select value={selectedEnhancement} onValueChange={setSelectedEnhancement}>
                  <SelectTrigger className="w-[240px] h-8 text-xs">
                    <SelectValue placeholder="Move to Enhancement..." />
                  </SelectTrigger>
                  <SelectContent>
                    {enhancements.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.enhancementLabel ?? e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="default"
                  disabled={!selectedEnhancement || submitting}
                  onClick={handleReassign}
                  className="h-8 text-xs"
                >
                  {submitting ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <ArrowRight className="h-3 w-3 mr-1" />
                  )}
                  Move
                </Button>
              </>
            ) : (
              <p className="text-amber-600 text-xs">
                No enhancement projects available. Create one from the parent project page, or confirm this entry as maintenance.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// Post-Implementation Enhancement Panel
// (shown inline when developer selects capitalizable on post-impl project)
// ============================================================

function PostImplEnhancementPanel({
  entryId,
  projectId,
  projectName,
  enhancements,
  onReassigned,
}: {
  entryId: string
  projectId: string
  projectName: string
  enhancements: EnhancementProject[]
  onReassigned: () => void
}) {
  const [selectedEnhancement, setSelectedEnhancement] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [creating, setCreating] = useState(false)

  async function handleReassign() {
    if (!selectedEnhancement) {
      toast.error('Select an enhancement project first')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/entries/${entryId}/reassign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enhancementProjectId: selectedEnhancement }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || 'Failed to reassign entry')
        return
      }
      toast.success('Entry moved to enhancement project')
      onReassigned()
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCreateAndReassign() {
    if (!newLabel.trim()) {
      toast.error('Please provide an enhancement label')
      return
    }
    setCreating(true)
    try {
      // 1. Create the enhancement project
      const createRes = await fetch(`/api/projects/${projectId}/enhancements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enhancementLabel: newLabel,
          description: newDescription || null,
        }),
      })
      if (!createRes.ok) {
        const err = await createRes.json()
        toast.error(err.error || 'Failed to create enhancement project')
        return
      }
      const newProject = await createRes.json()

      // 2. Reassign this entry to the new enhancement
      const reassignRes = await fetch(`/api/entries/${entryId}/reassign`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enhancementProjectId: newProject.id }),
      })
      if (!reassignRes.ok) {
        const err = await reassignRes.json()
        toast.error(err.error || 'Enhancement created but entry reassignment failed')
        return
      }

      toast.success(`Enhancement "${newProject.name}" created and entry moved`)
      onReassigned()
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-md text-xs">
      <p className="font-medium text-amber-800 mb-1">
        New feature work on a post-implementation project?
      </p>
      <p className="text-amber-700 mb-2">
        Under ASC 350-40, new development must be tracked as a separate enhancement project.
        Select an existing one or create a new one to move this entry.
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        {enhancements.length > 0 && (
          <>
            <Select value={selectedEnhancement} onValueChange={setSelectedEnhancement}>
              <SelectTrigger className="w-[220px] h-7 text-xs">
                <SelectValue placeholder="Select enhancement..." />
              </SelectTrigger>
              <SelectContent>
                {enhancements.map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.enhancementLabel ?? e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="default"
              disabled={!selectedEnhancement || submitting}
              onClick={handleReassign}
              className="h-7 text-xs"
            >
              {submitting ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <ArrowRight className="h-3 w-3 mr-1" />
              )}
              Move
            </Button>
          </>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowCreate(!showCreate)}
          className="h-7 text-xs"
        >
          <Plus className="h-3 w-3 mr-1" />
          New Enhancement
        </Button>
      </div>

      {showCreate && (
        <div className="mt-3 p-2 bg-white rounded border space-y-2">
          <div className="space-y-1">
            <Label className="text-xs">Enhancement Label</Label>
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g., Phase 2 - New Integrations"
              className="h-7 text-xs"
            />
            <p className="text-[10px] text-muted-foreground">
              Creates: &quot;{projectName} - {newLabel || '...'}&quot;
            </p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Description (optional)</Label>
            <Input
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Describe the new development work..."
              className="h-7 text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={!newLabel.trim() || creating}
              onClick={handleCreateAndReassign}
              className="h-7 text-xs"
            >
              {creating ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Plus className="h-3 w-3 mr-1" />
              )}
              Create & Move Entry
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShowCreate(false)}
              className="h-7 text-xs"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
