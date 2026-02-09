'use client'

import { useState } from 'react'
import { format, subMonths } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Loader2, BookOpen, Copy, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

interface ProjectNarrativeProps {
  projectId: string
  role?: string
}

interface NarrativeReport {
  year: number
  month: number
  reportData: Record<string, unknown>
  status: string
  generatedAt: string
}

interface NarrativeResponse {
  projectId: string
  projectName: string
  period: { from: string; to: string }
  reports: NarrativeReport[]
}

interface GenerateResponse {
  projectId: string
  projectName: string
  period: { from: string; to: string }
  narrative: Record<string, unknown>
  modelUsed: string
  modelFallback: boolean
}

const sectionLabels: Record<string, string> = {
  narrativeSummary: 'Narrative Summary',
  phaseJustification: 'Phase Justification',
  developerAllocation: 'Developer Allocation',
  methodologyCompliance: 'Methodology Compliance',
  riskFactors: 'Risk Factors',
}

const sectionOrder = [
  'narrativeSummary',
  'phaseJustification',
  'developerAllocation',
  'methodologyCompliance',
  'riskFactors',
]

function renderNarrativeSection(value: unknown): React.ReactNode {
  if (typeof value === 'string') {
    return <p className="text-sm leading-relaxed whitespace-pre-wrap">{value}</p>
  }
  if (Array.isArray(value)) {
    return (
      <ul className="list-disc list-inside space-y-1 text-sm">
        {value.map((item, i) => (
          <li key={i} className="leading-relaxed">
            {typeof item === 'string' ? item : JSON.stringify(item)}
          </li>
        ))}
      </ul>
    )
  }
  if (typeof value === 'object' && value !== null) {
    return (
      <div className="space-y-2 text-sm">
        {Object.entries(value).map(([key, val]) => (
          <div key={key}>
            <span className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}: </span>
            {typeof val === 'string' ? val : JSON.stringify(val)}
          </div>
        ))}
      </div>
    )
  }
  return <p className="text-sm">{String(value)}</p>
}

function extractPlainText(data: Record<string, unknown>): string {
  const lines: string[] = []

  // Use ordered sections first, then any extras
  const knownKeys = new Set(sectionOrder)
  const extraKeys = Object.keys(data).filter(k => !knownKeys.has(k))
  const allKeys = [...sectionOrder.filter(k => data[k] !== undefined), ...extraKeys]

  for (const key of allKeys) {
    const value = data[key]
    if (value === undefined || value === null) continue

    const label = sectionLabels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())
    lines.push(`## ${label}`)
    lines.push('')

    if (typeof value === 'string') {
      lines.push(value)
    } else if (Array.isArray(value)) {
      for (const item of value) {
        lines.push(`- ${typeof item === 'string' ? item : JSON.stringify(item)}`)
      }
    } else if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        lines.push(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
      }
    } else {
      lines.push(String(value))
    }
    lines.push('')
  }

  return lines.join('\n')
}

export function ProjectNarrative({ projectId, role }: ProjectNarrativeProps) {
  const now = new Date()
  const threeMonthsAgo = subMonths(now, 3)

  const [fromDate, setFromDate] = useState(format(threeMonthsAgo, 'yyyy-MM-dd'))
  const [toDate, setToDate] = useState(format(now, 'yyyy-MM-dd'))
  const [narrativeData, setNarrativeData] = useState<Record<string, unknown> | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [hasExisting, setHasExisting] = useState(false)

  const canGenerate = role === 'manager' || role === 'admin'

  async function fetchNarrative() {
    setLoading(true)
    try {
      const res = await fetch(
        `/api/reports/project/${projectId}/narrative?from=${fromDate}&to=${toDate}`
      )
      if (res.status === 404) {
        setNarrativeData(null)
        setHasExisting(false)
      } else if (res.ok) {
        const data: NarrativeResponse = await res.json()
        // Combine narrative from the most recent report
        if (data.reports.length > 0) {
          const latest = data.reports[data.reports.length - 1]
          const reportData = latest.reportData as Record<string, unknown>
          const narrative = reportData.narrative as Record<string, unknown> | undefined
          setNarrativeData(narrative ?? reportData)
          setHasExisting(true)
        } else {
          setNarrativeData(null)
          setHasExisting(false)
        }
      } else {
        const err = await res.json()
        toast.error(err.error || 'Failed to load narrative')
      }
    } catch {
      toast.error('Failed to load narrative')
    } finally {
      setLoading(false)
    }
  }

  async function handleGenerate() {
    setGenerating(true)
    try {
      const res = await fetch(`/api/reports/project/${projectId}/narrative`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromDate, to: toDate }),
      })
      if (res.ok) {
        const data: GenerateResponse = await res.json()
        setNarrativeData(data.narrative)
        setHasExisting(true)
        toast.success('Project narrative generated successfully')
      } else {
        const err = await res.json()
        toast.error(err.error || 'Failed to generate narrative')
      }
    } catch {
      toast.error('Failed to generate narrative')
    } finally {
      setGenerating(false)
    }
  }

  async function handleCopyAsText() {
    if (!narrativeData) return
    try {
      const text = extractPlainText(narrativeData)
      await navigator.clipboard.writeText(text)
      toast.success('Narrative copied to clipboard')
    } catch {
      toast.error('Failed to copy to clipboard')
    }
  }

  // Gather sections in order, plus any extra keys
  const allSectionKeys = narrativeData
    ? (() => {
        const knownKeys = new Set(sectionOrder)
        const extraKeys = Object.keys(narrativeData).filter(k => !knownKeys.has(k))
        return [...sectionOrder.filter(k => narrativeData[k] !== undefined), ...extraKeys]
      })()
    : []

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Project Narrative
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label htmlFor="narrative-from">From</Label>
              <Input
                id="narrative-from"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-44"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="narrative-to">To</Label>
              <Input
                id="narrative-to"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-44"
              />
            </div>
            <Button onClick={fetchNarrative} disabled={loading} variant="outline">
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                'Load Narrative'
              )}
            </Button>
            {canGenerate && (
              <Button onClick={handleGenerate} disabled={generating}>
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : hasExisting ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Regenerate Narrative
                  </>
                ) : (
                  'Generate Narrative'
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {narrativeData && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">
                Narrative: {fromDate} to {toDate}
              </CardTitle>
              <Button variant="outline" size="sm" onClick={handleCopyAsText}>
                <Copy className="h-4 w-4 mr-1" />
                Copy as Text
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {allSectionKeys.map(key => {
              const value = narrativeData[key]
              if (value === undefined || value === null) return null
              return (
                <div key={key}>
                  <h3 className="text-sm font-semibold mb-2">
                    {sectionLabels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                  </h3>
                  {renderNarrativeSection(value)}
                </div>
              )
            })}
            {allSectionKeys.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Narrative data is empty. Try regenerating.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {!narrativeData && !loading && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground text-center">
              No narrative available for the selected period. Use &quot;Load Narrative&quot; to check for existing narratives
              {canGenerate && ' or "Generate Narrative" to create a new one'}.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
