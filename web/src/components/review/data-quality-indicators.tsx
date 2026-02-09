'use client'

import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface SourceSession {
  activeMinutes?: number | null
  messageCount?: number
  toolUseCount?: number
  userPromptCount?: number | null
}

interface SourceCommit {
  filesChanged?: number
  insertions?: number
}

function computeSessionQuality(sessions: SourceSession[]): number {
  if (sessions.length === 0) return 0

  let score = 0
  const maxScore = 3.0

  // Has active time data (most valuable signal)
  if (sessions.some((s) => s.activeMinutes != null && s.activeMinutes > 0)) score += 1.5

  // Has meaningful prompt count
  const totalPrompts = sessions.reduce((sum, s) => sum + (s.userPromptCount ?? 0), 0)
  if (totalPrompts >= 5) score += 1.0
  else if (totalPrompts >= 1) score += 0.5

  // Has meaningful message count
  const totalMessages = sessions.reduce((sum, s) => sum + (s.messageCount ?? 0), 0)
  if (totalMessages >= 10) score += 0.5

  return Math.min(score / maxScore, 1)
}

function computeCommitQuality(commits: SourceCommit[]): number {
  if (commits.length === 0) return 0

  let score = 0
  const maxScore = 3.0

  // Number of commits
  if (commits.length >= 3) score += 1.0
  else if (commits.length >= 1) score += 0.5

  // Insertions volume
  const totalInsertions = commits.reduce((sum, c) => sum + (c.insertions ?? 0), 0)
  if (totalInsertions >= 50) score += 1.0
  else if (totalInsertions >= 10) score += 0.5

  // Files changed
  const totalFiles = commits.reduce((sum, c) => sum + (c.filesChanged ?? 0), 0)
  if (totalFiles >= 5) score += 1.0
  else if (totalFiles >= 1) score += 0.5

  return Math.min(score / maxScore, 1)
}

function computeHookQuality(hookEventCount: number): number {
  if (hookEventCount === 0) return 0
  // Scoring: more events = richer real-time data
  if (hookEventCount >= 50) return 1.0
  if (hookEventCount >= 20) return 0.7
  if (hookEventCount >= 5) return 0.4
  return 0.2
}

const COLOR_MAP: Record<string, { empty: string; low: string; mid: string; high: string }> = {
  blue:    { empty: 'border border-blue-300/40',    low: 'bg-blue-300/50',    mid: 'bg-blue-500/70',    high: 'bg-blue-600' },
  emerald: { empty: 'border border-emerald-300/40', low: 'bg-emerald-300/50', mid: 'bg-emerald-500/70', high: 'bg-emerald-600' },
  violet:  { empty: 'border border-violet-300/40',  low: 'bg-violet-300/50',  mid: 'bg-violet-500/70',  high: 'bg-violet-600' },
}

function QualityDot({
  quality,
  color,
  tooltipContent,
}: {
  quality: number
  color: 'blue' | 'emerald' | 'violet'
  tooltipContent: React.ReactNode
}) {
  const c = COLOR_MAP[color]
  const colorClasses = quality === 0
    ? c.empty
    : quality <= 0.33
      ? c.low
      : quality <= 0.66
        ? c.mid
        : c.high

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('inline-block h-3 w-3 rounded-full cursor-help', colorClasses)} />
      </TooltipTrigger>
      <TooltipContent>{tooltipContent}</TooltipContent>
    </Tooltip>
  )
}

function ConfidenceBadge({
  score,
  reasoning,
}: {
  score: number | null
  reasoning?: string | null
}) {
  if (score == null) return null

  const pct = Math.round(score * 100)

  let colorClasses: string
  if (score >= 0.85) {
    colorClasses = 'bg-green-100 text-green-800 border-green-200'
  } else if (score >= 0.7) {
    colorClasses = 'bg-blue-100 text-blue-800 border-blue-200'
  } else if (score >= 0.5) {
    colorClasses = 'bg-amber-100 text-amber-800 border-amber-200'
  } else {
    colorClasses = 'bg-red-100 text-red-800 border-red-200'
  }

  const badge = (
    <Badge className={`text-[10px] ${colorClasses} cursor-help`}>{pct}%</Badge>
  )

  if (!reasoning) return badge

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent className="max-w-sm">
        <p className="font-medium mb-1">AI Confidence: {pct}%</p>
        <p className="text-xs whitespace-pre-wrap">{reasoning}</p>
      </TooltipContent>
    </Tooltip>
  )
}

export function DataQualityIndicators({
  confidenceScore,
  confidenceReasoning,
  sessions,
  commits,
  hookEventCount = 0,
}: {
  confidenceScore: number | null
  confidenceReasoning?: string | null
  sessions: SourceSession[]
  commits: SourceCommit[]
  hookEventCount?: number
}) {
  const sessionQuality = computeSessionQuality(sessions)
  const commitQuality = computeCommitQuality(commits)
  const hookQuality = computeHookQuality(hookEventCount)

  const totalActiveMin = sessions.reduce((sum, s) => sum + (s.activeMinutes ?? 0), 0)
  const totalPrompts = sessions.reduce((sum, s) => sum + (s.userPromptCount ?? 0), 0)
  const totalMessages = sessions.reduce((sum, s) => sum + (s.messageCount ?? 0), 0)
  const totalInsertions = commits.reduce((sum, c) => sum + (c.insertions ?? 0), 0)
  const totalFiles = commits.reduce((sum, c) => sum + (c.filesChanged ?? 0), 0)

  return (
    <div className="flex items-center gap-1.5">
      <QualityDot
        quality={sessionQuality}
        color="blue"
        tooltipContent={
          <div>
            <p className="font-medium">Sessions: {sessions.length}</p>
            {sessions.length === 0 ? (
              <p className="text-xs">No session data</p>
            ) : (
              <div className="text-xs space-y-0.5">
                <p>Active time: {totalActiveMin > 0 ? `${totalActiveMin} min` : 'not available'}</p>
                <p>Prompts: {totalPrompts}</p>
                <p>Messages: {totalMessages}</p>
              </div>
            )}
          </div>
        }
      />
      <QualityDot
        quality={commitQuality}
        color="emerald"
        tooltipContent={
          <div>
            <p className="font-medium">Commits: {commits.length}</p>
            {commits.length === 0 ? (
              <p className="text-xs">No commit data</p>
            ) : (
              <div className="text-xs space-y-0.5">
                <p>Files changed: {totalFiles}</p>
                <p>Insertions: {totalInsertions}</p>
              </div>
            )}
          </div>
        }
      />
      <QualityDot
        quality={hookQuality}
        color="violet"
        tooltipContent={
          <div>
            <p className="font-medium">Hooks: {hookEventCount} events</p>
            {hookEventCount === 0 ? (
              <p className="text-xs">No real-time hook data</p>
            ) : (
              <p className="text-xs">Real-time tool events from Claude Code</p>
            )}
          </div>
        }
      />
      <ConfidenceBadge score={confidenceScore} reasoning={confidenceReasoning} />
    </div>
  )
}
