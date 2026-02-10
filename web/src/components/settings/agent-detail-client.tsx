'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { toast } from 'sonner'
import { ArrowLeft, Monitor, Clock, FolderOpen, Search, History, Check, X, RotateCcw } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface DiscoveredPath {
  localPath: string
  claudePath: string | null
  hasGit: boolean
  excluded: boolean
}

interface SyncLog {
  id: string
  syncType: string
  startedAt: string
  completedAt: string | null
  status: string
  sessionsCount: number
  commitsCount: number
  errorMessage: string | null
}

interface AgentKeyDetail {
  id: string
  keyPrefix: string
  name: string
  machineName: string | null
  lastUsedAt: string | null
  lastKnownVersion: string | null
  claudeDataDirs: string[]
  excludePaths: string[]
  hostname: string | null
  osInfo: string | null
  discoveredPaths: DiscoveredPath[] | null
  hooksInstalled: boolean
  lastReportedAt: string | null
  syncScheduleWeekday: string | null
  syncScheduleWeekend: string | null
  createdAt: string
  syncLogs: SyncLog[]
}

interface AgentDetailClientProps {
  agentKey: AgentKeyDetail
  globalSchedule: {
    weekday: string
    weekend: string
  }
}

function StatusDot({ lastUsedAt }: { lastUsedAt: string | null }) {
  if (!lastUsedAt) return <span className="inline-block w-2 h-2 rounded-full bg-gray-400" title="Never connected" />
  const ago = Date.now() - new Date(lastUsedAt).getTime()
  const hours24 = 24 * 60 * 60 * 1000
  const days7 = 7 * hours24
  if (ago < hours24) return <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="Active (last 24h)" />
  if (ago < days7) return <span className="inline-block w-2 h-2 rounded-full bg-amber-500" title="Idle (last 7d)" />
  return <span className="inline-block w-2 h-2 rounded-full bg-red-500" title="Inactive (>7d)" />
}

