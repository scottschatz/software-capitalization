'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Plus, Trash2, Copy, Key, Download, Settings2, ChevronDown, BookOpen } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface AgentKey {
  id: string
  keyPrefix: string
  name: string
  machineName: string | null
  lastUsedAt: Date | string | null
  lastKnownVersion: string | null
  claudeDataDirs: string[]
  excludePaths: string[]
  hostname: string | null
  osInfo: string | null
  hooksInstalled: boolean
  lastReportedAt: Date | string | null
  syncScheduleWeekday: string | null
  syncScheduleWeekend: string | null
  createdAt: Date | string
}

interface AgentKeysManagerProps {
  initialKeys: AgentKey[]
  developerEmail: string
  serverUrl: string
}

function CopyButton({ text }: { text: string }) {
  return (
    <button
      type="button"
      className="ml-2 inline-flex items-center text-muted-foreground hover:text-foreground"
      onClick={() => {
        navigator.clipboard.writeText(text)
        toast.success('Copied to clipboard')
      }}
    >
      <Copy className="h-3 w-3" />
    </button>
  )
}

function CommandBlock({ command, label }: { command: string; label?: string }) {
  return (
    <div className="space-y-1">
      {label && <p className="text-xs text-muted-foreground">{label}</p>}
      <div className="flex items-start gap-2 rounded bg-muted px-3 py-2">
        <code className="flex-1 text-xs break-all whitespace-pre-wrap">{command}</code>
        <CopyButton text={command} />
      </div>
    </div>
  )
}

function VersionBadge({ version }: { version: string | null }) {
  if (!version) return <Badge variant="outline" className="text-xs">No data</Badge>
  return <Badge variant="secondary" className="text-xs font-mono">{version}</Badge>
}

function StatusDot({ lastUsedAt }: { lastUsedAt: Date | string | null }) {
  if (!lastUsedAt) return <span className="inline-block w-2 h-2 rounded-full bg-gray-400" title="Never connected" />
  const ago = Date.now() - new Date(lastUsedAt).getTime()
  const hours24 = 24 * 60 * 60 * 1000
  const days7 = 7 * hours24
  if (ago < hours24) return <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="Active (last 24h)" />
  if (ago < days7) return <span className="inline-block w-2 h-2 rounded-full bg-amber-500" title="Idle (last 7d)" />
  return <span className="inline-block w-2 h-2 rounded-full bg-red-500" title="Inactive (>7d)" />
}

