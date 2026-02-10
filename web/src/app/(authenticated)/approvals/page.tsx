import { redirect } from 'next/navigation'
import { requireDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'
import { format } from 'date-fns'
import { ApprovalsClient } from '@/components/approvals/approvals-client'

export default async function ApprovalsPage() {
  const developer = await requireDeveloper()

  if (developer.role !== 'admin' && developer.role !== 'manager') {
    redirect('/')
  }

  // Fetch pending and flagged daily entries
  const pendingDailyEntries = await prisma.dailyEntry.findMany({
    where: {
      status: { in: ['pending_approval', 'flagged'] },
    },
    include: {
      developer: { select: { id: true, displayName: true, email: true } },
      project: { select: { id: true, name: true, phase: true } },
    },
    orderBy: [{ date: 'desc' }, { createdAt: 'asc' }],
  })

  // Fetch pending manual entries (pending_approval status)
  const pendingManualEntries = await prisma.manualEntry.findMany({
    where: {
      status: 'pending_approval',
    },
    include: {
      developer: { select: { id: true, displayName: true, email: true } },
      project: { select: { id: true, name: true, phase: true } },
    },
    orderBy: [{ date: 'desc' }, { createdAt: 'asc' }],
  })

  // Serialize for client component
  const serializedDaily = pendingDailyEntries.map((e) => ({
    id: e.id,
    type: 'daily' as const,
    date: format(e.date, 'yyyy-MM-dd'),
    developerName: e.developer.displayName,
    developerEmail: e.developer.email,
    developerId: e.developer.id,
    projectName: e.project?.name ?? 'Unassigned',
    hours: e.hoursConfirmed ?? e.hoursEstimated ?? 0,
    phase: e.phaseConfirmed ?? e.project?.phase ?? 'unknown',
    phaseEffective: e.phaseEffective ?? null,
    description: e.descriptionConfirmed ?? e.descriptionAuto ?? '',
    status: e.status,
  }))

  const serializedManual = pendingManualEntries.map((e) => ({
    id: e.id,
    type: 'manual' as const,
    date: format(e.date, 'yyyy-MM-dd'),
    developerName: e.developer.displayName,
    developerEmail: e.developer.email,
    developerId: e.developer.id,
    projectName: e.project?.name ?? 'Unassigned',
    hours: e.hours,
    phase: e.phase,
    phaseEffective: e.phaseEffective ?? null,
    description: e.description,
    status: e.status,
  }))

  const allPending = [...serializedDaily, ...serializedManual].sort(
    (a, b) => b.date.localeCompare(a.date) || a.developerName.localeCompare(b.developerName)
  )

  return (
    <ApprovalsClient
      entries={allPending}
      currentDeveloperId={developer.id}
    />
  )
}
