import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { revokeAgentKey } from '@/lib/actions/agent-key-actions'

type RouteParams = { params: Promise<{ id: string }> }

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
