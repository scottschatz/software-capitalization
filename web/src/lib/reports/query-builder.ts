import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma/client'

export interface ReportFilters {
  startDate: string // YYYY-MM-DD
  endDate: string   // YYYY-MM-DD
  developerId?: string
  projectId?: string
  status?: 'confirmed' | 'pending' | 'flagged' | 'disputed' | 'approved'
  statuses?: string[]
}

export interface DailyEntryRow {
  id: string
  date: Date
  developerName: string
  developerEmail: string
  projectName: string | null
  projectPhase: string | null
  hoursEstimated: number | null
  hoursConfirmed: number | null
  hoursRaw: number | null
  adjustmentFactor: number | null
  adjustmentReason: string | null
  modelUsed: string | null
  modelFallback: boolean
  confirmedBy: string | null
  confirmationMethod: string | null
  revisionCount: number
  phaseConfirmed: string | null
  descriptionConfirmed: string | null
  workType: string | null
  status: string
  capitalizable: boolean
  projectAuthorized: boolean
  confirmedAt: Date | null
  requiresManagerApproval: boolean
}

export interface ManualEntryRow {
  id: string
  date: Date
  developerName: string
  developerEmail: string
  projectName: string
  hours: number
  phase: string
  description: string
  capitalizable: boolean
  status: string
  approvedBy: string | null
  approvedAt: Date | null
}

/**
 * Query daily entries with filters for reporting.
 */
export async function queryDailyEntries(filters: ReportFilters): Promise<DailyEntryRow[]> {
  const where: Prisma.DailyEntryWhereInput = {
    date: {
      gte: new Date(`${filters.startDate}T00:00:00.000Z`),
      lte: new Date(`${filters.endDate}T23:59:59.999Z`),
    },
  }

  if (filters.developerId) where.developerId = filters.developerId
  if (filters.projectId) where.projectId = filters.projectId
  if (filters.statuses) where.status = { in: filters.statuses }
  else if (filters.status) where.status = filters.status

  const entries = await prisma.dailyEntry.findMany({
    where,
    include: {
      developer: { select: { displayName: true, email: true } },
      confirmedBy: { select: { displayName: true } },
      project: { select: { name: true, phase: true, managementAuthorized: true, probableToComplete: true, authorizationDate: true, status: true, requiresManagerApproval: true } },
      _count: { select: { revisions: true } },
    },
    orderBy: [{ date: 'asc' }, { developer: { displayName: 'asc' } }],
  })

  return entries.map((e) => {
    const phaseIsCapitalizable = e.phaseConfirmed === 'application_development' ||
      (!e.phaseConfirmed && e.project?.phase === 'application_development')
    // ASU 2025-06: project must be authorized and probable to complete
    // Date-aware: authorization only applies from authorizationDate onward
    const authorizedAtDate = e.project?.managementAuthorized === true
      && (e.project.authorizationDate === null || e.project.authorizationDate <= e.date)
    const projectAuthorized = authorizedAtDate && e.project?.probableToComplete === true
    const projectActive = e.project?.status !== 'abandoned' && e.project?.status !== 'suspended'

    return {
      id: e.id,
      date: e.date,
      developerName: e.developer.displayName,
      developerEmail: e.developer.email,
      projectName: e.project?.name ?? null,
      projectPhase: e.project?.phase ?? null,
      hoursEstimated: e.hoursEstimated,
      hoursConfirmed: e.hoursConfirmed,
      hoursRaw: e.hoursRaw,
      adjustmentFactor: e.adjustmentFactor,
      adjustmentReason: e.adjustmentReason,
      modelUsed: e.modelUsed,
      modelFallback: e.modelFallback,
      confirmedBy: e.confirmedBy?.displayName ?? null,
      confirmationMethod: e.confirmationMethod,
      revisionCount: e._count.revisions,
      phaseConfirmed: e.phaseConfirmed,
      descriptionConfirmed: e.descriptionConfirmed,
      workType: e.workType ?? null,
      status: e.status,
      capitalizable: phaseIsCapitalizable && projectAuthorized && projectActive,
      projectAuthorized,
      confirmedAt: e.confirmedAt,
      requiresManagerApproval: e.project?.requiresManagerApproval ?? false,
    }
  })
}

/**
 * Query manual entries with filters for reporting.
 */
export async function queryManualEntries(filters: ReportFilters): Promise<ManualEntryRow[]> {
  const where: Prisma.ManualEntryWhereInput = {
    date: {
      gte: new Date(`${filters.startDate}T00:00:00.000Z`),
      lte: new Date(`${filters.endDate}T23:59:59.999Z`),
    },
  }

  if (filters.developerId) where.developerId = filters.developerId
  if (filters.projectId) where.projectId = filters.projectId
  if (filters.statuses) where.status = { in: filters.statuses }
  else if (filters.status) where.status = filters.status

  const entries = await prisma.manualEntry.findMany({
    where,
    include: {
      developer: { select: { displayName: true, email: true } },
      project: { select: { name: true, managementAuthorized: true, probableToComplete: true, authorizationDate: true, status: true } },
      approvedBy: { select: { displayName: true } },
    },
    orderBy: [{ date: 'asc' }, { developer: { displayName: 'asc' } }],
  })

  return entries.map((e) => {
    // Date-aware: authorization only applies from authorizationDate onward
    const authorizedAtDate = e.project.managementAuthorized === true
      && (e.project.authorizationDate === null || e.project.authorizationDate <= e.date)
    const projectAuthorized = authorizedAtDate && e.project.probableToComplete === true
    const projectActive = e.project.status !== 'abandoned' && e.project.status !== 'suspended'
    return {
      id: e.id,
      date: e.date,
      developerName: e.developer.displayName,
      developerEmail: e.developer.email,
      projectName: e.project.name,
      hours: e.hours,
      phase: e.phase,
      description: e.description,
      capitalizable: e.phase === 'application_development' && projectAuthorized && projectActive,
      status: e.status,
      approvedBy: e.approvedBy?.displayName ?? null,
      approvedAt: e.approvedAt,
    }
  })
}

