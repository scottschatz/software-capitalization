import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { revokeAgentKey, updateAgentKey } from '@/lib/actions/agent-key-actions'

type RouteParams = { params: Promise<{ id: string }> }

// PATCH /api/keys/[id] — Update agent key settings
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const developer = await getDeveloper()
  if (!developer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const data: {
    name?: string
    machineName?: string
    claudeDataDirs?: string[]
    excludePaths?: string[]
    syncScheduleWeekday?: string | null
    syncScheduleWeekend?: string | null
  } = {}
  if (typeof body.name === 'string') data.name = body.name
  if (typeof body.machineName === 'string') data.machineName = body.machineName
  if (Array.isArray(body.claudeDataDirs)) data.claudeDataDirs = body.claudeDataDirs
  if (Array.isArray(body.excludePaths)) data.excludePaths = body.excludePaths
  if (body.syncScheduleWeekday !== undefined) data.syncScheduleWeekday = body.syncScheduleWeekday || null
  if (body.syncScheduleWeekend !== undefined) data.syncScheduleWeekend = body.syncScheduleWeekend || null

  try {
    const updated = await updateAgentKey(id, developer.id, data)
    return NextResponse.json(updated)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

// DELETE /api/keys/[id] — Revoke an agent key
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const developer = await getDeveloper()
  if (!developer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  try {
    await revokeAgentKey(id, developer.id)
    return NextResponse.json({ success: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Revoke failed'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
