import { requireAdmin } from '@/lib/get-developer'

export default async function TeamPage() {
  await requireAdmin()

  return (
    <div>
      <h1 className="text-2xl font-bold">Team Management</h1>
      <p className="text-muted-foreground">Team management coming in Phase 3.</p>
    </div>
  )
}
