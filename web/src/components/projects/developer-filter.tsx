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
}

interface ProjectDeveloperFilterProps {
  developers: Developer[]
  currentDevId: string
}

export function ProjectDeveloperFilter({ developers, currentDevId }: ProjectDeveloperFilterProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function handleChange(value: string) {
    const p = new URLSearchParams(searchParams.toString())
    if (value === 'all') {
      p.delete('developer')
    } else {
      p.set('developer', value)
    }
    const qs = p.toString()
    router.push(`/projects${qs ? `?${qs}` : ''}`)
  }

  return (
    <Select value={currentDevId} onValueChange={handleChange}>
      <SelectTrigger className="w-[200px] h-8 text-xs">
        <SelectValue placeholder="Filter by developer" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All Team Members</SelectItem>
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
