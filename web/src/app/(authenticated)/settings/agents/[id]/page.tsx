import { requireDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { AgentDetailClient } from '@/components/settings/agent-detail-client'

export default async function AgentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const developer = await requireDeveloper()
  const { id } = await params

  const agentKey = await prisma.agentKey.findFirst({
    where: { id, developerId: developer.id, active: true },
    include: {
      syncLogs: {
        orderBy: { startedAt: 'desc' },
        take: 10,
      },
    },
  })

  if (!agentKey) notFound()

  // Fetch global schedule for fallback display
  const globalSettings = await prisma.systemSetting.findMany({
    where: { key: { startsWith: 'agent.syncSchedule' } },
  })
  const settingsMap = Object.fromEntries(globalSettings.map(s => [s.key, s.value]))

  return (
    <AgentDetailClient
      agentKey={JSON.parse(JSON.stringify(agentKey))}
      globalSchedule={{
        weekday: settingsMap['agent.syncSchedule.weekday'] ?? 'Mon..Fri 08,10,12,14,16,18,23:00',
        weekend: settingsMap['agent.syncSchedule.weekend'] ?? 'Sat,Sun 12,23:00',
      }}
    />
  )
}
