'use client'

import { Info } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

export function InfoTooltip({ text, className }: { text: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className={`h-3 w-3 text-muted-foreground/60 hover:text-muted-foreground cursor-help inline-block ${className ?? ''}`} />
      </TooltipTrigger>
      <TooltipContent>
        <p>{text}</p>
      </TooltipContent>
    </Tooltip>
  )
}
