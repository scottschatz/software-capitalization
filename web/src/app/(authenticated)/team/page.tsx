import { getDeveloper } from '@/lib/get-developer'
import { redirect } from 'next/navigation'
import TeamClient from './team-client'

export default async function TeamPage() {
  const developer = await getDeveloper()
  if (!developer) redirect('/api/auth/signin')
  if (!['admin', 'manager'].includes(developer.role)) redirect('/review')

  return <TeamClient />
}