export function AgentDetailClient({ agentKey, globalSchedule }: AgentDetailClientProps) {
  const router = useRouter()

  // Overview card state
  const [editName, setEditName] = useState(agentKey.name)
  const [editMachineName, setEditMachineName] = useState(agentKey.machineName || '')
  const [savingOverview, setSavingOverview] = useState(false)

  // Schedule card state
  const [scheduleWeekday, setScheduleWeekday] = useState(agentKey.syncScheduleWeekday || '')
  const [scheduleWeekend, setScheduleWeekend] = useState(agentKey.syncScheduleWeekend || '')
  const [savingSchedule, setSavingSchedule] = useState(false)
  const hasCustomSchedule = agentKey.syncScheduleWeekday !== null || agentKey.syncScheduleWeekend !== null

  // Directories card state
  const [editDirs, setEditDirs] = useState(agentKey.claudeDataDirs.join('\n'))
  const [editExcludes, setEditExcludes] = useState(agentKey.excludePaths.join('\n'))
  const [savingDirs, setSavingDirs] = useState(false)

  async function patchKey(data: Record<string, unknown>) {
    const res = await fetch(`/api/keys/${agentKey.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }))
      throw new Error(err.error || 'Request failed')
    }
    return res.json()
  }

  async function handleSaveOverview() {
    setSavingOverview(true)
    try {
      await patchKey({ name: editName, machineName: editMachineName || null })
      toast.success('Agent info saved')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    }
    setSavingOverview(false)
  }

  async function handleSaveSchedule() {
    setSavingSchedule(true)
    try {
      await patchKey({
        syncScheduleWeekday: scheduleWeekday || null,
        syncScheduleWeekend: scheduleWeekend || null,
      })
      toast.success('Schedule saved')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    }
    setSavingSchedule(false)
  }

  async function handleResetSchedule() {
    setSavingSchedule(true)
    try {
      await patchKey({ syncScheduleWeekday: null, syncScheduleWeekend: null })
      setScheduleWeekday('')
      setScheduleWeekend('')
      toast.success('Schedule reset to global defaults')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reset')
    }
    setSavingSchedule(false)
  }

  async function handleSaveDirs() {
    setSavingDirs(true)
    const claudeDataDirs = editDirs.split('\n').map(s => s.trim()).filter(Boolean)
    const excludePaths = editExcludes.split('\n').map(s => s.trim()).filter(Boolean)
    try {
      await patchKey({ claudeDataDirs, excludePaths })
      toast.success('Directories saved')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save')
    }
    setSavingDirs(false)
  }

  async function handleExcludePath(localPath: string) {
    const currentExcludes = editExcludes.split('\n').map(s => s.trim()).filter(Boolean)
    // Extract the project folder name from the local path
    const pathSegment = localPath.split('/').pop() || localPath
    if (currentExcludes.includes(pathSegment)) return
    const newExcludes = [...currentExcludes, pathSegment]
    setEditExcludes(newExcludes.join('\n'))
    setSavingDirs(true)
    try {
      const claudeDataDirs = editDirs.split('\n').map(s => s.trim()).filter(Boolean)
      await patchKey({ claudeDataDirs, excludePaths: newExcludes })
      toast.success(`Excluded: ${pathSegment}`)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to exclude')
    }
    setSavingDirs(false)
  }

  async function handleIncludePath(localPath: string) {
    const currentExcludes = editExcludes.split('\n').map(s => s.trim()).filter(Boolean)
    const pathSegment = localPath.split('/').pop() || localPath
    const newExcludes = currentExcludes.filter(ex => !localPath.includes(ex))
    setEditExcludes(newExcludes.join('\n'))
    setSavingDirs(true)
    try {
      const claudeDataDirs = editDirs.split('\n').map(s => s.trim()).filter(Boolean)
      await patchKey({ claudeDataDirs, excludePaths: newExcludes })
      toast.success(`Included: ${pathSegment}`)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to include')
    }
    setSavingDirs(false)
  }

  const discoveredPaths = (agentKey.discoveredPaths as DiscoveredPath[] | null) || []

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Back link */}
      <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to Settings
      </Link>

      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <StatusDot lastUsedAt={agentKey.lastUsedAt} />
          {agentKey.name}
        </h1>
        <p className="text-sm text-muted-foreground">
          Agent key {agentKey.keyPrefix}... &middot; Created {formatDistanceToNow(new Date(agentKey.createdAt), { addSuffix: true })}
        </p>
      </div>

      {/* Card 1: Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="h-5 w-5" /> Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Version</p>
              <p className="font-mono">{agentKey.lastKnownVersion || 'Unknown'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Last Seen</p>
              <p>{agentKey.lastUsedAt ? formatDistanceToNow(new Date(agentKey.lastUsedAt), { addSuffix: true }) : 'Never'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Hostname</p>
              <p className="font-mono">{agentKey.hostname || 'Unknown'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">OS</p>
              <p>{agentKey.osInfo || 'Unknown'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Hooks</p>
              <p>
                {agentKey.hooksInstalled
                  ? <Badge variant="secondary" className="text-xs"><Check className="h-3 w-3 mr-1" /> Installed</Badge>
                  : <Badge variant="outline" className="text-xs"><X className="h-3 w-3 mr-1" /> Not installed</Badge>
                }
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Last Report</p>
              <p>{agentKey.lastReportedAt ? formatDistanceToNow(new Date(agentKey.lastReportedAt), { addSuffix: true }) : 'Never'}</p>
            </div>
          </div>

          <div className="border-t pt-4 space-y-3">
            <div className="space-y-2">
              <Label htmlFor="agentName">Name</Label>
              <Input id="agentName" value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="machineName">Machine Name</Label>
              <Input id="machineName" placeholder="e.g., work-laptop" value={editMachineName} onChange={e => setEditMachineName(e.target.value)} />
            </div>
            <Button size="sm" onClick={handleSaveOverview} disabled={savingOverview}>
              {savingOverview ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Card 2: Sync Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" /> Sync Schedule
            {hasCustomSchedule
              ? <Badge variant="secondary" className="text-xs ml-auto">Custom</Badge>
              : <Badge variant="outline" className="text-xs ml-auto">Global Default</Badge>
            }
          </CardTitle>
          <CardDescription>
            Controls when the agent syncs automatically via systemd timers.
            {!hasCustomSchedule && ' Using global defaults.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="schedWeekday">Weekday Schedule</Label>
              <Input
                id="schedWeekday"
                placeholder={globalSchedule.weekday}
                value={scheduleWeekday}
                onChange={e => setScheduleWeekday(e.target.value)}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Current: <code className="bg-muted px-1 py-0.5 rounded">{agentKey.syncScheduleWeekday || globalSchedule.weekday}</code>
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="schedWeekend">Weekend Schedule</Label>
              <Input
                id="schedWeekend"
                placeholder={globalSchedule.weekend}
                value={scheduleWeekend}
                onChange={e => setScheduleWeekend(e.target.value)}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Current: <code className="bg-muted px-1 py-0.5 rounded">{agentKey.syncScheduleWeekend || globalSchedule.weekend}</code>
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSaveSchedule} disabled={savingSchedule}>
              {savingSchedule ? 'Saving...' : 'Save Schedule'}
            </Button>
            {hasCustomSchedule && (
              <Button size="sm" variant="outline" onClick={handleResetSchedule} disabled={savingSchedule}>
                <RotateCcw className="h-3 w-3 mr-1" /> Reset to Global
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Card 3: Monitored Directories */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" /> Monitored Directories
          </CardTitle>
          <CardDescription>
            Directories scanned for Claude Code session data. Changes take effect on next sync.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="claudeDirs">Claude Data Directories</Label>
              <Textarea
                id="claudeDirs"
                placeholder="~/.claude/projects"
                value={editDirs}
                onChange={e => setEditDirs(e.target.value)}
                rows={3}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">One path per line.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="excludePatterns">Exclude Patterns</Label>
              <Textarea
                id="excludePatterns"
                placeholder="node_modules&#10;.archive"
                value={editExcludes}
                onChange={e => setEditExcludes(e.target.value)}
                rows={3}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">One pattern per line. Projects matching any pattern are skipped.</p>
            </div>
          </div>
          <Button size="sm" onClick={handleSaveDirs} disabled={savingDirs}>
            {savingDirs ? 'Saving...' : 'Save Directories'}
          </Button>
        </CardContent>
      </Card>

      {/* Card 4: Discovered Projects */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" /> Discovered Projects
          </CardTitle>
          <CardDescription>
            Projects found by the agent during its last scan. Use the buttons to include or exclude specific projects.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {discoveredPaths.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              No data yet. The agent reports discovered projects after each sync.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project Path</TableHead>
                    <TableHead className="w-16">Git</TableHead>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {discoveredPaths.map((dp) => (
                    <TableRow key={dp.localPath}>
                      <TableCell className="font-mono text-xs">{dp.localPath}</TableCell>
                      <TableCell>
                        {dp.hasGit
                          ? <Badge variant="secondary" className="text-xs">Yes</Badge>
                          : <Badge variant="outline" className="text-xs">No</Badge>
                        }
                      </TableCell>
                      <TableCell>
                        {dp.excluded
                          ? <Badge variant="outline" className="text-xs text-amber-600">Excluded</Badge>
                          : <Badge variant="secondary" className="text-xs text-green-600">Tracked</Badge>
                        }
                      </TableCell>
                      <TableCell>
                        {dp.excluded ? (
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleIncludePath(dp.localPath)} disabled={savingDirs}>
                            Include
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => handleExcludePath(dp.localPath)} disabled={savingDirs}>
                            Exclude
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card 5: Recent Syncs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" /> Recent Syncs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {agentKey.syncLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No sync history yet.</p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Sessions</TableHead>
                    <TableHead>Commits</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agentKey.syncLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-sm">
                        {formatDistanceToNow(new Date(log.startedAt), { addSuffix: true })}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{log.syncType}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{log.sessionsCount}</TableCell>
                      <TableCell className="text-sm">{log.commitsCount}</TableCell>
                      <TableCell>
                        {log.status === 'completed' && <Badge variant="secondary" className="text-xs text-green-600">Completed</Badge>}
                        {log.status === 'running' && <Badge variant="secondary" className="text-xs text-blue-600">Running</Badge>}
                        {log.status === 'failed' && <Badge variant="destructive" className="text-xs">Failed</Badge>}
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
