'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { format, subMonths } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { FileSpreadsheet, FileText, Send, Lock, Unlock, AlertTriangle } from 'lucide-react'
import { ExecutiveSummary } from '@/components/reports/executive-summary'
import { WorkTypeDistribution, type WorkTypeData } from '@/components/reports/work-type-distribution'

interface ProjectSummary {
  projectName: string
  totalHours: number
  capHours: number
  expHours: number
  entries: number
}

interface DeveloperSummary {
  developerName: string
  developerEmail: string
  totalHours: number
  capHours: number
  expHours: number
}

interface MonthlyReport {
  month: string
  summary: { totalHours: number; capHours: number; expHours: number }
  byProject: ProjectSummary[]
  byDeveloper: DeveloperSummary[]
  entryCounts: { daily: number; manual: number }
}

interface PeriodLockStatus {
  year: number
  month: number
  status: 'open' | 'soft_close' | 'locked'
  lockedBy: { displayName: string; email: string } | null
  lockedAt: string | null
  note: string | null
}

interface UnconfirmedReport {
  totalPending: number
  totalHours: number
  developers: Array<{
    developer: { id: string; displayName: string; email: string }
    entries: Array<{
      id: string
      date: string
      hoursEstimated: number | null
      project: { name: string } | null
    }>
    oldestDate: string | null
    totalHours: number
  }>
}

