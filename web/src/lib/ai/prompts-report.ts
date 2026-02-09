// ============================================================
// Report prompt builders for Features E & F
// Monthly Executive Summaries + Auditor-Ready Project Narratives
// ============================================================

// ---- Context types ----

export interface MonthlySummaryContext {
  year: number
  month: number
  monthName: string // e.g. "January 2026"
  totalHours: number
  capHours: number
  expHours: number
  capPercentage: number
  projects: Array<{
    name: string
    phase: string
    totalHours: number
    capHours: number
    expHours: number
    developerCount: number
    entries: number
  }>
  developers: Array<{
    name: string
    totalHours: number
    capHours: number
  }>
  phaseDistribution: {
    preliminary: { hours: number; projects: number }
    application_development: { hours: number; projects: number }
    post_implementation: { hours: number; projects: number }
  }
  modelStats: {
    totalEntries: number
    localModelEntries: number
    fallbackEntries: number
    fallbackRate: number
    avgConfidence: number
    flaggedEntries: number
  }
  compliance: {
    confirmationRate: number
    manualEntryCount: number
    outlierCount: number
  }
  workTypeDistribution?: Record<string, number>
  previousMonth?: {
    totalHours: number
    capHours: number
    expHours: number
  }
}

export interface ProjectNarrativeContext {
  project: {
    name: string
    description: string | null
    phase: string
    status: string
    managementAuthorized: boolean
    authorizationDate: string | null
    probableToComplete: boolean
    goLiveDate: string | null
    businessJustification: string | null
  }
  period: {
    from: string
    to: string
    label: string // e.g. "Q1 2026"
  }
  totalHours: number
  capHours: number
  expHours: number
  developers: Array<{
    name: string
    hours: number
    capHours: number
  }>
  monthlyProgression: Array<{
    month: string
    totalHours: number
    capHours: number
    developerCount: number
  }>
  phaseChanges: Array<{
    fromPhase: string
    toPhase: string
    date: string
    reason: string | null
  }>
  confirmationStats: {
    totalEntries: number
    confirmedEntries: number
    approvedEntries: number
    flaggedEntries: number
    avgConfidence: number
  }
  workTypeDistribution?: Record<string, number>
}

// ---- Prompt builders ----

function formatPhaseLabel(phase: string): string {
  switch (phase) {
    case 'preliminary': return 'Preliminary'
    case 'application_development': return 'Application Development'
    case 'post_implementation': return 'Post-Implementation'
    default: return phase
  }
}

function formatWorkTypeDistribution(dist: Record<string, number>): string {
  const entries = Object.entries(dist).sort(([, a], [, b]) => b - a)
  if (entries.length === 0) return 'No work type data available.'
  return entries.map(([type, hours]) => `- ${type}: ${hours.toFixed(1)} hours`).join('\n')
}

/**
 * Build the LLM prompt for generating a monthly executive summary.
 */
