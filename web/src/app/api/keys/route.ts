import { NextRequest, NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { createAgentKey, listAgentKeys } from '@/lib/actions/agent-key-actions'

// GET /api/keys — List agent keys for current developer
export async function GET() {
  const developer = await getDeveloper()
  if (!developer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const keys = await listAgentKeys(developer.id)
  return NextResponse.json(keys)
}

// POST /api/keys — Generate a new agent key
export async function POST(request: NextRequest) {
  const developer = await getDeveloper()
  if (!developer) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const name = body.name || 'Default'

  const result = await createAgentKey(developer.id, name)
  return NextResponse.json(result, { status: 201 })
}
