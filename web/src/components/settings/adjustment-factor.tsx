'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export function AdjustmentFactorSetting({ initialFactor }: { initialFactor: number }) {
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
      toast.error('Failed to save setting')
    } else {
      toast.success(`Adjustment factor saved: ${pct}%`)
    }
    setSaving(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Hours Adjustment Factor</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          The AI estimates your active development hours from session data and git commits.
          This factor is applied as a multiplier to those estimates. At 100%, you get the
          AI&apos;s raw estimate. Adjust up if the AI consistently underestimates your time,
          or down if it overestimates.
        </p>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Factor: {pct}%</Label>
            {factor !== 1.0 && (
              <button
                onClick={() => setFactor(1.0)}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Reset to 100%
              </button>
            )}
          </div>
          <Slider
            value={[factor]}
            onValueChange={([v]) => setFactor(Math.round(v * 100) / 100)}
            min={0}
            max={1.5}
            step={0.05}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0%</span>
            <span>50%</span>
            <span>100%</span>
            <span>150%</span>
          </div>
        </div>

        {factor === 0 && (
          <p className="text-xs text-amber-600">
            At 0%, all AI-generated hours will be zero. Only use this if you want to manually set all hours.
          </p>
        )}
        {factor >= 1.5 && (
          <p className="text-xs text-amber-600">
            Factor at 150% (maximum). Are you sure the AI is underestimating this much? Consider
            reviewing a few entries to calibrate.
          </p>
        )}

        {changed && (
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} size="sm">
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
