'use client'

import { useState } from 'react'
import { Switch } from '@/components/ui/switch'

interface MonitoringToggleProps {
  projectId: string
  initialMonitored: boolean
}

export function MonitoringToggle({ projectId, initialMonitored }: MonitoringToggleProps) {
  const [monitored, setMonitored] = useState(initialMonitored)
  const [pending, setPending] = useState(false)

  async function toggle() {
    setPending(true)
    const newValue = !monitored
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monitored: newValue }),
      })
      if (res.ok) {
        setMonitored(newValue)
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <Switch
      checked={monitored}
      onCheckedChange={toggle}
      disabled={pending}
      aria-label={monitored ? 'Monitoring enabled' : 'Monitoring disabled'}
    />
  )
}
