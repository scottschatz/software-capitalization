import { requireDeveloper } from '@/lib/get-developer'
import { redirect } from 'next/navigation'
import { SystemHealthClient } from '@/components/settings/system-health-client'

export default async function SystemHealthPage() {
  const developer = await requireDeveloper()

  if (developer.role !== 'admin') {
    redirect('/settings')
  }

  return <SystemHealthClient />
}
