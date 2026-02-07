'use client'

import { useState, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { EntryCard } from '@/components/review/entry-card'
import { ConfirmAllButton } from '@/components/review/confirm-all-button'
import { ManualEntryDialog } from '@/components/review/manual-entry-dialog'
import { toast } from 'sonner'
import {
  CheckCircle,
  ChevronRight,
  Clock,
  Calendar,
  Loader2,
} from 'lucide-react'
import { format, parseISO } from 'date-fns'

interface Project {
  id: string
  name: string
  phase: string
}

interface SerializedEntry {
  id: string
  date: string // ISO string
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

interface SerializedManualEntry {
  id: string
  date: string
  hours: number
  phase: string
  description: string
  project: Project | null
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
}

export function ReviewPageClient({
  entries,
  manualEntries,
  projects,
  showAll: initialShowAll,
}: ReviewPageClientProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [showAll, setShowAll] = useState(initialShowAll)
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set())
  const [confirmingAll, setConfirmingAll] = useState(false)
  const [initialLoad, setInitialLoad] = useState(true)

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

    // Auto-expand days with pending entries on initial load
    if (initialLoad && days.length > 0) {
      const pendingDays = new Set(days.filter((d) => d.pendingCount > 0).map((d) => d.dateStr))
      // If no pending days but showing all, expand the first day
      if (pendingDays.size === 0 && days.length > 0) pendingDays.add(days[0].dateStr)
      setExpandedDays(pendingDays)
      setInitialLoad(false)
    }

    return days
  }, [entries, manualEntries, initialLoad])

  // Aggregate stats
  const totalPending = dayGroups.reduce((sum, d) => sum + d.pendingCount, 0)
  const totalConfirmed = dayGroups.reduce((sum, d) => sum + d.confirmedCount, 0)
  const totalHoursAll = dayGroups.reduce((sum, d) => sum + d.totalHours, 0)
  const totalCapHours = dayGroups.reduce((sum, d) => sum + d.capHours, 0)
  const pendingDates = dayGroups.filter((d) => d.pendingCount > 0).map((d) => d.dateStr)

  function toggleDay(dateStr: string) {
    setExpandedDays((prev) => {
      const next = new Set(prev)
      if (next.has(dateStr)) next.delete(dateStr)
      else next.add(dateStr)
      return next
    })
  }

  function handleToggleView(checked: boolean) {
    setShowAll(checked)
    setInitialLoad(true)
    const params = new URLSearchParams(searchParams.toString())
    if (checked) {
      params.set('show', 'all')
    } else {
      params.delete('show')
    }
    router.push(`/review?${params.toString()}`)
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
        <div className="flex items-center gap-2">
          <Label htmlFor="show-all" className="text-sm cursor-pointer">
            Show confirmed
          </Label>
          <Switch
            id="show-all"
            checked={showAll}
            onCheckedChange={handleToggleView}
          />
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
            <div className="text-2xl font-bold text-amber-600">{totalPending}</div>
            <div className="text-xs text-muted-foreground">Pending</div>
          </CardContent>
        </Card>
      </div>

      {/* Global confirm all */}
      {totalPending > 0 && (
        <div className="flex items-center gap-2">
          <Button
            onClick={handleConfirmAllRange}
            disabled={confirmingAll}
          >
            {confirmingAll ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4 mr-1" />
            )}
            {confirmingAll
              ? 'Confirming...'
              : `Confirm All Pending (${totalPending} across ${pendingDates.length} days)`}
          </Button>
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
                : 'No pending entries to review. Toggle "Show confirmed" to see past entries.'}
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
                    {day.pendingCount > 0 && (
                      <div className="flex items-center gap-2">
                        <ConfirmAllButton date={day.dateStr} pendingCount={day.pendingCount} />
                        <ManualEntryDialog date={day.dateStr} projects={projects} />
                      </div>
                    )}
                    {day.pendingCount === 0 && (
                      <div className="flex items-center gap-2">
                        <ManualEntryDialog date={day.dateStr} projects={projects} />
                      </div>
                    )}

                    {/* Entry cards */}
                    {day.entries.map((entry) => (
                      <EntryCard
                        key={entry.id}
                        entry={entry}
                        projects={projects}
                      />
                    ))}

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
    </div>
  )
}
