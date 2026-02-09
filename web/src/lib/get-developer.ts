import { getServerSession } from 'next-auth'
import { authOptions } from './auth'
import { prisma } from './prisma'
import { redirect } from 'next/navigation'

export interface DeveloperSession {
  id: string
  email: string
  displayName: string
  role: string
  adjustmentFactor: number
}

export async function getDeveloper(): Promise<DeveloperSession | null> {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email
  if (!email) return null

  const developer = await prisma.developer.findUnique({
    where: { email },
    select: { id: true, email: true, displayName: true, role: true, active: true, adjustmentFactor: true },
  })

  if (!developer || !developer.active) return null

  return developer
}

export async function requireDeveloper(): Promise<DeveloperSession> {
  const developer = await getDeveloper()
  if (!developer) redirect('/auth/signin')
  return developer
}

export async function requireAdmin(): Promise<DeveloperSession> {
  const developer = await requireDeveloper()
  if (developer.role !== 'admin') {
    throw new Error('Admin access required')
  }
  return developer
}

export async function requireManagerOrAdmin(): Promise<DeveloperSession> {
  const developer = await requireDeveloper()
  if (developer.role !== 'admin' && developer.role !== 'manager') {
    throw new Error('Manager or admin access required')
  }
  return developer
}
