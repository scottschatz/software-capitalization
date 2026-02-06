import { requireDeveloper } from '@/lib/get-developer'
import { Sidebar } from '@/components/layout/sidebar'
import { Header } from '@/components/layout/header'

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const developer = await requireDeveloper()

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={developer.role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header role={developer.role} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
