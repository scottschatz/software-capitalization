'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  FolderKanban,
  ClipboardCheck,
  FileBarChart,
  Settings,
  Users,
  BookOpen,
  ShieldCheck,
  Activity,
} from 'lucide-react'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/projects', label: 'Projects', icon: FolderKanban },
  { href: '/review', label: 'Review', icon: ClipboardCheck },
  { href: '/reports', label: 'Reports', icon: FileBarChart },
  { href: '/methodology', label: 'Methodology', icon: BookOpen },
  { href: '/settings', label: 'Settings', icon: Settings },
]

const managerItems = [
  { href: '/approvals', label: 'Approvals', icon: ShieldCheck },
]

const adminItems = [
  { href: '/team', label: 'Team', icon: Users },
  { href: '/settings/system-health', label: 'System Health', icon: Activity },
]

interface SidebarProps {
  role?: string
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname()
  const isAdmin = role === 'admin'
  const isManager = role === 'manager'
  const isManagerOrAdmin = isAdmin || isManager

  const allItems = [
    ...navItems,
    ...(isManagerOrAdmin ? managerItems : []),
    ...(isAdmin ? adminItems : []),
  ]

  return (
    <aside className="hidden w-64 border-r bg-muted/30 md:block">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <FileBarChart className="h-5 w-5" />
          <span>Cap Tracker</span>
        </Link>
      </div>
      <nav className="flex flex-col gap-1 p-3">
        {allItems.map((item) => {
          // Only highlight the most specific matching item.
          // E.g. on /settings/system-health, highlight "System Health" not "Settings"
          const isActive = item.href === '/'
            ? pathname === '/'
            : pathname === item.href || (
                pathname.startsWith(item.href + '/') &&
                !allItems.some(other => other.href !== item.href && pathname.startsWith(other.href) && other.href.length > item.href.length)
              )

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
