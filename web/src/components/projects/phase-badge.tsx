import { Badge } from '@/components/ui/badge'

const phaseConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  preliminary: { label: 'Preliminary', variant: 'secondary' },
  application_development: { label: 'App Development', variant: 'default' },
  post_implementation: { label: 'Post-Implementation', variant: 'outline' },
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  active: { label: 'Active', variant: 'default' },
  paused: { label: 'Paused', variant: 'secondary' },
  completed: { label: 'Completed', variant: 'outline' },
  abandoned: { label: 'Abandoned', variant: 'destructive' },
}

export function PhaseBadge({ phase }: { phase: string }) {
  const config = phaseConfig[phase] ?? { label: phase, variant: 'outline' as const }
  return <Badge variant={config.variant}>{config.label}</Badge>
}

export function StatusBadge({ status }: { status: string }) {
  const config = statusConfig[status] ?? { label: status, variant: 'outline' as const }
  return <Badge variant={config.variant}>{config.label}</Badge>
}