export default function ReportsPage() {
  const { data: session } = useSession()

  // Safely extract developer info attached by the session callback
  const sessionRecord = session as (typeof session & { developer?: { displayName: string; email: string; role: string } }) | null
  const developer = sessionRecord?.developer
  const userRole = developer?.role

  const [month, setMonth] = useState(format(subMonths(new Date(), 1), 'yyyy-MM'))
  const [report, setReport] = useState<MonthlyReport | null>(null)
  const [workTypeData, setWorkTypeData] = useState<WorkTypeData[] | null>(null)
  const [unconfirmed, setUnconfirmed] = useState<UnconfirmedReport | null>(null)
  const [periodLock, setPeriodLock] = useState<PeriodLockStatus | null>(null)
  const [lockLoading, setLockLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState('monthly')

  const loadPeriodLock = useCallback(async (monthStr: string) => {
    const [yearStr, monthNumStr] = monthStr.split('-')
    try {
      const res = await fetch(`/api/periods?year=${yearStr}&month=${parseInt(monthNumStr, 10)}`)
      if (res.ok) {
        setPeriodLock(await res.json())
      }
    } catch {
      // Silently fail — period lock status is informational
    }
  }, [])

  useEffect(() => {
    loadPeriodLock(month)
  }, [month, loadPeriodLock])

  async function handlePeriodLockChange(newStatus: 'open' | 'soft_close' | 'locked') {
    const [yearStr, monthNumStr] = month.split('-')
    setLockLoading(true)
    try {
      const res = await fetch('/api/periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year: parseInt(yearStr, 10),
          month: parseInt(monthNumStr, 10),
          status: newStatus,
        }),
      })
      if (res.ok) {
        setPeriodLock(await res.json())
      } else {
        const data = await res.json()
        alert(data.error || 'Failed to update period lock')
      }
    } finally {
      setLockLoading(false)
    }
  }

  async function loadMonthlyReport() {
    setLoading(true)
    try {
      const [reportRes, workTypeRes] = await Promise.all([
        fetch(`/api/reports/monthly?month=${month}`),
        fetch(`/api/reports/monthly/work-types?month=${month}`),
      ])
      if (reportRes.ok) setReport(await reportRes.json())
      if (workTypeRes.ok) setWorkTypeData(await workTypeRes.json())
      else setWorkTypeData(null)
    } finally {
      setLoading(false)
    }
  }

  async function loadUnconfirmed() {
    setLoading(true)
    try {
      const res = await fetch('/api/reports/unconfirmed')
      if (res.ok) setUnconfirmed(await res.json())
    } finally {
      setLoading(false)
    }
  }

  async function sendReminders() {
    const res = await fetch('/api/reports/unconfirmed/remind', { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      alert(`Sent ${data.sent} reminder emails`)
    }
  }

  function downloadExport(fmt: 'xlsx' | 'csv') {
    window.open(`/api/reports/monthly/export?month=${month}&format=${fmt}`, '_blank')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Reports</h1>
        <p className="text-muted-foreground">
          Capitalization reports for accounting and audit purposes
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="monthly">Monthly Report</TabsTrigger>
          <TabsTrigger value="unconfirmed">Unconfirmed Entries</TabsTrigger>
        </TabsList>

        <TabsContent value="monthly" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Monthly Capitalization Report</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-4 flex-wrap">
                <div className="space-y-1">
                  <Label htmlFor="month">Month</Label>
                  <Input
                    id="month"
                    type="month"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                    className="w-48"
                  />
                </div>
                {periodLock && (
                  <Badge
                    className={
                      periodLock.status === 'locked'
                        ? 'bg-red-100 text-red-800 border-red-200'
                        : periodLock.status === 'soft_close'
                          ? 'bg-amber-100 text-amber-800 border-amber-200'
                          : 'bg-green-100 text-green-800 border-green-200'
                    }
                  >
                    {periodLock.status === 'locked'
                      ? 'Locked'
                      : periodLock.status === 'soft_close'
                        ? 'Soft Close'
                        : 'Open'}
                  </Badge>
                )}
                <Button onClick={loadMonthlyReport} disabled={loading}>
                  {loading ? 'Loading...' : 'Generate Report'}
                </Button>
                {report && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => downloadExport('xlsx')}>
                      <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => downloadExport('csv')}>
                      <FileText className="h-4 w-4 mr-1" /> CSV
                    </Button>
                  </div>
                )}
                {userRole === 'admin' && periodLock && (
                  <div className="flex gap-2">
                    {periodLock.status !== 'locked' && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handlePeriodLockChange('locked')}
                        disabled={lockLoading}
                      >
                        <Lock className="h-4 w-4 mr-1" /> Lock Period
                      </Button>
                    )}
                    {periodLock.status === 'locked' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePeriodLockChange('open')}
                        disabled={lockLoading}
                      >
                        <Unlock className="h-4 w-4 mr-1" /> Unlock Period
                      </Button>
                    )}
                    {periodLock.status === 'open' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePeriodLockChange('soft_close')}
                        disabled={lockLoading}
                      >
                        Soft Close
                      </Button>
                    )}
                    {periodLock.status === 'soft_close' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handlePeriodLockChange('open')}
                        disabled={lockLoading}
                      >
                        Reopen
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {periodLock?.status === 'locked' && (
            <Alert className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertTitle className="text-red-800">Period Locked</AlertTitle>
              <AlertDescription className="text-red-700">
                This period is locked. No entry modifications allowed.
                {periodLock.lockedBy && (
                  <span className="block mt-1 text-xs">
                    Locked by {periodLock.lockedBy.displayName} on{' '}
                    {periodLock.lockedAt
                      ? new Date(periodLock.lockedAt).toLocaleDateString()
                      : 'unknown date'}
                  </span>
                )}
                {periodLock.note && (
                  <span className="block mt-1 text-xs italic">{periodLock.note}</span>
                )}
              </AlertDescription>
            </Alert>
          )}

          {periodLock?.status === 'soft_close' && (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800">Soft Close</AlertTitle>
              <AlertDescription className="text-amber-700">
                This period is in soft close. Entry modifications are still allowed but the period is pending final lock.
              </AlertDescription>
            </Alert>
          )}

          {report && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Total Hours</p>
                    <p className="text-3xl font-bold">{report.summary.totalHours.toFixed(1)}</p>
                    <p className="text-xs text-muted-foreground">
                      {report.entryCounts.daily + report.entryCounts.manual} entries
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Capitalizable <InfoTooltip text="Hours qualifying for balance sheet capitalization under ASC 350-40. Only Application Development phase hours on management-authorized projects are included." /></p>
                    <p className="text-3xl font-bold text-green-600">
                      {report.summary.capHours.toFixed(1)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {report.summary.totalHours > 0
                        ? `${((report.summary.capHours / report.summary.totalHours) * 100).toFixed(0)}% of total`
                        : '0%'}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Expensed <InfoTooltip text="Hours expensed in the period incurred. Includes Preliminary phase (research, feasibility) and Post-Implementation (maintenance, bug fixes, training)." /></p>
                    <p className="text-3xl font-bold text-gray-500">
                      {report.summary.expHours.toFixed(1)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader>
                  <CardTitle>By Project</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project</TableHead>
                        <TableHead className="text-right">Total Hours</TableHead>
                        <TableHead className="text-right">Capitalizable</TableHead>
                        <TableHead className="text-right">Expensed</TableHead>
                        <TableHead className="text-right">Entries</TableHead>
                        <TableHead className="text-right">Cap % <InfoTooltip text="Capitalization rate — the percentage of total hours that qualify for balance sheet capitalization under ASC 350-40." /></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.byProject.map((p) => (
                        <TableRow key={p.projectName}>
                          <TableCell className="font-medium">{p.projectName}</TableCell>
                          <TableCell className="text-right">{p.totalHours.toFixed(1)}</TableCell>
                          <TableCell className="text-right text-green-600">
                            {p.capHours.toFixed(1)}
                          </TableCell>
                          <TableCell className="text-right text-gray-500">
                            {p.expHours.toFixed(1)}
                          </TableCell>
                          <TableCell className="text-right">{p.entries}</TableCell>
                          <TableCell className="text-right">
                            {p.totalHours > 0
                              ? `${((p.capHours / p.totalHours) * 100).toFixed(0)}%`
                              : '0%'}
                          </TableCell>
                        </TableRow>
                      ))}
                      {report.byProject.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground">
                            No confirmed entries for this period
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>By Developer</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Developer</TableHead>
                        <TableHead className="text-right">Total Hours</TableHead>
                        <TableHead className="text-right">Capitalizable</TableHead>
                        <TableHead className="text-right">Expensed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.byDeveloper.map((d) => (
                        <TableRow key={d.developerEmail}>
                          <TableCell>
                            <div>
                              <span className="font-medium">{d.developerName}</span>
                              <span className="text-xs text-muted-foreground ml-2">
                                {d.developerEmail}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{d.totalHours.toFixed(1)}</TableCell>
                          <TableCell className="text-right text-green-600">
                            {d.capHours.toFixed(1)}
                          </TableCell>
                          <TableCell className="text-right text-gray-500">
                            {d.expHours.toFixed(1)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {workTypeData && workTypeData.length > 0 && (
                <WorkTypeDistribution data={workTypeData} />
              )}

              <ExecutiveSummary
                year={parseInt(month.split('-')[0], 10)}
                month={parseInt(month.split('-')[1], 10)}
                role={userRole}
              />
            </>
          )}
        </TabsContent>

        <TabsContent value="unconfirmed" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Unconfirmed Entries</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <Button onClick={loadUnconfirmed} disabled={loading}>
                  {loading ? 'Loading...' : 'Load Report'}
                </Button>
                {unconfirmed && unconfirmed.totalPending > 0 && (
                  <Button variant="outline" onClick={sendReminders}>
                    <Send className="h-4 w-4 mr-1" /> Send Reminders
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {unconfirmed && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Pending Entries</p>
                    <p className="text-3xl font-bold text-amber-600">{unconfirmed.totalPending}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Unconfirmed Hours</p>
                    <p className="text-3xl font-bold">{unconfirmed.totalHours.toFixed(1)}</p>
                  </CardContent>
                </Card>
              </div>

              {unconfirmed.developers.map((d) => (
                <Card key={d.developer.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>{d.developer.displayName}</span>
                      <Badge variant="secondary">{d.entries.length} pending</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Project</TableHead>
                          <TableHead className="text-right">Est. Hours</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {d.entries.slice(0, 10).map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell>{new Date(entry.date).toLocaleDateString()}</TableCell>
                            <TableCell>{entry.project?.name ?? 'Unassigned'}</TableCell>
                            <TableCell className="text-right">
                              {entry.hoursEstimated?.toFixed(1) ?? '-'}
                            </TableCell>
                          </TableRow>
                        ))}
                        {d.entries.length > 10 && (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-muted-foreground">
                              +{d.entries.length - 10} more entries
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ))}

              {unconfirmed.developers.length === 0 && (
                <Card>
                  <CardContent className="pt-6 text-center text-muted-foreground">
                    No pending entries. All developers are up to date.
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
