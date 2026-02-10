import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgent } from '@/lib/agent-auth'
import { prisma } from '@/lib/prisma'

export interface AgentRemoteConfig {
  configVersion: number
  syncSchedule: {
    weekday: string
    weekend: string
  }
  generateSchedule: string
  // Per-agent settings
  claudeDataDirs: string[]
  excludePaths: string[]
  // Version info
  latestVersion: string
  minSupportedVersion: string
  updateUrl: string
}

// GET /api/agent/config — Return server-managed agent configuration
export async function GET(request: NextRequest) {
  const auth = await authenticateAgent(request)
  if (!auth) {
    return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 })
  }

  try {
    const settings = await prisma.systemSetting.findMany({
      where: {
        key: { startsWith: 'agent.' },
      },
    })

    const map = new Map(settings.map((s) => [s.key, s.value]))

    const config: AgentRemoteConfig = {
      configVersion: parseInt(map.get('agent.configVersion') ?? '1', 10),
      syncSchedule: {
        weekday: auth.agentKey.syncScheduleWeekday ?? map.get('agent.syncSchedule.weekday') ?? 'Mon..Fri 08,10,12,14,16,18,23:00',
        weekend: auth.agentKey.syncScheduleWeekend ?? map.get('agent.syncSchedule.weekend') ?? 'Sat,Sun 12,23:00',
      },
      generateSchedule: map.get('agent.generateSchedule') ?? '*-*-* 07:00:00',
      // Per-agent settings from the AgentKey record
      claudeDataDirs: auth.agentKey.claudeDataDirs,
      excludePaths: auth.agentKey.excludePaths,
      // Version info from system settings
      latestVersion: map.get('agent.latestVersion') ?? '0.1.0',
      minSupportedVersion: map.get('agent.minSupportedVersion') ?? '0.1.0',
      updateUrl: map.get('agent.updateUrl') ?? 'https://github.com/scottschatz/software-capitalization',
    }

    return NextResponse.json(config)
  } catch (err) {
    console.error('Error fetching agent config:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
