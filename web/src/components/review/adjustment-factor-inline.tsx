'use client'

import { useState } from 'react'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { SlidersHorizontal } from 'lucide-react'

export function AdjustmentFactorInline({ initialFactor }: { initialFactor: number }) {
  const [factor, setFactor] = useState(initialFactor)
  const [saving, setSaving] = useState(false)
  const pct = Math.round(factor * 100)
  const changed = factor !== initialFactor

  async function handleSave() {
    setSaving(true)
    const res = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adjustmentFactor: factor }),
    })

    if (!res.ok) {
      toast.error('Failed to save')
    } else {
      toast.success(`Adjustment factor: ${pct}% (applies to future AI generation)`)
    }
    setSaving(false)
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-muted/30 rounded-lg border text-sm">
      <SlidersHorizontal className="h-4 w-4 text-muted-foreground flex-shrink-0" />
      <span className="text-xs text-muted-foreground flex-shrink-0">Default Factor (future entries):</span>
      <div className="w-32 flex-shrink-0">
        <Slider
          value={[factor]}
          onValueChange={([v]) => setFactor(Math.round(v * 100) / 100)}
          min={0}
          max={1.5}
          step={0.05}
        />
      </div>
      <span className="text-xs font-medium w-10 text-center flex-shrink-0">{pct}%</span>
      {factor !== 1.0 && (
        <button
          onClick={() => setFactor(1.0)}
          className="text-[10px] text-muted-foreground hover:text-foreground underline flex-shrink-0"
        >
          reset
        </button>
      )}
      {factor > 1.25 && (
        <span className="text-[10px] text-amber-600 flex-shrink-0">Above 125% requires manager/admin</span>
      )}
      {changed && (
        <Button onClick={handleSave} disabled={saving} size="sm" variant="outline" className="h-6 text-xs px-2">
          {saving ? '...' : 'Save'}
        </Button>
      )}
    </div>
  )
}
