'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

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

export function SystemHealthClient() {
  const [data, setData] = useState<ModelHealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/model-health')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

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

  if (error || !data) {
    return (
      <div className="space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold">System Health</h1>
          <p className="text-sm text-destructive">Error: {error ?? 'Unknown'}</p>
        </div>
      </div>
    )
  }

  const { config, stats, entryModelStats, recentEvents } = data

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold">System Health</h1>
        <p className="text-sm text-muted-foreground">
          AI model status, fallback events, and retry diagnostics.
        </p>
      </div>

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
