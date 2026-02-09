import { requireDeveloper } from '@/lib/get-developer'
import { listAgentKeys } from '@/lib/actions/agent-key-actions'
import { AgentKeysManager } from '@/components/settings/agent-keys-manager'
import { AdjustmentFactorSetting } from '@/components/settings/adjustment-factor'

export default async function SettingsPage() {
  const developer = await requireDeveloper()
  const keys = await listAgentKeys(developer.id)

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your preferences and API keys.
        </p>
      </div>

      <AdjustmentFactorSetting initialFactor={developer.adjustmentFactor} />
      <AgentKeysManager initialKeys={keys} />
    </div>
  )
}
