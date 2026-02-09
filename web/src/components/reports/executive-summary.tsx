'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, RefreshCw, FileText } from 'lucide-react'
import { toast } from 'sonner'

interface ExecutiveSummaryProps {
  year: number
  month: number
  role?: string
}

interface SummaryData {
  id: string
  year: number
  month: number
  reportData: Record<string, unknown>
  modelUsed: string
  modelFallback: boolean
  status: string
  generatedBy?: { displayName: string; email: string }
  generatedAt: string
  updatedAt: string
}

const sectionLabels: Record<string, string> = {
  executiveSummary: 'Executive Summary',
  projectHighlights: 'Project Highlights',
  phaseDistributionNarrative: 'Phase Distribution',
  complianceNotes: 'Compliance Notes',
  modelReliabilityNarrative: 'Model Reliability',
  recommendations: 'Recommendations',
}

const sectionOrder = [
  'executiveSummary',
  'projectHighlights',
  'phaseDistributionNarrative',
  'complianceNotes',
  'modelReliabilityNarrative',
  'recommendations',
]

function renderSection(value: unknown): React.ReactNode {
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

export function ExecutiveSummary({ year, month, role }: ExecutiveSummaryProps) {
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [notFound, setNotFound] = useState(false)

  const canGenerate = role === 'manager' || role === 'admin'

  const fetchSummary = useCallback(async () => {
    if (!year || !month) return
    setLoading(true)
    setNotFound(false)
    try {
      const res = await fetch(`/api/reports/${year}/${month}/summary`)
      if (res.status === 404) {
        setSummary(null)
        setNotFound(true)
      } else if (res.ok) {
        const data = await res.json()
        setSummary(data)
        setNotFound(false)
      } else {
        const err = await res.json()
        toast.error(err.error || 'Failed to load executive summary')
      }
    } catch {
      toast.error('Failed to load executive summary')
    } finally {
      setLoading(false)
    }
  }, [year, month])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  async function handleGenerate() {
    setGenerating(true)
    try {
      const res = await fetch(`/api/reports/${year}/${month}/summary`, {
        method: 'POST',
      })
      if (res.ok) {
        toast.success('Executive summary generated successfully')
        await fetchSummary()
      } else {
        const err = await res.json()
        toast.error(err.error || 'Failed to generate executive summary')
      }
    } catch {
      toast.error('Failed to generate executive summary')
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading executive summary...</span>
        </CardContent>
      </Card>
    )
  }

  if (notFound && !summary) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Executive Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            No executive summary has been generated for this period yet.
          </p>
          {canGenerate && (
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                'Generate Summary'
              )}
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }

  if (!summary) return null

  const reportData = summary.reportData as Record<string, unknown>

  // Gather sections in order, plus any extra keys not in the predefined order
  const knownKeys = new Set(sectionOrder)
  const extraKeys = Object.keys(reportData).filter(k => !knownKeys.has(k))
  const allKeys = [...sectionOrder.filter(k => reportData[k] !== undefined), ...extraKeys]

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Executive Summary
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {summary.status}
            </Badge>
            {summary.modelUsed && (
              <Badge variant="secondary" className="text-xs">
                {summary.modelUsed}
                {summary.modelFallback && ' (fallback)'}
              </Badge>
            )}
            {canGenerate && (
              <Button variant="outline" size="sm" onClick={handleGenerate} disabled={generating}>
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Regenerate
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
        {summary.generatedBy && (
          <p className="text-xs text-muted-foreground">
            Generated by {summary.generatedBy.displayName} on{' '}
            {new Date(summary.generatedAt).toLocaleDateString()}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-6">
        {allKeys.map(key => {
          const value = reportData[key]
          if (value === undefined || value === null) return null
          return (
            <div key={key}>
              <h3 className="text-sm font-semibold mb-2">
                {sectionLabels[key] || key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
              </h3>
              {renderSection(value)}
            </div>
          )
        })}
        {allKeys.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Summary data is empty. Try regenerating.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
