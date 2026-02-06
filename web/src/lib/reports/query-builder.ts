import { prisma } from '@/lib/prisma'
import type { Prisma } from '@/generated/prisma/client'

export interface ReportFilters {
  startDate: string // YYYY-MM-DD
  endDate: string   // YYYY-MM-DD
  developerId?: string
  projectId?: string
  status?: 'confirmed' | 'pending' | 'flagged' | 'disputed'
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
  phaseConfirmed: string | null
  descriptionConfirmed: string | null
  status: string
  capitalizable: boolean
  confirmedAt: Date | null
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
  if (filters.status) where.status = filters.status

  const entries = await prisma.dailyEntry.findMany({
    where,
    include: {
      developer: { select: { displayName: true, email: true } },
      project: { select: { name: true, phase: true } },
    },
    orderBy: [{ date: 'asc' }, { developer: { displayName: 'asc' } }],
  })

  return entries.map((e) => ({
    id: e.id,
    date: e.date,
    developerName: e.developer.displayName,
    developerEmail: e.developer.email,
    projectName: e.project?.name ?? null,
    projectPhase: e.project?.phase ?? null,
    hoursEstimated: e.hoursEstimated,
    hoursConfirmed: e.hoursConfirmed,
    phaseConfirmed: e.phaseConfirmed,
    descriptionConfirmed: e.descriptionConfirmed,
    status: e.status,
    capitalizable: e.phaseConfirmed === 'application_development' ||
      (!e.phaseConfirmed && e.project?.phase === 'application_development'),
    confirmedAt: e.confirmedAt,
  }))
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

  const entries = await prisma.manualEntry.findMany({
    where,
    include: {
      developer: { select: { displayName: true, email: true } },
      project: { select: { name: true } },
    },
    orderBy: [{ date: 'asc' }, { developer: { displayName: 'asc' } }],
  })

  return entries.map((e) => ({
    id: e.id,
    date: e.date,
    developerName: e.developer.displayName,
    developerEmail: e.developer.email,
    projectName: e.project.name,
    hours: e.hours,
    phase: e.phase,
    description: e.description,
    capitalizable: e.phase === 'application_development',
  }))
}

/**
 * Aggregate hours by project for a date range.
 */
export async function aggregateByProject(filters: ReportFilters) {
  const daily = await queryDailyEntries({ ...filters, status: 'confirmed' })
  const manual = await queryManualEntries(filters)

  const byProject = new Map<string, {
    projectName: string
    totalHours: number
    capHours: number
    expHours: number
    entries: number
  }>()

  for (const entry of daily) {
    const key = entry.projectName ?? 'Unassigned'
    const existing = byProject.get(key) ?? { projectName: key, totalHours: 0, capHours: 0, expHours: 0, entries: 0 }
    const hours = entry.hoursConfirmed ?? 0
    existing.totalHours += hours
    if (entry.capitalizable) existing.capHours += hours
    else existing.expHours += hours
    existing.entries++
    byProject.set(key, existing)
  }

  for (const entry of manual) {
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
 * Aggregate hours by developer for a date range.
 */
export async function aggregateByDeveloper(filters: ReportFilters) {
  const daily = await queryDailyEntries({ ...filters, status: 'confirmed' })
  const manual = await queryManualEntries(filters)

  const byDev = new Map<string, {
    developerName: string
    developerEmail: string
    totalHours: number
    capHours: number
    expHours: number
  }>()

  for (const entry of daily) {
    const key = entry.developerEmail
    const existing = byDev.get(key) ?? { developerName: entry.developerName, developerEmail: key, totalHours: 0, capHours: 0, expHours: 0 }
    const hours = entry.hoursConfirmed ?? 0
    existing.totalHours += hours
    if (entry.capitalizable) existing.capHours += hours
    else existing.expHours += hours
    byDev.set(key, existing)
  }

  for (const entry of manual) {
    const key = entry.developerEmail
    const existing = byDev.get(key) ?? { developerName: entry.developerName, developerEmail: key, totalHours: 0, capHours: 0, expHours: 0 }
    existing.totalHours += entry.hours
    if (entry.capitalizable) existing.capHours += entry.hours
    else existing.expHours += entry.hours
    byDev.set(key, existing)
  }

  return Array.from(byDev.values()).sort((a, b) => b.totalHours - a.totalHours)
}
