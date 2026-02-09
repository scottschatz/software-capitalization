'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { EntryCard } from '@/components/review/entry-card'
import { ConfirmAllButton } from '@/components/review/confirm-all-button'
import { ManualEntryDialog } from '@/components/review/manual-entry-dialog'
import { AdjustmentFactorInline } from '@/components/review/adjustment-factor-inline'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  CheckCircle,
  ChevronRight,
  Clock,
  Calendar,
  Loader2,
  ChevronsUpDown,
  ChevronsDownUp,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'

export interface EnhancementProject {
  id: string
  name: string
  enhancementLabel: string | null
  enhancementNumber: number | null
  phase: string
}

interface Project {
  id: string
  name: string
  phase: string
  parentProjectId?: string | null
  managementAuthorized?: boolean
  probableToComplete?: boolean
  authorizationDate?: string | null
  enhancementProjects?: EnhancementProject[]
}

interface SourceSession {
  sessionId: string
  projectPath?: string
  durationMinutes?: number | null
  activeMinutes?: number | null
  messageCount?: number
  toolUseCount?: number
  userPromptCount?: number | null
  firstUserPrompt?: string | null
  model?: string | null
  hookEventCount?: number
  isMultiDay?: boolean
}

interface SourceCommit {
  commitHash: string
  repoPath?: string
  message?: string
  filesChanged?: number
  insertions?: number
  deletions?: number
  committedAt?: string
}

export interface SerializedEntry {
  id: string
  date: string // ISO string
  hoursEstimated: number | null
  hoursRaw: number | null
  adjustmentFactor: number | null
  phaseAuto: string | null
  descriptionAuto: string | null
  hoursConfirmed: number | null
  phaseConfirmed: string | null
  descriptionConfirmed: string | null
  confirmedAt: string | null
  adjustmentReason: string | null
  modelUsed: string | null
  modelFallback: boolean
  workType: string | null
  confidenceScore: number | null
  outlierFlag: string | null
  developerNote: string | null
  status: string
  sourceSessionIds: string[]
  sourceCommitIds: string[]
  project: Project | null
  sourceSessions?: SourceSession[]
  sourceCommits?: SourceCommit[]
}

interface SerializedManualEntry {
  id: string
  date: string
  hours: number
  phase: string
  description: string
  project: Project | null
  status: string
}

interface DayGroup {
  dateStr: string
  dateLabel: string
  entries: SerializedEntry[]
  manualEntries: SerializedManualEntry[]
  totalHours: number
  capHours: number
  pendingCount: number
  confirmedCount: number
}

interface ReviewPageClientProps {
  entries: SerializedEntry[]
  manualEntries: SerializedManualEntry[]
  projects: Project[]
  showAll: boolean
  availableMonths: string[]
  adjustmentFactor?: number
}

function formatMonthLabel(monthStr: string): string {
  const d = parseISO(monthStr + '-01')
  return format(d, 'MMMM yyyy')
}