export function buildMonthlySummaryPrompt(ctx: MonthlySummaryContext): string {
  const projectSection = ctx.projects.length > 0
    ? ctx.projects.map(p =>
      `- ${p.name} (${formatPhaseLabel(p.phase)}): ${p.totalHours.toFixed(1)}h total, ${p.capHours.toFixed(1)}h capitalizable, ${p.expHours.toFixed(1)}h expensed, ${p.developerCount} developer(s), ${p.entries} entries`
    ).join('\n')
    : 'No project activity this month.'

  const developerSection = ctx.developers.length > 0
    ? ctx.developers.map(d =>
      `- ${d.name}: ${d.totalHours.toFixed(1)}h total, ${d.capHours.toFixed(1)}h capitalizable`
    ).join('\n')
    : 'No developer activity this month.'

  const phaseSection = [
    `- Preliminary: ${ctx.phaseDistribution.preliminary.hours.toFixed(1)}h across ${ctx.phaseDistribution.preliminary.projects} project(s)`,
    `- Application Development: ${ctx.phaseDistribution.application_development.hours.toFixed(1)}h across ${ctx.phaseDistribution.application_development.projects} project(s)`,
    `- Post-Implementation: ${ctx.phaseDistribution.post_implementation.hours.toFixed(1)}h across ${ctx.phaseDistribution.post_implementation.projects} project(s)`,
  ].join('\n')

  const modelSection = [
    `- Total AI-generated entries: ${ctx.modelStats.totalEntries}`,
    `- Local model entries: ${ctx.modelStats.localModelEntries}`,
    `- Fallback model entries: ${ctx.modelStats.fallbackEntries}`,
    `- Fallback rate: ${(ctx.modelStats.fallbackRate * 100).toFixed(1)}%`,
    `- Average confidence: ${(ctx.modelStats.avgConfidence * 100).toFixed(1)}%`,
    `- Flagged entries (outliers): ${ctx.modelStats.flaggedEntries}`,
  ].join('\n')

  const complianceSection = [
    `- Confirmation rate: ${(ctx.compliance.confirmationRate * 100).toFixed(1)}%`,
    `- Manual entries: ${ctx.compliance.manualEntryCount}`,
    `- Outlier-flagged entries: ${ctx.compliance.outlierCount}`,
  ].join('\n')

  const workTypeSection = ctx.workTypeDistribution
    ? `## Work Type Distribution\n${formatWorkTypeDistribution(ctx.workTypeDistribution)}`
    : ''

  const momSection = ctx.previousMonth
    ? `## Previous Month Comparison
- Previous month: ${ctx.previousMonth.totalHours.toFixed(1)}h total, ${ctx.previousMonth.capHours.toFixed(1)}h capitalizable, ${ctx.previousMonth.expHours.toFixed(1)}h expensed
- Current month: ${ctx.totalHours.toFixed(1)}h total, ${ctx.capHours.toFixed(1)}h capitalizable, ${ctx.expHours.toFixed(1)}h expensed
- Hours change: ${((ctx.totalHours - ctx.previousMonth.totalHours) / (ctx.previousMonth.totalHours || 1) * 100).toFixed(1)}%
- Cap hours change: ${((ctx.capHours - ctx.previousMonth.capHours) / (ctx.previousMonth.capHours || 1) * 100).toFixed(1)}%`
    : ''

  return `You are an AI assistant generating a monthly executive summary for software capitalization tracking under ASC 350-40 / ASU 2025-06.

## Period
${ctx.monthName} (${ctx.year}-${String(ctx.month).padStart(2, '0')})

## Overall Summary
- Total hours: ${ctx.totalHours.toFixed(1)}
- Capitalizable hours: ${ctx.capHours.toFixed(1)}
- Expensed hours: ${ctx.expHours.toFixed(1)}
- Capitalization percentage: ${ctx.capPercentage.toFixed(1)}%

## Projects
${projectSection}

## Developers
${developerSection}

## Phase Distribution (ASC 350-40)
${phaseSection}

## AI Model Reliability
${modelSection}

## Compliance Metrics
${complianceSection}

${workTypeSection}

${momSection}

## Instructions
Generate a structured executive summary for this month's software capitalization activity. The audience is accounting/finance leadership who need to understand the capitalization position and any risks.

Respond with a JSON object:
\`\`\`json
{
  "executiveSummary": "2-3 sentence overview of the month's capitalization activity, total hours, and key trends",
  "projectHighlights": [
    {"project": "Project Name", "narrative": "1-2 sentences about the project's activity and capitalization status"}
  ],
  "phaseDistributionNarrative": "1-2 sentences explaining how hours are distributed across ASC 350-40 phases and what that means for capitalization",
  "complianceNotes": "1-2 sentences about the confirmation rate, any flagged entries, and overall data quality",
  "modelReliabilityNarrative": "1-2 sentences about AI model performance — fallback rate, confidence levels, and any concerns",
  "recommendations": ["Actionable recommendation 1", "Actionable recommendation 2"],
  "monthOverMonthChanges": "1-2 sentences comparing to previous month if data is available, or noting this is the first tracked month"
}
\`\`\`

Keep the tone professional and suitable for an accounting/audit audience. Reference specific numbers from the data above. If there is no activity, note that clearly.`
}

/**
 * Build the LLM prompt for generating an auditor-ready project narrative.
 */
