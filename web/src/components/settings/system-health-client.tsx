'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

// --- Types ---

interface ModelHealthData {
  config: {
    localModel: string
    localUrl: string
    localEnabled: boolean
    fallbackModel: string
    localReachable: boolean
  }
  stats: {
    period: string
    totalCalls: number
    successCount: number
    fallbackCount: number
    retryCount: number
    successRate: number | null
    avgLatencyMs: number | null
    consecutiveFallbacks: number
    fallbackDates: string[]
  }
  entryModelStats: Array<{
    model: string | null
    fallback: boolean
    count: number
  }>
  recentEvents: Array<{
    id: string
    timestamp: string
    eventType: string
    modelAttempted: string
    modelUsed: string | null
    targetDate: string | null
    errorMessage: string | null
    attempt: number | null
    latencyMs: number | null
    prompt: string
  }>
}

interface DevDayRow {
  developerId: string
  displayName: string
  sessions: number
  commits: number
  entries: number
  pending: number
  hasRawData: boolean
  hasEntries: boolean
  syncComplete: boolean
}

interface PipelineStatusData {
  dailyStatus: Array<{
    date: string
    totalSessions: number
    totalCommits: number
    totalEntries: number
    totalPending: number
    devsWithRawData: number
    devsWithEntries: number
    allSyncsComplete: boolean
    dayIsComplete: boolean
    canGenerate: boolean
    developers: DevDayRow[]
  }>
  agentStatus: Array<{
    developerId: string
    email: string
    displayName: string
    agents: Array<{
      name: string
      hostname: string | null
      version: string | null
      lastReportedAt: string | null
    }>
    lastSync: {
      completedAt: string
      sessionsCount: number | null
      commitsCount: number | null
    } | null
  }>
}

// --- Main Component ---