export function ReviewPageClient({
  entries,
  manualEntries,
  projects,
  showAll: initialShowAll,
  availableMonths,
  adjustmentFactor: _adjustmentFactor,
}: ReviewPageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [showAll, setShowAll] = useState(initialShowAll)
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())
  const [confirmingAll, setConfirmingAll] = useState(false)
  const [showConfirmAllDialog, setShowConfirmAllDialog] = useState(false)
  const [initialLoad, setInitialLoad] = useState(true)

  // Determine active filter from URL
  const currentMonth = searchParams.get('month') ?? ''
  const currentDays = searchParams.get('days') ?? ''
  // Unified range value: "month:2026-01", "7", "14", "30", or "all"
  const currentRange = currentMonth
    ? `month:${currentMonth}`
    : currentDays || 'all'

  // Group entries by date
  const dayGroups = useMemo(() => {
    const grouped = new Map<string, { entries: SerializedEntry[]; manual: SerializedManualEntry[] }>()

    for (const entry of entries) {
      const dateStr = entry.date.slice(0, 10)
      if (!grouped.has(dateStr)) grouped.set(dateStr, { entries: [], manual: [] })
      grouped.get(dateStr)!.entries.push(entry)
    }
    for (const me of manualEntries) {
      const dateStr = me.date.slice(0, 10)
      if (!grouped.has(dateStr)) grouped.set(dateStr, { entries: [], manual: [] })
      grouped.get(dateStr)!.manual.push(me)
    }

    const days: DayGroup[] = [...grouped.entries()]
      .sort(([a], [b]) => b.localeCompare(a)) // newest first
      .map(([dateStr, { entries: dayEntries, manual }]) => {
        const pendingCount = dayEntries.filter((e) => e.status === 'pending').length
        const confirmedCount = dayEntries.filter((e) => e.status === 'confirmed').length
        const totalHours = dayEntries.reduce(
          (sum, e) => sum + (e.hoursConfirmed ?? e.hoursEstimated ?? 0),
          0
        ) + manual.reduce((sum, m) => sum + m.hours, 0)
        const capHours = dayEntries
          .filter((e) => (e.phaseConfirmed ?? e.phaseAuto) === 'application_development')
          .reduce((sum, e) => sum + (e.hoursConfirmed ?? e.hoursEstimated ?? 0), 0)
          + manual
            .filter((m) => m.phase === 'application_development')
            .reduce((sum, m) => sum + m.hours, 0)

        return {
          dateStr,
          dateLabel: format(parseISO(dateStr), 'EEEE, MMMM d, yyyy'),
          entries: dayEntries,
          manualEntries: manual,
          totalHours,
          capHours,
          pendingCount,
          confirmedCount,
        }
      })

    // Auto-expand days with pending entries on initial load (limit to 3 most recent to reduce lag)
    if (initialLoad && days.length > 0) {
      const pendingDayStrs = days.filter((d) => d.pendingCount > 0).map((d) => d.dateStr)
      const autoExpand = new Set(pendingDayStrs.slice(0, 3))
      // If no pending days but showing all, expand the first day
      if (autoExpand.size === 0 && days.length > 0) autoExpand.add(days[0].dateStr)
      setExpandedDays(autoExpand)
      setInitialLoad(false)
    }

    return days
  }, [entries, manualEntries, initialLoad])

  // Aggregate stats
  const totalPending = dayGroups.reduce((sum, d) => sum + d.pendingCount, 0)
  const totalConfirmed = dayGroups.reduce((sum, d) => sum + d.confirmedCount, 0)
  const totalHoursAll = dayGroups.reduce((sum, d) => sum + d.totalHours, 0)
  const totalCapHours = dayGroups.reduce((sum, d) => sum + d.capHours, 0)
  const totalExpHours = totalHoursAll - totalCapHours
  const pendingDates = dayGroups.filter((d) => d.pendingCount > 0).map((d) => d.dateStr)
  const allDates = dayGroups.map((d) => d.dateStr)

  function toggleDay(dateStr: string) {
    setExpandedDays((prev) => {
      const next = new Set(prev)
      if (next.has(dateStr)) next.delete(dateStr)
      else next.add(dateStr)
      return next
    })
  }

  const expandAll = useCallback(() => {
    setExpandedDays(new Set(allDates))
  }, [allDates])

  const collapseAll = useCallback(() => {
    setExpandedDays(new Set())
  }, [])

  const allExpanded = expandedDays.size === dayGroups.length && dayGroups.length > 0
  const noneExpanded = expandedDays.size === 0

  function buildUrl(updates: { show?: string | null; days?: string | null; month?: string | null }) {
    const p = new URLSearchParams(searchParams.toString())
    if (updates.show !== undefined) {
      if (updates.show) p.set('show', updates.show)
      else p.delete('show')
    }
    if (updates.days !== undefined) {
      if (updates.days) p.set('days', updates.days)
      else p.delete('days')
    }
    if (updates.month !== undefined) {
      if (updates.month) p.set('month', updates.month)
      else p.delete('month')
    }
    const qs = p.toString()
    return `/review${qs ? `?${qs}` : ''}`
  }

  function handleToggleView(checked: boolean) {
    setShowAll(checked)
    setInitialLoad(true)
    router.push(buildUrl({ show: checked ? 'all' : null }))
  }

  function handleRangeChange(value: string) {
    setInitialLoad(true)
    if (value.startsWith('month:')) {
      const month = value.slice(6)
      router.push(buildUrl({ month, days: null }))
    } else if (value === 'all') {
      router.push(buildUrl({ days: null, month: null }))
    } else {
      router.push(buildUrl({ days: value, month: null }))
    }
  }

  async function handleConfirmAllRange() {
    if (pendingDates.length === 0) return
    setConfirmingAll(true)
    try {
      const res = await fetch('/api/entries/confirm-all-range', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dates: pendingDates }),
      })
      if (!res.ok) {
        toast.error('Failed to confirm entries')
        return
      }
      const result = await res.json()
      toast.success(`${result.confirmed} entries confirmed across ${pendingDates.length} days`)
      router.refresh()
    } finally {
      setConfirmingAll(false)
    }
  }

  // Build description of current filter for stats header
  const filterLabel = !showAll
    ? 'Pending entries'
    : currentMonth
      ? formatMonthLabel(currentMonth)
      : currentDays
        ? `Last ${currentDays} days`
        : 'All time'

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Review Hours</h1>
          <p className="text-sm text-muted-foreground">
            Review and confirm your development hours for software capitalization.
          </p>
        </div>
        <div className="flex items-center gap-4">
          {showAll && (
            <Select value={currentRange} onValueChange={handleRangeChange}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue placeholder="Date range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">Last 3 days</SelectItem>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="14">Last 14 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="all">All time</SelectItem>
                {availableMonths.length > 0 && (
                  <>
                    <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-t mt-1 pt-1.5">
                      By Month
                    </div>
                    {availableMonths.map((m) => (
                      <SelectItem key={m} value={`month:${m}`}>
                        {formatMonthLabel(m)}
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
          )}
          <div className="flex items-center gap-2">
            <Label htmlFor="show-all" className="text-sm cursor-pointer">
              Show history
            </Label>
            <Switch
              id="show-all"
              checked={showAll}
              onCheckedChange={handleToggleView}
            />
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div>
        <div className="text-xs text-muted-foreground mb-2">{filterLabel}</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold flex items-center justify-center gap-1">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                {dayGroups.length}
              </div>
              <div className="text-xs text-muted-foreground">Days</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold flex items-center justify-center gap-1">
                <Clock className="h-5 w-5 text-muted-foreground" />
                {totalHoursAll.toFixed(1)}h
              </div>
              <div className="text-xs text-muted-foreground">Total Hours</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold text-green-600">{totalCapHours.toFixed(1)}h</div>
              <div className="text-xs text-muted-foreground">Capitalizable</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold text-muted-foreground">{totalExpHours.toFixed(1)}h</div>
              <div className="text-xs text-muted-foreground">Expensed</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl font-bold text-amber-600">{totalPending}</div>
              <div className="text-xs text-muted-foreground">Pending</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Adjustment factor */}
      {_adjustmentFactor != null && (
        <AdjustmentFactorInline initialFactor={_adjustmentFactor} />
      )}

      {/* Toolbar: confirm all + expand/collapse */}
      {dayGroups.length > 0 && (
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            {totalPending > 0 && (
              <Button
                onClick={() => setShowConfirmAllDialog(true)}
                disabled={confirmingAll}
              >
                {confirmingAll ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-1" />
                )}
                {confirmingAll
                  ? 'Confirming...'
                  : `Confirm All Pending (${totalPending})`}
              </Button>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={expandAll}
              disabled={allExpanded}
              className="text-xs"
            >
              <ChevronsUpDown className="h-3.5 w-3.5 mr-1" />
              Expand All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={collapseAll}
              disabled={noneExpanded}
              className="text-xs"
            >
              <ChevronsDownUp className="h-3.5 w-3.5 mr-1" />
              Collapse All
            </Button>
          </div>
        </div>
      )}

      {/* Day accordions */}
      {dayGroups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold">All caught up!</h3>
            <p className="text-muted-foreground mt-1">
              {showAll
                ? 'No entries found for this period.'
                : 'No pending entries to review. Toggle "Show history" to see past entries.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {dayGroups.map((day) => {
            const isExpanded = expandedDays.has(day.dateStr)
            const allConfirmed = day.pendingCount === 0

            return (
              <div key={day.dateStr} className="rounded-lg border overflow-hidden">
                {/* Day header */}
                <button
                  onClick={() => toggleDay(day.dateStr)}
                  className={`w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                    allConfirmed ? 'bg-green-50/30' : 'bg-muted/20'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <ChevronRight
                      className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    />
                    <div>
                      <span className="font-semibold text-sm">{day.dateLabel}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        {day.entries.length + day.manualEntries.length} entries
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{day.totalHours.toFixed(1)}h</span>
                    <span className="text-xs text-green-600">{day.capHours.toFixed(1)}h cap</span>
                    {day.totalHours - day.capHours > 0 && (
                      <span className="text-xs text-muted-foreground">{(day.totalHours - day.capHours).toFixed(1)}h exp</span>
                    )}
                    {allConfirmed ? (
                      <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">
                        <CheckCircle className="h-3 w-3 mr-1" />
                        Confirmed
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-amber-600 text-xs">
                        {day.pendingCount} pending
                      </Badge>
                    )}
                  </div>
                </button>

                {/* Day body */}
                {isExpanded && (
                  <div className="border-t px-4 py-4 space-y-4">
                    {/* Per-day actions */}
                    <div className="flex items-center gap-2">
                      {day.pendingCount > 0 && (
                        <ConfirmAllButton
                          date={day.dateStr}
                          pendingCount={day.pendingCount}
                          onConfirmed={() => router.refresh()}
                        />
                      )}
                      <ManualEntryDialog date={day.dateStr} projects={projects} />
                    </div>

                    {/* Enhancement reassignment banner for flagged post-impl entries */}
                    {(() => {
                      const flaggedByProject = new Map<string, SerializedEntry[]>()
                      for (const entry of day.entries) {
                        if (entry.status === 'flagged' && entry.descriptionAuto?.includes('Enhancement Suggested') && entry.project) {
                          const list = flaggedByProject.get(entry.project.id) ?? []
                          list.push(entry)
                          flaggedByProject.set(entry.project.id, list)
                        }
                      }
                      return [...flaggedByProject.entries()].map(([projId, flaggedEntries]) => {
                        const proj = flaggedEntries[0].project!
                        const parentProject = projects.find((p) => p.id === projId)
                        const enhancements = parentProject?.enhancementProjects?.filter((e) => e.phase === 'application_development') ?? []
                        if (flaggedEntries.length < 2) return null
                        return (
                          <BulkReassignBanner
                            key={`bulk-${projId}`}
                            projectName={proj.name}
                            entries={flaggedEntries}
                            enhancements={enhancements}
                            onReassigned={() => router.refresh()}
                          />
                        )
                      })
                    })()}

                    {/* Entry cards */}
                    {day.entries.map((entry) => {
                      // Find enhancement projects for this entry's parent project
                      const parentProject = projects.find((p) => p.id === entry.project?.id)
                      const enhancements = parentProject?.enhancementProjects?.filter((e) => e.phase === 'application_development') ?? []
                      return (
                        <EntryCard
                          key={entry.id}
                          entry={entry}
                          projects={projects}
                          enhancements={enhancements}
                          onConfirmed={() => router.refresh()}
                        />
                      )
                    })}

                    {/* Manual entries */}
                    {day.manualEntries.length > 0 && (
                      <>
                        <h4 className="text-xs font-medium text-muted-foreground mt-2">
                          Manual Entries
                        </h4>
                        {day.manualEntries.map((me) => (
                          <Card key={me.id} className="border-blue-200">
                            <CardContent className="pt-4 pb-3">
                              <div className="flex items-center justify-between">
                                <span className="font-medium text-sm">{me.project?.name}</span>
                                <div className="flex items-center gap-2">
                                  {me.status === 'pending_approval' && (
                                    <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-xs">Pending Approval</Badge>
                                  )}
                                  {me.status === 'approved' && (
                                    <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">Approved</Badge>
                                  )}
                                  {me.status === 'confirmed' && (
                                    <Badge variant="secondary" className="text-xs">Confirmed</Badge>
                                  )}
                                  {me.status === 'rejected' && (
                                    <Badge className="bg-red-100 text-red-800 border-red-200 text-xs">Rejected</Badge>
                                  )}
                                  <Badge variant="outline" className="text-xs">
                                    {me.phase === 'application_development'
                                      ? 'App Dev'
                                      : me.phase === 'preliminary'
                                        ? 'Preliminary'
                                        : 'Post-Impl'}
                                  </Badge>
                                  <span className="text-sm font-semibold">{me.hours}h</span>
                                </div>
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">{me.description}</p>
                            </CardContent>
                          </Card>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Confirm All Pending dialog */}
      <Dialog open={showConfirmAllDialog} onOpenChange={setShowConfirmAllDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm All {totalPending} Pending Entries?</DialogTitle>
            <DialogDescription>
              This will accept AI-suggested values for all pending entries across{' '}
              {pendingDates.length} day{pendingDates.length !== 1 ? 's' : ''}. Bulk-confirmed
              entries are marked as &quot;bulk_range&quot; in the audit trail.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmAllDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowConfirmAllDialog(false)
                handleConfirmAllRange()
              }}
            >
              <CheckCircle className="h-4 w-4 mr-1" />
              Confirm All
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ASC 350-40 methodology explanation */}
      <details className="text-sm mt-6">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-medium">
          How are hours estimated? (Methodology)
        </summary>
        <div className="mt-2 space-y-2 text-muted-foreground pl-4 border-l-2">
          <p>
            <strong>Active Time Calculation:</strong> AI estimates are based on gap-aware active
            time from your Claude Code sessions. Only intervals where the gap between messages is
            less than 15 minutes are counted as active work. Gaps exceeding 15 minutes are treated
            as breaks or idle time and excluded. This prevents wall-clock time from inflating
            capitalizable hours.
          </p>
          <p>
            <strong>Adjustment Factor:</strong> A per-developer multiplier (default 100%) is
            applied to the AI&apos;s raw estimate. Factors above 125% require manager/admin
            authorization. The maximum is 150%. Both the raw estimate and factor are stored for
            audit purposes.
          </p>
          <p>
            <strong>Confirmation & Audit Trail:</strong> Every entry must be reviewed and confirmed
            by the developer. Changes exceeding 20% from the AI estimate require a written
            justification. All modifications are logged in the revision history with old/new values,
            who changed it, and when.
          </p>
          <p>
            <strong>Phase Classification:</strong> Under ASC 350-40, only hours in the{' '}
            <strong>Application Development</strong> phase are capitalizable. Phase is determined by
            the project&apos;s current lifecycle stage, not by the AI. Phase transitions require
            admin/manager approval. ASU 2025-06 additionally requires documented management
            authorization before capitalization can begin.
          </p>
        </div>
      </details>
    </div>
  )
}

// ============================================================
// Bulk Reassignment Banner
// ============================================================

function BulkReassignBanner({
  projectName,
  entries,
  enhancements,
  onReassigned,
}: {
  projectName: string
  entries: SerializedEntry[]
  enhancements: EnhancementProject[]
  onReassigned: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [selectedEnhancement, setSelectedEnhancement] = useState('')

  async function handleBulkReassign() {
    if (!selectedEnhancement) {
      toast.error('Select an enhancement project first')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/entries/reassign-bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryIds: entries.map((e) => e.id),
          enhancementProjectId: selectedEnhancement,
        }),
      })
      if (!res.ok) {
        const err = await res.json()
        toast.error(err.error || 'Failed to reassign entries')
        return
      }
      const result = await res.json()
      toast.success(`${result.reassigned} entries reassigned to enhancement project`)
      onReassigned()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-800">
            {entries.length} entries flagged for enhancement review
          </p>
          <p className="text-xs text-amber-700 mt-0.5">
            Project &ldquo;{projectName}&rdquo; moved to post-implementation.
          </p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {enhancements.length > 0 ? (
              <>
                <Select value={selectedEnhancement} onValueChange={setSelectedEnhancement}>
                  <SelectTrigger className="w-[260px] h-8 text-xs">
                    <SelectValue placeholder="Select enhancement project..." />
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
                  onClick={handleBulkReassign}
                  className="h-8 text-xs"
                >
                  {submitting ? (
                    <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  ) : (
                    <ArrowRight className="h-3 w-3 mr-1" />
                  )}
                  Reassign All ({entries.length})
                </Button>
              </>
            ) : (
              <p className="text-xs text-amber-600">
                No enhancement projects available. Create one from the parent project page first.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
