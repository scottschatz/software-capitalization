import { NextRequest } from 'next/server'
import { createHash } from 'crypto'
import { prisma } from './prisma'

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

export async function authenticateAgent(request: NextRequest) {
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return null
  }

  const key = authHeader.substring(7)
  const keyHash = hashApiKey(key)

  const agentKey = await prisma.agentKey.findUnique({
    where: { keyHash },
    include: { developer: true },
  })

  if (!agentKey || !agentKey.active) return null

  // Check developer is active
  if (!agentKey.developer.active) return null

  // Extract agent version from header
  const agentVersion = request.headers.get('X-Agent-Version') ?? undefined

  // Update last used timestamp and version
  await prisma.agentKey.update({
    where: { id: agentKey.id },
    data: {
      lastUsedAt: new Date(),
      ...(agentVersion ? { lastKnownVersion: agentVersion } : {}),
    },
  })

  return { agentKey, developer: agentKey.developer }
}