/**
 * Aggregate hours by project for a date range.
 */
export async function aggregateByProject(filters: ReportFilters) {
  const daily = await queryDailyEntries({ ...filters, status: undefined, statuses: ['confirmed', 'approved'] })
  const manual = await queryManualEntries(filters)

  // Filter: include confirmed entries, but for requiresManagerApproval projects, require approved
  const filteredDaily = daily.filter(e => {
    if (e.status === 'approved') return true
    if (e.status === 'confirmed' && !e.requiresManagerApproval) return true
    return false
  })

  // Filter manual entries: only include confirmed or approved (exclude pending_approval and rejected)
  const filteredManual = manual.filter(e => e.status === 'confirmed' || e.status === 'approved')

  const byProject = new Map<string, {
    projectName: string
    totalHours: number
    capHours: number
    expHours: number
    entries: number
  }>()

  for (const entry of filteredDaily) {
    const key = entry.projectName ?? 'Unassigned'
    const existing = byProject.get(key) ?? { projectName: key, totalHours: 0, capHours: 0, expHours: 0, entries: 0 }
    const hours = entry.hoursConfirmed ?? 0
    existing.totalHours += hours
    if (entry.capitalizable) existing.capHours += hours
    else existing.expHours += hours
    existing.entries++
    byProject.set(key, existing)
  }

  for (const entry of filteredManual) {
    const key = entry.projectName
    const existing = byProject.get(key) ?? { projectName: key, totalHours: 0, capHours: 0, expHours: 0, entries: 0 }
    existing.totalHours += entry.hours
    if (entry.capitalizable) existing.capHours += entry.hours
    else existing.expHours += entry.hours
    existing.entries++
    byProject.set(key, existing)
  }

  return Array.from(byProject.values()).sort((a, b) => b.totalHours - a.totalHours)
}

/**
 * Aggregate hours by work type for a date range.
 */
export async function aggregateByWorkType(filters: ReportFilters) {
  const daily = await queryDailyEntries({ ...filters, status: undefined, statuses: ['confirmed', 'approved'] })

  // Filter: include confirmed entries, but for requiresManagerApproval projects, require approved
  const filteredDaily = daily.filter(e => {
    if (e.status === 'approved') return true
    if (e.status === 'confirmed' && !e.requiresManagerApproval) return true
    return false
  })

  const byWorkType = new Map<string, {
    workType: string
    totalHours: number
    capHours: number
    expHours: number
    entries: number
  }>()

  for (const entry of filteredDaily) {
    const workType = entry.workType ?? 'unclassified'
    const existing = byWorkType.get(workType) ?? { workType, totalHours: 0, capHours: 0, expHours: 0, entries: 0 }
    const hours = entry.hoursConfirmed ?? 0
    existing.totalHours += hours
    if (entry.capitalizable) existing.capHours += hours
    else existing.expHours += hours
    existing.entries++
    byWorkType.set(workType, existing)
  }

  return Array.from(byWorkType.values()).sort((a, b) => b.totalHours - a.totalHours)
}

/**
 * Aggregate hours by developer for a date range.
 */
export async function aggregateByDeveloper(filters: ReportFilters) {
  const daily = await queryDailyEntries({ ...filters, status: undefined, statuses: ['confirmed', 'approved'] })
  const manual = await queryManualEntries(filters)

  // Filter: include confirmed entries, but for requiresManagerApproval projects, require approved
  const filteredDaily = daily.filter(e => {
    if (e.status === 'approved') return true
    if (e.status === 'confirmed' && !e.requiresManagerApproval) return true
    return false
  })

  // Filter manual entries: only include confirmed or approved (exclude pending_approval and rejected)
  const filteredManual = manual.filter(e => e.status === 'confirmed' || e.status === 'approved')

  const byDev = new Map<string, {
    developerName: string
    developerEmail: string
    totalHours: number
    capHours: number
    expHours: number
  }>()

  for (const entry of filteredDaily) {
    const key = entry.developerEmail
    const existing = byDev.get(key) ?? { developerName: entry.developerName, developerEmail: key, totalHours: 0, capHours: 0, expHours: 0 }
    const hours = entry.hoursConfirmed ?? 0
    existing.totalHours += hours
    if (entry.capitalizable) existing.capHours += hours
    else existing.expHours += hours
    byDev.set(key, existing)
  }

  for (const entry of filteredManual) {
    const key = entry.developerEmail
    const existing = byDev.get(key) ?? { developerName: entry.developerName, developerEmail: key, totalHours: 0, capHours: 0, expHours: 0 }
    existing.totalHours += entry.hours
    if (entry.capitalizable) existing.capHours += entry.hours
    else existing.expHours += entry.hours
    byDev.set(key, existing)
  }

  return Array.from(byDev.values()).sort((a, b) => b.totalHours - a.totalHours)
}
