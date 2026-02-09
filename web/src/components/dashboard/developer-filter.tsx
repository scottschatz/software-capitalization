'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Developer {
  id: string
  displayName: string
  email: string
}

interface DashboardDeveloperFilterProps {
  developers: Developer[]
  currentDevId: string
}

export function DashboardDeveloperFilter({ developers, currentDevId }: DashboardDeveloperFilterProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function handleChange(value: string) {
    const p = new URLSearchParams(searchParams.toString())
    if (value === 'self') {
      p.delete('developer')
    } else {
      p.set('developer', value)
    }
    const qs = p.toString()
    router.push(`/${qs ? `?${qs}` : ''}`)
  }

  // Map "self" as the default when no developer param is set
  const selectValue = currentDevId === 'all' ? 'all' :
    developers.some((d) => d.id === currentDevId) ? currentDevId : 'self'

  return (
    <Select value={selectValue} onValueChange={handleChange}>
      <SelectTrigger className="w-[200px] h-8 text-xs">
        <SelectValue placeholder="Select developer" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="self">My Dashboard</SelectItem>
        <SelectItem value="all">All Developers</SelectItem>
        {developers.length > 0 && (
          <>
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-t mt-1 pt-1.5">
              Individual
            </div>
            {developers.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.displayName}
              </SelectItem>
            ))}
          </>
        )}
      </SelectContent>
    </Select>
  )
}