export function buildProjectNarrativePrompt(ctx: ProjectNarrativeContext): string {
  const projectDetails = [
    `- Name: ${ctx.project.name}`,
    ctx.project.description ? `- Description: ${ctx.project.description}` : null,
    `- Phase: ${formatPhaseLabel(ctx.project.phase)}`,
    `- Status: ${ctx.project.status}`,
    `- Management Authorized: ${ctx.project.managementAuthorized ? 'Yes' : 'No'}`,
    ctx.project.authorizationDate ? `- Authorization Date: ${ctx.project.authorizationDate}` : null,
    `- Probable to Complete: ${ctx.project.probableToComplete ? 'Yes' : 'No'}`,
    ctx.project.goLiveDate ? `- Go-Live Date: ${ctx.project.goLiveDate}` : null,
    ctx.project.businessJustification ? `- Business Justification: ${ctx.project.businessJustification}` : null,
  ].filter(Boolean).join('\n')

  const developerSection = ctx.developers.length > 0
    ? ctx.developers.map(d =>
      `- ${d.name}: ${d.hours.toFixed(1)}h total, ${d.capHours.toFixed(1)}h capitalizable`
    ).join('\n')
    : 'No developer activity in this period.'

  const progressionSection = ctx.monthlyProgression.length > 0
    ? ctx.monthlyProgression.map(m =>
      `- ${m.month}: ${m.totalHours.toFixed(1)}h total, ${m.capHours.toFixed(1)}h capitalizable, ${m.developerCount} developer(s)`
    ).join('\n')
    : 'No monthly progression data available.'

  const phaseChangesSection = ctx.phaseChanges.length > 0
    ? ctx.phaseChanges.map(pc =>
      `- ${pc.date}: ${formatPhaseLabel(pc.fromPhase)} -> ${formatPhaseLabel(pc.toPhase)}${pc.reason ? ` (Reason: ${pc.reason})` : ''}`
    ).join('\n')
    : 'No phase changes during this period.'

  const confirmationSection = [
    `- Total entries: ${ctx.confirmationStats.totalEntries}`,
    `- Confirmed entries: ${ctx.confirmationStats.confirmedEntries}`,
    `- Approved entries: ${ctx.confirmationStats.approvedEntries}`,
    `- Flagged entries: ${ctx.confirmationStats.flaggedEntries}`,
    `- Average AI confidence: ${(ctx.confirmationStats.avgConfidence * 100).toFixed(1)}%`,
  ].join('\n')

  const workTypeSection = ctx.workTypeDistribution
    ? `## Work Type Distribution\n${formatWorkTypeDistribution(ctx.workTypeDistribution)}`
    : ''

  return `You are an AI assistant generating an auditor-ready project narrative for software capitalization under ASC 350-40 / ASU 2025-06.

## Project Details
${projectDetails}

## Reporting Period
${ctx.period.label} (${ctx.period.from} to ${ctx.period.to})

## Hours Summary
- Total hours: ${ctx.totalHours.toFixed(1)}
- Capitalizable hours: ${ctx.capHours.toFixed(1)}
- Expensed hours: ${ctx.expHours.toFixed(1)}

## Developer Allocation
${developerSection}

## Monthly Progression
${progressionSection}

## Phase Changes
${phaseChangesSection}

## Confirmation & Approval Statistics
${confirmationSection}

${workTypeSection}

## Instructions
Generate a structured, auditor-ready narrative for this project that supports ASC 350-40 capitalization decisions. The audience is external auditors who need to verify the capitalization methodology is properly applied.

Focus on:
1. **Phase justification**: Why is the current phase correct? Reference management authorization, go-live dates, and completion probability.
2. **Developer allocation**: What does the staffing pattern indicate about the nature of the work?
3. **Methodology compliance**: How well does the data quality support capitalization? Reference confirmation rates and flagged entries.
4. **Risk factors**: Any concerns an auditor should be aware of (low confidence, phase changes, etc.).

Respond with a JSON object:
\`\`\`json
{
  "narrativeSummary": "2-3 sentence overview of the project during the reporting period — what phase it was in, what work was performed, and total hours",
  "phaseJustification": "2-3 sentences explaining why the ASC 350-40 phase classification is appropriate for this project, referencing authorization status and project lifecycle milestones",
  "developerAllocation": "1-2 sentences describing the developer staffing pattern and what it indicates about the work being performed",
  "methodologyCompliance": "2-3 sentences about data quality — confirmation rates, approval workflow adherence, and any anomalies that were resolved",
  "riskFactors": "1-2 sentences identifying any risks an auditor should consider — phase transitions, flagged entries, low confidence scores, etc. State 'No material risk factors identified.' if none"
}
\`\`\`

Keep the tone formal and suitable for audit documentation. Reference specific numbers from the data above. If data is sparse, note that and explain what it means for the capitalization position.`
}