export function AgentKeysManager({ initialKeys, developerEmail, serverUrl }: AgentKeysManagerProps) {
  const router = useRouter()
  const [keys, setKeys] = useState(initialKeys)
  const [showGenerate, setShowGenerate] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  // Setup guide state
  const [guideOpen, setGuideOpen] = useState(false)

  async function handleGenerate() {
    setGenerating(true)
    const res = await fetch('/api/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newKeyName || 'Default' }),
    })

    if (!res.ok) {
      toast.error('Failed to generate key')
      setGenerating(false)
      return
    }

    const result = await res.json()
    setGeneratedKey(result.plaintext)
    setGenerating(false)
    router.refresh()
  }

  async function handleRevoke(keyId: string) {
    const res = await fetch(`/api/keys/${keyId}`, { method: 'DELETE' })
    if (!res.ok) {
      toast.error('Failed to revoke key')
      return
    }
    setKeys(keys.filter((k) => k.id !== keyId))
    toast.success('Key revoked')
    router.refresh()
  }

  function handleCopy() {
    if (generatedKey) {
      navigator.clipboard.writeText(generatedKey)
      toast.success('Copied to clipboard')
    }
  }

  function handleDownloadConfig() {
    if (!generatedKey) return
    const config = {
      serverUrl,
      apiKey: generatedKey,
      developerEmail,
      claudeDataDir: '~/.claude/projects',
      claudeDataDirs: ['~/.claude/projects'],
      excludePaths: [],
    }
    const json = JSON.stringify(config, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'config.json'
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Config downloaded')
  }

  function handleCloseDialog() {
    setShowGenerate(false)
    setGeneratedKey(null)
    setNewKeyName('')
  }

  return (
    <>
      {/* Agent API Keys Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" /> Agent API Keys
          </CardTitle>
          <CardDescription>
            API keys authenticate the local sync agent with the server. Generate a key, then configure your agent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active API keys. Generate one to get started with the sync agent.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Host</TableHead>
                    <TableHead>Version</TableHead>
                    <TableHead>Last Seen</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.map((key) => (
                    <TableRow key={key.id}>
                      <TableCell>
                        <StatusDot lastUsedAt={key.lastUsedAt} />
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/settings/agents/${key.id}`}
                          className="font-medium hover:underline"
                        >
                          {key.name}
                        </Link>
                        <p className="text-xs text-muted-foreground font-mono">{key.keyPrefix}...</p>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {key.hostname || '—'}
                      </TableCell>
                      <TableCell>
                        <VersionBadge version={key.lastKnownVersion} />
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {key.lastUsedAt
                          ? formatDistanceToNow(new Date(key.lastUsedAt), { addSuffix: true })
                          : 'Never'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Link href={`/settings/agents/${key.id}`}>
                            <Button variant="ghost" size="icon" title="Agent settings">
                              <Settings2 className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRevoke(key.id)}
                            title="Revoke key"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <Button onClick={() => setShowGenerate(true)}>
            <Plus className="h-4 w-4 mr-1" /> Generate New Key
          </Button>
        </CardContent>
      </Card>

      {/* Always-visible Setup Guide */}
      <Card>
        <Collapsible open={guideOpen} onOpenChange={setGuideOpen}>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                Agent Setup Guide
                <ChevronDown className={`h-4 w-4 ml-auto transition-transform ${guideOpen ? 'rotate-180' : ''}`} />
              </CardTitle>
              <CardDescription>
                How to install and configure the sync agent on your machine.
              </CardDescription>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4 pt-0">
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-medium mb-1">1. Generate an API key</p>
                  <p className="text-xs text-muted-foreground">
                    Click <strong>Generate New Key</strong> above. Copy the key — you&apos;ll need it in step 3.
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium mb-1">2. Install the agent</p>
                  <p className="text-xs text-muted-foreground mb-2">
                    Clone the repo and build the agent:
                  </p>
                  <CommandBlock command="git clone https://github.com/scottschatz/software-capitalization.git" label="Clone" />
                  <div className="mt-2">
                    <CommandBlock command="cd software-capitalization/agent && npm install && npm run build" label="Build" />
                  </div>
                  <p className="text-xs text-muted-foreground mt-3 mb-1">
                    <strong>Recommended:</strong> Register the <code className="bg-muted px-1 py-0.5 rounded">cap</code> command
                    globally so you can run it from any directory:
                  </p>
                  <div>
                    <CommandBlock command="sudo npm link" label="Register globally" />
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium mb-1">3. Configure</p>
                  <p className="text-xs text-muted-foreground mb-2">
                    Run the interactive setup and paste the API key from step 1 when prompted:
                  </p>
                  <CommandBlock command="cap init" />
                  <p className="text-xs text-muted-foreground mt-2">
                    This will prompt for your email, monitored directories, and exclusion patterns.
                    You can also manage these from the agent detail page (click a key name above).
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    <strong>Alternative:</strong> Download the config from the key generation dialog and place it manually:
                  </p>
                  <CommandBlock command="mkdir -p ~/.cap-agent && mv ~/Downloads/config.json ~/.cap-agent/ && chmod 600 ~/.cap-agent/config.json" />
                </div>

                <div>
                  <p className="text-sm font-medium mb-1">4. Verify</p>
                  <p className="text-xs text-muted-foreground mb-2">
                    Check that the agent can connect to the server and see your session data:
                  </p>
                  <CommandBlock command="cap sync --dry-run" />
                  <p className="text-xs text-muted-foreground mt-1">
                    This previews what would be synced without uploading anything. You should see your Claude Code projects listed.
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium mb-1">5. Sync for real</p>
                  <p className="text-xs text-muted-foreground mb-2">
                    When you&apos;re ready, run a real sync to upload your session data:
                  </p>
                  <CommandBlock command="cap sync" />
                </div>

                <div>
                  <p className="text-sm font-medium mb-1">6. Optional: Claude Code hooks</p>
                  <CommandBlock command="cap hooks install" />
                  <p className="text-xs text-muted-foreground mt-1">
                    Adds a Claude Code hook that captures tool usage in real time for more detailed activity tracking.
                  </p>
                </div>
              </div>

              <div className="border-t pt-3 space-y-2">
                <p className="text-xs font-medium">Ongoing usage</p>
                <div className="grid grid-cols-1 gap-1.5">
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <code className="bg-muted px-1.5 py-0.5 rounded whitespace-nowrap">cap sync</code>
                    <span>Upload new session data to the server</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <code className="bg-muted px-1.5 py-0.5 rounded whitespace-nowrap">cap status</code>
                    <span>Check agent version, config, and connection status</span>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-muted-foreground">
                    <code className="bg-muted px-1.5 py-0.5 rounded whitespace-nowrap">cap update</code>
                    <span>Pull latest code and rebuild the agent</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Generate Key Dialog — simplified */}
      <Dialog open={showGenerate} onOpenChange={(open) => !open && handleCloseDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{generatedKey ? 'API Key Generated' : 'Generate API Key'}</DialogTitle>
            <DialogDescription>
              {generatedKey
                ? 'Copy this key now — it will not be shown again.'
                : 'Give this key a name to help you identify it later.'}
            </DialogDescription>
          </DialogHeader>

          {generatedKey ? (
            <div className="space-y-3">
              <Alert>
                <AlertDescription className="font-mono text-xs break-all">
                  {generatedKey}
                </AlertDescription>
              </Alert>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCopy}>
                  <Copy className="h-3 w-3 mr-1" /> Copy Key
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownloadConfig}>
                  <Download className="h-3 w-3 mr-1" /> Download config.json
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="keyName">Key Name</Label>
                <Input
                  id="keyName"
                  placeholder="e.g., Work Laptop"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            {generatedKey ? (
              <Button onClick={handleCloseDialog}>Done</Button>
            ) : (
              <>
                <Button variant="outline" onClick={handleCloseDialog}>
                  Cancel
                </Button>
                <Button onClick={handleGenerate} disabled={generating}>
                  {generating ? 'Generating...' : 'Generate'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
