import { prisma } from '@/lib/prisma'
import { generateApiKey } from '@/lib/api-keys'

export async function createAgentKey(developerId: string, name: string) {
  const { plaintext, hash, prefix } = generateApiKey()

  const key = await prisma.agentKey.create({
    data: {
      developerId,
      keyHash: hash,
      keyPrefix: prefix,
      name: name || 'Default',
    },
  })

  // Return plaintext only this once — it's never stored
  return { id: key.id, plaintext, prefix: key.keyPrefix, name: key.name, createdAt: key.createdAt }
}

export async function revokeAgentKey(keyId: string, developerId: string) {
  // Ensure the key belongs to this developer
  const key = await prisma.agentKey.findUniqueOrThrow({
    where: { id: keyId },
  })

  if (key.developerId !== developerId) {
    throw new Error('Key does not belong to this developer')
  }

  return prisma.agentKey.update({
    where: { id: keyId },
    data: { active: false },
  })
}

export async function listAgentKeys(developerId: string) {
  return prisma.agentKey.findMany({
    where: { developerId, active: true },
    select: {
      id: true,
      keyPrefix: true,
      name: true,
      machineName: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
  })
}