export function SystemHealthClient() {
  const [modelData, setModelData] = useState<ModelHealthData | null>(null)
  const [pipelineData, setPipelineData] = useState<PipelineStatusData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState<string | null>(null) // date being generated
  const [generateResult, setGenerateResult] = useState<{ date: string; message: string } | null>(null)
  const [bulkFrom, setBulkFrom] = useState('')
  const [bulkTo, setBulkTo] = useState('')
  const [bulkGenerating, setBulkGenerating] = useState(false)
  const [bulkResult, setBulkResult] = useState<{ message: string; isError: boolean } | null>(null)

  const fetchData = useCallback(() => {
    Promise.all([
      fetch('/api/admin/model-health').then(r => {
        if (!r.ok) throw new Error(`Model health: HTTP ${r.status}`)
        return r.json()
      }),
      fetch('/api/admin/pipeline-status').then(r => {
        if (!r.ok) throw new Error(`Pipeline status: HTTP ${r.status}`)
        return r.json()
      }),
    ])
      .then(([model, pipeline]) => {
        setModelData(model)
        setPipelineData(pipeline)
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const handleGenerate = async (date: string) => {
    setGenerating(date)
    setGenerateResult(null)
    try {
      const res = await fetch('/api/entries/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const result = await res.json()
      setGenerateResult({
        date,
        message: `Created ${result.entriesCreated} entries for ${result.developers} developer(s)`,
      })
      // Refresh pipeline data to reflect new entries
      fetch('/api/admin/pipeline-status')
        .then(r => r.json())
        .then(setPipelineData)
        .catch(() => {})
    } catch (e) {
      setGenerateResult({
        date,
        message: `Error: ${e instanceof Error ? e.message : 'Unknown error'}`,
      })
    } finally {
      setGenerating(null)
    }
  }

  const handleBulkGenerate = async () => {
    if (!bulkFrom || !bulkTo) return
    setBulkGenerating(true)
    setBulkResult(null)
    try {
      const res = await fetch('/api/entries/generate-range', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: bulkFrom, to: bulkTo }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }
      const result = await res.json()
      setBulkResult({
        message: `Generated ${result.totalEntriesCreated} entries across ${result.daysProcessed} days${result.totalErrors > 0 ? ` (${result.totalErrors} errors)` : ''}`,
        isError: false,
      })
      // Refresh pipeline data
      fetch('/api/admin/pipeline-status')
        .then(r => r.json())
        .then(setPipelineData)
        .catch(() => {})
    } catch (e) {
      setBulkResult({
        message: `Error: ${e instanceof Error ? e.message : 'Unknown error'}`,
        isError: true,
      })
    } finally {
      setBulkGenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold">System Health</h1>
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (error || !modelData) {
    return (
      <div className="space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold">System Health</h1>
          <p className="text-sm text-destructive">Error: {error ?? 'Unknown'}</p>
        </div>
      </div>
    )
  }

  const { config, stats, entryModelStats, recentEvents } = modelData

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">System Health</h1>
        <p className="text-sm text-muted-foreground">
          Pipeline status, agent sync health, and AI model diagnostics.
        </p>
      </div>

      {/* Generate result banner */}
      {generateResult && (
        <div className={`rounded-lg border p-3 text-sm ${
          generateResult.message.startsWith('Error')
            ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
            : 'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200'
        }`}>
          <strong>{generateResult.date}:</strong> {generateResult.message}
        </div>
      )}

      {/* Section 1: Agent Sync Status */}
      {pipelineData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Agent Sync Status</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Developer</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Last Sync</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                  <TableHead className="text-right">Commits</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pipelineData.agentStatus.map((dev) => {
                  const syncAge = dev.lastSync
                    ? (Date.now() - new Date(dev.lastSync.completedAt).getTime()) / (1000 * 60 * 60)
                    : null
                  const agentName = dev.agents[0]?.name ?? 'No agent'
                  const hostname = dev.agents[0]?.hostname
                  const version = dev.agents[0]?.version

                  return (
                    <TableRow key={dev.developerId}>
                      <TableCell className="font-medium">{dev.displayName}</TableCell>
                      <TableCell className="text-sm">
                        {agentName}
                        {hostname && <span className="text-muted-foreground ml-1">({hostname})</span>}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{version ?? '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {dev.lastSync
                          ? formatTimeAgo(dev.lastSync.completedAt)
                          : <span className="text-muted-foreground">Never</span>
                        }
                      </TableCell>
                      <TableCell className="text-right">{dev.lastSync?.sessionsCount ?? '-'}</TableCell>
                      <TableCell className="text-right">{dev.lastSync?.commitsCount ?? '-'}</TableCell>
                      <TableCell>
                        <SyncStatusDot hours={syncAge} />
                      </TableCell>
                    </TableRow>
                  )
                })}
                {pipelineData.agentStatus.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No active developers
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Section 2: Daily Generation Pipeline */}
      {pipelineData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Daily Generation Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date / Developer</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                  <TableHead className="text-right">Commits</TableHead>
                  <TableHead>Synced</TableHead>
                  <TableHead>Generated</TableHead>
                  <TableHead className="text-right">Pending</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pipelineData.dailyStatus.map((day) => {
                  const hasActivity = day.totalSessions > 0 || day.totalCommits > 0 || day.totalEntries > 0
                  if (!hasActivity) {
                    return (
                      <TableRow key={day.date} className="bg-muted/10">
                        <TableCell className="font-mono text-sm font-semibold">{day.date}</TableCell>
                        <TableCell className="text-right text-muted-foreground">-</TableCell>
                        <TableCell className="text-right text-muted-foreground">-</TableCell>
                        <TableCell><span className="text-muted-foreground text-xs">No data</span></TableCell>
                        <TableCell><span className="text-muted-foreground text-xs">-</span></TableCell>
                        <TableCell className="text-right text-muted-foreground">-</TableCell>
                        <TableCell />
                      </TableRow>
                    )
                  }

                  const showDevRows = day.developers.length > 1

                  return (
                    <React.Fragment key={day.date}>
                      {/* Date summary row */}
                      <TableRow className={day.canGenerate ? 'bg-amber-50/50 dark:bg-amber-950/20' : 'bg-muted/10'}>
                        <TableCell className="font-mono text-sm font-semibold">
                          {day.date}
                          {showDevRows ? (
                            <span className="text-xs text-muted-foreground font-normal ml-2">
                              ({day.developers.length} developers)
                            </span>
                          ) : day.developers.length === 1 && (
                            <span className="text-xs text-muted-foreground font-normal ml-2">
                              {day.developers[0].displayName}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">{day.totalSessions || '-'}</TableCell>
                        <TableCell className="text-right font-medium">{day.totalCommits || '-'}</TableCell>
                        <TableCell>
                          {day.allSyncsComplete ? (
                            <Badge className="bg-green-100 text-green-800 border-green-200">Complete</Badge>
                          ) : !day.dayIsComplete ? (
                            <Badge className="bg-blue-100 text-blue-800 border-blue-200">In progress</Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200">Waiting</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {day.devsWithRawData === 0 ? (
                            <span className="text-muted-foreground text-xs">-</span>
                          ) : day.devsWithEntries >= day.devsWithRawData ? (
                            <Badge className="bg-green-100 text-green-800 border-green-200">
                              Yes{day.devsWithRawData > 1 ? ` (${day.devsWithEntries}/${day.devsWithRawData})` : ''}
                            </Badge>
                          ) : day.devsWithEntries > 0 ? (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                              Partial ({day.devsWithEntries}/{day.devsWithRawData})
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200">No</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {day.totalPending > 0 ? (
                            <span className="text-amber-700 dark:text-amber-400 font-medium">{day.totalPending}</span>
                          ) : day.totalEntries > 0 ? (
                            <span className="text-green-700 dark:text-green-400">0</span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {day.canGenerate ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={generating !== null}
                              onClick={() => handleGenerate(day.date)}
                            >
                              {generating === day.date ? 'Generating...' : 'Generate'}
                            </Button>
                          ) : !day.dayIsComplete ? (
                            <span className="text-xs text-muted-foreground">Day not ended</span>
                          ) : !day.allSyncsComplete && day.devsWithRawData > day.devsWithEntries ? (
                            <span className="text-xs text-muted-foreground">Awaiting sync</span>
                          ) : null}
                        </TableCell>
                      </TableRow>

                      {/* Per-developer rows (when multiple developers) */}
                      {showDevRows && day.developers.map((dev) => (
                        <TableRow key={`${day.date}-${dev.developerId}`} className="text-xs">
                          <TableCell className="pl-8 text-muted-foreground">{dev.displayName}</TableCell>
                          <TableCell className="text-right">{dev.sessions || '-'}</TableCell>
                          <TableCell className="text-right">{dev.commits || '-'}</TableCell>
                          <TableCell>
                            {dev.syncComplete ? (
                              <span className="inline-flex items-center gap-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                                <span className="text-green-700 dark:text-green-400">Yes</span>
                              </span>
                            ) : dev.hasRawData ? (
                              <span className="inline-flex items-center gap-1">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                <span className="text-amber-700 dark:text-amber-400">No</span>
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {dev.hasEntries ? (
                              <span className="text-green-700 dark:text-green-400">{dev.entries} entries</span>
                            ) : dev.hasRawData ? (
                              <span className="text-muted-foreground">-</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {dev.pending > 0 ? (
                              <span className="text-amber-700 dark:text-amber-400">{dev.pending}</span>
                            ) : dev.entries > 0 ? (
                              <span className="text-green-700 dark:text-green-400">0</span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell />
                        </TableRow>
                      ))}
                    </React.Fragment>
                  )
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Bulk Generate */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Bulk Generate Entries</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Generate AI-summarized daily entries for a date range. Use this to backfill entries
            for new developers or missed dates.
          </p>
          <div className="flex items-end gap-3">
            <div>
              <label className="text-sm font-medium">From</label>
              <input
                type="date"
                value={bulkFrom}
                onChange={(e) => setBulkFrom(e.target.value)}
                className="block mt-1 rounded-md border px-3 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium">To</label>
              <input
                type="date"
                value={bulkTo}
                onChange={(e) => setBulkTo(e.target.value)}
                className="block mt-1 rounded-md border px-3 py-1.5 text-sm"
              />
            </div>
            <Button
              onClick={handleBulkGenerate}
              disabled={bulkGenerating || !bulkFrom || !bulkTo}
            >
              {bulkGenerating ? 'Generating...' : 'Generate Range'}
            </Button>
          </div>
          {bulkResult && (
            <div className={`rounded-lg border p-3 text-sm ${
              bulkResult.isError
                ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
                : 'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200'
            }`}>
              {bulkResult.message}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alert if consecutive fallbacks */}
      {stats.consecutiveFallbacks >= 3 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950">
          <p className="font-medium text-red-800 dark:text-red-200">
            Local model appears down — {stats.consecutiveFallbacks} consecutive fallbacks detected.
            New calls will skip retries and go straight to {config.fallbackModel}.
          </p>
        </div>
      )}

      {/* Model Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Model Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Local Model</span>
              <div className="font-mono">{config.localModel}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Endpoint</span>
              <div className="font-mono">{config.localUrl}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Enabled</span>
              <div>
                {config.localEnabled ? (
                  <Badge className="bg-green-100 text-green-800 border-green-200">Enabled</Badge>
                ) : (
                  <Badge className="bg-gray-100 text-gray-800 border-gray-200">Disabled</Badge>
                )}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Reachable</span>
              <div>
                {config.localReachable ? (
                  <Badge className="bg-green-100 text-green-800 border-green-200">Reachable</Badge>
                ) : (
                  <Badge className="bg-red-100 text-red-800 border-red-200">Unreachable</Badge>
                )}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Fallback Model</span>
              <div className="font-mono">{config.fallbackModel}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Max Retries</span>
              <div>3 attempts, 2s delay</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance Stats (Last 7 Days) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Performance (Last 7 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatBox
              label="Success Rate"
              value={stats.successRate != null ? `${stats.successRate}%` : 'N/A'}
              color={stats.successRate != null && stats.successRate >= 90 ? 'green' : stats.successRate != null && stats.successRate >= 70 ? 'amber' : 'red'}
            />
            <StatBox
              label="Total Calls"
              value={String(stats.totalCalls)}
              sub={`${stats.successCount} success, ${stats.fallbackCount} fallback`}
            />
            <StatBox
              label="Retries"
              value={String(stats.retryCount)}
              color={stats.retryCount > 10 ? 'amber' : 'default'}
            />
            <StatBox
              label="Avg Latency"
              value={stats.avgLatencyMs != null ? `${(stats.avgLatencyMs / 1000).toFixed(1)}s` : 'N/A'}
            />
          </div>

          {stats.fallbackDates.length > 0 && (
            <div className="mt-4">
              <span className="text-sm text-muted-foreground">Dates that used fallback: </span>
              <span className="text-sm font-mono">
                {stats.fallbackDates.join(', ')}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Entry Model Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Entry Model Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Model</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Entries</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entryModelStats.map((s, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-sm">{s.model ?? 'unknown'}</TableCell>
                  <TableCell>
                    {s.fallback ? (
                      <Badge className="bg-amber-100 text-amber-800 border-amber-200">Fallback</Badge>
                    ) : (
                      <Badge className="bg-green-100 text-green-800 border-green-200">Primary</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{s.count}</TableCell>
                </TableRow>
              ))}
              {entryModelStats.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">No entries yet</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent Events Log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Model Events</CardTitle>
        </CardHeader>
        <CardContent>
          {recentEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No model events recorded yet. Events will appear here after the next entry generation run.
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Prompt</TableHead>
                    <TableHead>Attempt</TableHead>
                    <TableHead>Latency</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentEvents.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(event.timestamp).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <EventTypeBadge type={event.eventType} />
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {event.targetDate ?? '-'}
                      </TableCell>
                      <TableCell className="text-xs">{event.prompt}</TableCell>
                      <TableCell className="text-center">{event.attempt ?? '-'}</TableCell>
                      <TableCell className="text-xs">
                        {event.latencyMs != null ? `${(event.latencyMs / 1000).toFixed(1)}s` : '-'}
                      </TableCell>
                      <TableCell className="text-xs max-w-xs truncate" title={event.errorMessage ?? undefined}>
                        {event.errorMessage
                          ? event.errorMessage.length > 60
                            ? event.errorMessage.slice(0, 60) + '...'
                            : event.errorMessage
                          : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// --- Helper Components ---

function SyncStatusDot({ hours }: { hours: number | null }) {
  if (hours === null) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-gray-400" />
        <span className="text-xs text-muted-foreground">Never</span>
      </span>
    )
  }
  if (hours < 24) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-green-500" />
        <span className="text-xs text-green-700 dark:text-green-400">OK</span>
      </span>
    )
  }
  if (hours < 168) { // 7 days
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        <span className="text-xs text-amber-700 dark:text-amber-400">Stale</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-2 rounded-full bg-red-500" />
      <span className="text-xs text-red-700 dark:text-red-400">Down</span>
    </span>
  )
}

function EventTypeBadge({ type }: { type: string }) {
  switch (type) {
    case 'success':
      return <Badge className="bg-green-100 text-green-800 border-green-200">Success</Badge>
    case 'retry':
      return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Retry</Badge>
    case 'fallback':
      return <Badge className="bg-red-100 text-red-800 border-red-200">Fallback</Badge>
    case 'error':
      return <Badge className="bg-red-100 text-red-800 border-red-200">Error</Badge>
    default:
      return <Badge variant="outline">{type}</Badge>
  }
}

function StatBox({ label, value, sub, color = 'default' }: {
  label: string
  value: string
  sub?: string
  color?: 'green' | 'amber' | 'red' | 'default'
}) {
  const colorClasses = {
    green: 'text-green-700 dark:text-green-400',
    amber: 'text-amber-700 dark:text-amber-400',
    red: 'text-red-700 dark:text-red-400',
    default: 'text-foreground',
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${colorClasses[color]}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  )
}

function formatTimeAgo(isoString: string): string {
  const ms = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
