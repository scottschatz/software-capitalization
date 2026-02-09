import { prisma } from '@/lib/prisma'
import { completeWithFallback } from '@/lib/ai/client'
import {
  buildMonthlySummaryPrompt,
  buildProjectNarrativePrompt,
  type MonthlySummaryContext,
  type ProjectNarrativeContext,
} from '@/lib/ai/prompts-report'
import {
  aggregateByProject,
  aggregateByDeveloper,
  queryDailyEntries,
} from '@/lib/reports/query-builder'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import type { Prisma } from '@/generated/prisma/client'

// ---- Helpers ----

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * Parse JSON from AI response text.
 * Handles raw JSON and ```json code blocks.
 */
function parseJsonResponse(text: string): Record<string, unknown> | null {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null

  const jsonStr = jsonMatch[1] ?? jsonMatch[0]
  try {
    const parsed = JSON.parse(jsonStr)
    return typeof parsed === 'object' && parsed !== null ? parsed : null
  } catch {
    return null
  }
}

/**
 * Build date range for a given year/month.
 */
function getMonthRange(year: number, month: number) {
  const monthDate = new Date(year, month - 1, 1)
  const startDate = format(startOfMonth(monthDate), 'yyyy-MM-dd')
  const endDate = format(endOfMonth(monthDate), 'yyyy-MM-dd')
  return { startDate, endDate }
}

// ---- Monthly Executive Summary ----

/**
 * Build the structured data context for a monthly executive summary.
 * Exported so API routes can return data-only mode without calling the LLM.
 */
export async function buildMonthlySummaryContext(
  year: number,
  month: number,
): Promise<MonthlySummaryContext> {
  const { startDate, endDate } = getMonthRange(year, month)
  const filters = { startDate, endDate }

  // Fetch aggregated data
  const [byProject, byDeveloper, dailyEntries] = await Promise.all([
    aggregateByProject(filters),
    aggregateByDeveloper(filters),
    queryDailyEntries(filters),
  ])

  const totalHours = byProject.reduce((s, p) => s + p.totalHours, 0)
  const capHours = byProject.reduce((s, p) => s + p.capHours, 0)
  const expHours = byProject.reduce((s, p) => s + p.expHours, 0)
  const capPercentage = totalHours > 0 ? (capHours / totalHours) * 100 : 0

  // Compute model stats from daily entries
  const totalEntries = dailyEntries.length
  const fallbackEntries = dailyEntries.filter(e => e.modelFallback).length
  const localModelEntries = totalEntries - fallbackEntries
  const fallbackRate = totalEntries > 0 ? fallbackEntries / totalEntries : 0
  const flaggedEntries = dailyEntries.filter(e => e.status === 'flagged').length

  // Average confidence: parse from descriptionConfirmed or descriptionAuto JSON if available
  // For now, use a simple heuristic — entries with confirmed hours have higher confidence
  const confirmedEntries = dailyEntries.filter(e => e.status === 'confirmed' || e.status === 'approved')
  const avgConfidence = totalEntries > 0 ? confirmedEntries.length / totalEntries : 0

  // Compliance metrics
  const confirmationRate = totalEntries > 0 ? confirmedEntries.length / totalEntries : 0
  const outlierCount = dailyEntries.filter(e => e.status === 'flagged' || e.status === 'disputed').length

  // Manual entries count
  const manualEntryCount = await prisma.manualEntry.count({
    where: {
      date: {
        gte: new Date(`${startDate}T00:00:00.000Z`),
        lte: new Date(`${endDate}T23:59:59.999Z`),
      },
    },
  })

  // Work type distribution from DailyEntry.workType
  const workTypeMap: Record<string, number> = {}
  for (const entry of dailyEntries) {
    const hours = entry.hoursConfirmed ?? entry.hoursEstimated ?? 0
    // Access workType through a raw query since queryDailyEntries doesn't return it
    // We'll query it separately
    if (hours > 0) {
      // default to 'unclassified'
      const wt = 'unclassified'
      workTypeMap[wt] = (workTypeMap[wt] ?? 0) + hours
    }
  }

  // Query work type distribution directly
  const workTypeEntries = await prisma.dailyEntry.findMany({
    where: {
      date: {
        gte: new Date(`${startDate}T00:00:00.000Z`),
        lte: new Date(`${endDate}T23:59:59.999Z`),
      },
      workType: { not: null },
    },
    select: {
      workType: true,
      hoursConfirmed: true,
      hoursEstimated: true,
    },
  })

  const workTypeDistribution: Record<string, number> = {}
  for (const entry of workTypeEntries) {
    const hours = entry.hoursConfirmed ?? entry.hoursEstimated ?? 0
    const wt = entry.workType ?? 'unclassified'
    workTypeDistribution[wt] = (workTypeDistribution[wt] ?? 0) + hours
  }

  // Phase distribution: compute from project-level aggregations
  // We need to look up the actual phase for each project
  const projectPhases = await prisma.project.findMany({
    select: { name: true, phase: true },
  })
  const phaseByName = new Map(projectPhases.map(p => [p.name, p.phase]))

  const phaseDistribution = {
    preliminary: { hours: 0, projects: 0 },
    application_development: { hours: 0, projects: 0 },
    post_implementation: { hours: 0, projects: 0 },
  }

  const phaseProjectSets = {
    preliminary: new Set<string>(),
    application_development: new Set<string>(),
    post_implementation: new Set<string>(),
  }

  for (const proj of byProject) {
    const phase = phaseByName.get(proj.projectName) ?? 'preliminary'
    const key = phase as keyof typeof phaseDistribution
    if (phaseDistribution[key]) {
      phaseDistribution[key].hours += proj.totalHours
      phaseProjectSets[key].add(proj.projectName)
    }
  }

  for (const key of Object.keys(phaseDistribution) as Array<keyof typeof phaseDistribution>) {
    phaseDistribution[key].projects = phaseProjectSets[key].size
  }

  // Developer breakdown per project — compute developerCount from daily entries
  const projectDeveloperCounts = new Map<string, Set<string>>()
  for (const entry of dailyEntries) {
    const pName = entry.projectName ?? 'Unassigned'
    if (!projectDeveloperCounts.has(pName)) {
      projectDeveloperCounts.set(pName, new Set())
    }
    projectDeveloperCounts.get(pName)!.add(entry.developerName)
  }

  // Previous month data
  let previousMonth: MonthlySummaryContext['previousMonth'] = undefined
  const prevMonth = month === 1 ? 12 : month - 1
  const prevYear = month === 1 ? year - 1 : year
  const prevRange = getMonthRange(prevYear, prevMonth)
  const prevFilters = { startDate: prevRange.startDate, endDate: prevRange.endDate }

  try {
    const prevByProject = await aggregateByProject(prevFilters)
    const prevTotal = prevByProject.reduce((s, p) => s + p.totalHours, 0)
    const prevCap = prevByProject.reduce((s, p) => s + p.capHours, 0)
    const prevExp = prevByProject.reduce((s, p) => s + p.expHours, 0)
    if (prevTotal > 0) {
      previousMonth = { totalHours: prevTotal, capHours: prevCap, expHours: prevExp }
    }
  } catch {
    // No previous month data — that's fine
  }

  return {
    year,
    month,
    monthName: `${MONTH_NAMES[month - 1]} ${year}`,
    totalHours,
    capHours,
    expHours,
    capPercentage,
    projects: byProject.map(p => ({
      name: p.projectName,
      phase: phaseByName.get(p.projectName) ?? 'preliminary',
      totalHours: p.totalHours,
      capHours: p.capHours,
      expHours: p.expHours,
      developerCount: projectDeveloperCounts.get(p.projectName)?.size ?? 0,
      entries: p.entries,
    })),
    developers: byDeveloper.map(d => ({
      name: d.developerName,
      totalHours: d.totalHours,
      capHours: d.capHours,
    })),
    phaseDistribution,
    modelStats: {
      totalEntries,
      localModelEntries,
      fallbackEntries,
      fallbackRate,
      avgConfidence,
      flaggedEntries,
    },
    compliance: {
      confirmationRate,
      manualEntryCount,
      outlierCount,
    },
    workTypeDistribution: Object.keys(workTypeDistribution).length > 0 ? workTypeDistribution : undefined,
    previousMonth,
  }
}

/**
 * Generate a monthly executive summary using AI.
 */
export async function generateMonthlySummary(
  year: number,
  month: number,
  generatedById?: string,
): Promise<{
  reportId: string
  narrative: Record<string, unknown>
  modelUsed: string
  fallback: boolean
}> {
  const ctx = await buildMonthlySummaryContext(year, month)
  const prompt = buildMonthlySummaryPrompt(ctx)
  const result = await completeWithFallback(prompt, { maxTokens: 4096 })

  const narrative = parseJsonResponse(result.text)
  if (!narrative) {
    throw new Error('Failed to parse AI response as JSON for monthly summary')
  }

  // Upsert the MonthlyExecutiveSummary record
  const record = await prisma.monthlyExecutiveSummary.upsert({
    where: { year_month: { year, month } },
    create: {
      year,
      month,
      reportData: narrative as unknown as Prisma.InputJsonValue,
      modelUsed: result.modelUsed,
      modelFallback: result.fallback,
      status: 'draft',
      generatedById: generatedById ?? null,
    },
    update: {
      reportData: narrative as unknown as Prisma.InputJsonValue,
      modelUsed: result.modelUsed,
      modelFallback: result.fallback,
      status: 'draft',
      generatedById: generatedById ?? null,
    },
  })

  return {
    reportId: record.id,
    narrative,
    modelUsed: result.modelUsed,
    fallback: result.fallback,
  }
}

// ---- Project Narrative ----

/**
 * Generate an auditor-ready project narrative using AI.
 */
export async function generateProjectNarrative(
  projectId: string,
  from: string,
  to: string,
): Promise<{
  narrative: Record<string, unknown>
  modelUsed: string
  fallback: boolean
}> {
  // Look up the project with all relevant fields
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      name: true,
      description: true,
      phase: true,
      status: true,
      managementAuthorized: true,
      authorizationDate: true,
      probableToComplete: true,
      goLiveDate: true,
      businessJustification: true,
    },
  })

  if (!project) {
    throw new Error(`Project not found: ${projectId}`)
  }

  // Query entries for date range
  const filters = { startDate: from, endDate: to, projectId }
  const dailyEntries = await queryDailyEntries(filters)

  // Compute totals
  let totalHours = 0
  let capHours = 0
  for (const entry of dailyEntries) {
    const hours = entry.hoursConfirmed ?? entry.hoursEstimated ?? 0
    totalHours += hours
    if (entry.capitalizable) capHours += hours
  }

  // Also include manual entries
  const manualEntries = await prisma.manualEntry.findMany({
    where: {
      projectId,
      date: {
        gte: new Date(`${from}T00:00:00.000Z`),
        lte: new Date(`${to}T23:59:59.999Z`),
      },
    },
    include: {
      developer: { select: { displayName: true } },
      project: { select: { managementAuthorized: true, probableToComplete: true, status: true } },
    },
  })

  for (const entry of manualEntries) {
    totalHours += entry.hours
    const authorized = entry.project.managementAuthorized && entry.project.probableToComplete
    const active = entry.project.status !== 'abandoned' && entry.project.status !== 'suspended'
    if (entry.phase === 'application_development' && authorized && active) {
      capHours += entry.hours
    }
  }

  const expHours = totalHours - capHours

  // Developer allocation
  const devMap = new Map<string, { name: string; hours: number; capHours: number }>()
  for (const entry of dailyEntries) {
    const hours = entry.hoursConfirmed ?? entry.hoursEstimated ?? 0
    const existing = devMap.get(entry.developerName) ?? { name: entry.developerName, hours: 0, capHours: 0 }
    existing.hours += hours
    if (entry.capitalizable) existing.capHours += hours
    devMap.set(entry.developerName, existing)
  }
  for (const entry of manualEntries) {
    const name = entry.developer.displayName
    const existing = devMap.get(name) ?? { name, hours: 0, capHours: 0 }
    existing.hours += entry.hours
    const authorized = entry.project.managementAuthorized && entry.project.probableToComplete
    const active = entry.project.status !== 'abandoned' && entry.project.status !== 'suspended'
    if (entry.phase === 'application_development' && authorized && active) {
      existing.capHours += entry.hours
    }
    devMap.set(name, existing)
  }
  const developers = Array.from(devMap.values()).sort((a, b) => b.hours - a.hours)

  // Monthly progression — group entries by month
  const monthlyMap = new Map<string, { totalHours: number; capHours: number; devs: Set<string> }>()
  for (const entry of dailyEntries) {
    const monthKey = new Date(entry.date).toISOString().slice(0, 7) // YYYY-MM
    const existing = monthlyMap.get(monthKey) ?? { totalHours: 0, capHours: 0, devs: new Set() }
    const hours = entry.hoursConfirmed ?? entry.hoursEstimated ?? 0
    existing.totalHours += hours
    if (entry.capitalizable) existing.capHours += hours
    existing.devs.add(entry.developerName)
    monthlyMap.set(monthKey, existing)
  }
  const monthlyProgression = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, data]) => ({
      month,
      totalHours: data.totalHours,
      capHours: data.capHours,
      developerCount: data.devs.size,
    }))

  // Phase changes from ProjectHistory
  const phaseChanges = await prisma.projectHistory.findMany({
    where: {
      projectId,
      field: 'phase',
      changedAt: {
        gte: new Date(`${from}T00:00:00.000Z`),
        lte: new Date(`${to}T23:59:59.999Z`),
      },
    },
    orderBy: { changedAt: 'asc' },
  })

  // Confirmation stats
  const confirmedCount = dailyEntries.filter(e => e.status === 'confirmed' || e.status === 'approved').length
  const approvedCount = dailyEntries.filter(e => e.status === 'approved').length
  const flaggedCount = dailyEntries.filter(e => e.status === 'flagged').length
  const avgConfidence = dailyEntries.length > 0 ? confirmedCount / dailyEntries.length : 0

  // Work type distribution
  const workTypeEntries = await prisma.dailyEntry.findMany({
    where: {
      projectId,
      date: {
        gte: new Date(`${from}T00:00:00.000Z`),
        lte: new Date(`${to}T23:59:59.999Z`),
      },
      workType: { not: null },
    },
    select: {
      workType: true,
      hoursConfirmed: true,
      hoursEstimated: true,
    },
  })

  const workTypeDistribution: Record<string, number> = {}
  for (const entry of workTypeEntries) {
    const hours = entry.hoursConfirmed ?? entry.hoursEstimated ?? 0
    const wt = entry.workType ?? 'unclassified'
    workTypeDistribution[wt] = (workTypeDistribution[wt] ?? 0) + hours
  }

  // Determine period label (e.g., "Q1 2026", "January 2026", etc.)
  const fromDate = new Date(from)
  const toDate = new Date(to)
  const fromMonth = fromDate.getMonth()
  const toMonth = toDate.getMonth()
  const fromYear = fromDate.getFullYear()
  const toYear = toDate.getFullYear()

  let periodLabel: string
  if (fromYear === toYear && toMonth - fromMonth === 2 && fromMonth % 3 === 0) {
    // Quarter
    const quarter = Math.floor(fromMonth / 3) + 1
    periodLabel = `Q${quarter} ${fromYear}`
  } else if (fromYear === toYear && fromMonth === toMonth) {
    periodLabel = `${MONTH_NAMES[fromMonth]} ${fromYear}`
  } else {
    periodLabel = `${MONTH_NAMES[fromMonth]} ${fromYear} - ${MONTH_NAMES[toMonth]} ${toYear}`
  }

  const ctx: ProjectNarrativeContext = {
    project: {
      name: project.name,
      description: project.description,
      phase: project.phase,
      status: project.status,
      managementAuthorized: project.managementAuthorized,
      authorizationDate: project.authorizationDate
        ? format(project.authorizationDate, 'yyyy-MM-dd')
        : null,
      probableToComplete: project.probableToComplete,
      goLiveDate: project.goLiveDate
        ? format(project.goLiveDate, 'yyyy-MM-dd')
        : null,
      businessJustification: project.businessJustification,
    },
    period: {
      from,
      to,
      label: periodLabel,
    },
    totalHours,
    capHours,
    expHours,
    developers,
    monthlyProgression,
    phaseChanges: phaseChanges.map(pc => ({
      fromPhase: pc.oldValue ?? 'unknown',
      toPhase: pc.newValue ?? 'unknown',
      date: format(pc.changedAt, 'yyyy-MM-dd'),
      reason: null, // ProjectHistory doesn't have a reason field directly
    })),
    confirmationStats: {
      totalEntries: dailyEntries.length,
      confirmedEntries: confirmedCount,
      approvedEntries: approvedCount,
      flaggedEntries: flaggedCount,
      avgConfidence,
    },
    workTypeDistribution: Object.keys(workTypeDistribution).length > 0 ? workTypeDistribution : undefined,
  }

  const prompt = buildProjectNarrativePrompt(ctx)
  const result = await completeWithFallback(prompt, { maxTokens: 4096 })

  const narrative = parseJsonResponse(result.text)
  if (!narrative) {
    throw new Error('Failed to parse AI response as JSON for project narrative')
  }

  return {
    narrative,
    modelUsed: result.modelUsed,
    fallback: result.fallback,
  }
}
