'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'
import { Plus, Trash2, Copy, Key } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

interface AgentKey {
  id: string
  keyPrefix: string
  name: string
  machineName: string | null
  lastUsedAt: Date | string | null
  createdAt: Date | string
}

interface AgentKeysManagerProps {
  initialKeys: AgentKey[]
}

export function AgentKeysManager({ initialKeys }: AgentKeysManagerProps) {
  const router = useRouter()
  const [keys, setKeys] = useState(initialKeys)
  const [showGenerate, setShowGenerate] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

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

  function handleCloseDialog() {
    setShowGenerate(false)
    setGeneratedKey(null)
    setNewKeyName('')
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" /> Agent API Keys
          </CardTitle>
          <CardDescription>
            API keys are used by the local sync agent to authenticate with the server. Generate a
            key here, then use it when running <code className="text-xs bg-muted px-1 py-0.5 rounded">cap init</code>.
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
                    <TableHead>Name</TableHead>
                    <TableHead>Prefix</TableHead>
                    <TableHead>Last Used</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {keys.map((key) => (
                    <TableRow key={key.id}>
                      <TableCell className="font-medium">{key.name}</TableCell>
                      <TableCell className="font-mono text-xs">{key.keyPrefix}...</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {key.lastUsedAt
                          ? formatDistanceToNow(new Date(key.lastUsedAt), { addSuffix: true })
                          : 'Never'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(key.createdAt), { addSuffix: true })}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRevoke(key.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
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

      <Dialog open={showGenerate} onOpenChange={(open) => !open && handleCloseDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate API Key</DialogTitle>
            <DialogDescription>
              {generatedKey
                ? 'Copy your API key now. It will not be shown again.'
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
              <Button variant="outline" className="w-full" onClick={handleCopy}>
                <Copy className="h-4 w-4 mr-1" /> Copy to Clipboard
              </Button>
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
