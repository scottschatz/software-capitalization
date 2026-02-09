'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { KeyRound, RefreshCw, UserX, UserCheck, UserPlus } from 'lucide-react'
import { toast } from 'sonner'

interface AgentKey {
  id: string
  keyPrefix: string
  machineName: string | null
  lastUsedAt: string | null
  createdAt: string
}

interface DeveloperInfo {
  id: string
  email: string
  displayName: string
  role: string
  active: boolean
  createdAt: string
  lastLoginAt: string | null
  agentKeys: AgentKey[]
  lastSync: { completedAt: string; syncType: string } | null
  _count: {
    rawSessions: number
    rawCommits: number
    dailyEntries: number
  }
}

export default function TeamClient() {
  const [developers, setDevelopers] = useState<DeveloperInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    description: string
    action: () => Promise<void>
  }>({ open: false, title: '', description: '', action: async () => {} })
  const [addDialog, setAddDialog] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState('developer')
  const [addingDev, setAddingDev] = useState(false)
  const [addError, setAddError] = useState('')

  const loadDevelopers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/developers')
      if (res.ok) setDevelopers(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadDevelopers()
  }, [loadDevelopers])

  async function updateRole(devId: string, role: string) {
    const res = await fetch(`/api/admin/developers/${devId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    if (res.ok) {
      setDevelopers((prev) =>
        prev.map((d) => (d.id === devId ? { ...d, role } : d))
      )
    } else {
      const err = await res.json()
      toast.error(err.error || 'Failed to update role')
    }
  }

  async function toggleActive(dev: DeveloperInfo) {
    const newActive = !dev.active
    const action = async () => {
      const res = await fetch(`/api/admin/developers/${dev.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: newActive }),
      })
      if (res.ok) {
        setDevelopers((prev) =>
          prev.map((d) => (d.id === dev.id ? { ...d, active: newActive } : d))
        )
      } else {
        const err = await res.json()
        toast.error(err.error || 'Failed to update status')
      }
      setConfirmDialog((prev) => ({ ...prev, open: false }))
    }

    setConfirmDialog({
      open: true,
      title: newActive ? 'Reactivate Developer' : 'Deactivate Developer',
      description: newActive
        ? `Reactivate ${dev.displayName}? They will be able to log in and sync data again.`
        : `Deactivate ${dev.displayName}? They will not be able to log in or sync data.`,
      action,
    })
  }

  async function revokeKey(devId: string, keyId: string) {
    const res = await fetch(`/api/keys/${keyId}`, { method: 'DELETE' })
    if (res.ok) {
      setDevelopers((prev) =>
        prev.map((d) =>
          d.id === devId
            ? { ...d, agentKeys: d.agentKeys.filter((k) => k.id !== keyId) }
            : d
        )
      )
    }
  }

  async function handleAddDeveloper() {
    setAddError('')
    setAddingDev(true)
    try {
      const res = await fetch('/api/admin/developers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, displayName: newName, role: newRole }),
      })
      if (!res.ok) {
        const err = await res.json()
        setAddError(err.error || 'Failed to add developer')
        return
      }
      setAddDialog(false)
      toast.success('Developer added successfully')
      setNewEmail('')
      setNewName('')
      setNewRole('developer')
      loadDevelopers()
    } finally {
      setAddingDev(false)
    }
  }

  // Auto-fill display name from email
  function handleEmailChange(email: string) {
    setNewEmail(email)
    if (!newName || newName === emailToName(newEmail)) {
      setNewName(emailToName(email))
    }
  }

  function emailToName(email: string): string {
    const local = email.split('@')[0] ?? ''
    return local.split('.').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
  }

  function formatRelative(date: string | null) {
    if (!date) return 'Never'
    const diff = Date.now() - new Date(date).getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 30) return `${days}d ago`
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const activeCount = developers.filter((d) => d.active).length
  const totalSessions = developers.reduce((s, d) => s + d._count.rawSessions, 0)
  const totalCommits = developers.reduce((s, d) => s + d._count.rawCommits, 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Team Management</h1>
        <p className="text-muted-foreground">
          Manage developers, roles, and agent connections
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Active Developers</p>
            <p className="text-3xl font-bold">{activeCount}</p>
            <p className="text-xs text-muted-foreground">
              of {developers.length} total
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Sessions</p>
            <p className="text-3xl font-bold">{totalSessions}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total Commits</p>
            <p className="text-3xl font-bold">{totalCommits}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Agent Keys</p>
            <p className="text-3xl font-bold">
              {developers.reduce((s, d) => s + d.agentKeys.length, 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Developers</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="default" size="sm" onClick={() => setAddDialog(true)}>
              <UserPlus className="h-4 w-4 mr-1" />
              Add Developer
            </Button>
            <Button variant="outline" size="sm" onClick={loadDevelopers} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Developer</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead className="text-right">Commits</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead>Last Sync</TableHead>
                <TableHead>Agent Keys</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {developers.map((dev) => (
                <TableRow key={dev.id} className={!dev.active ? 'opacity-50' : ''}>
                  <TableCell>
                    <div>
                      <span className="font-medium">{dev.displayName}</span>
                      <p className="text-xs text-muted-foreground">{dev.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={dev.role}
                      onValueChange={(val) => updateRole(dev.id, val)}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="developer">Developer</SelectItem>
                        <SelectItem value="manager">Manager</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Badge variant={dev.active ? 'default' : 'destructive'}>
                      {dev.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">{dev._count.rawSessions}</TableCell>
                  <TableCell className="text-right">{dev._count.rawCommits}</TableCell>
                  <TableCell className="text-sm">{formatRelative(dev.lastLoginAt)}</TableCell>
                  <TableCell className="text-sm">
                    {dev.lastSync ? formatRelative(dev.lastSync.completedAt) : 'Never'}
                  </TableCell>
                  <TableCell>
                    {dev.agentKeys.length === 0 ? (
                      <span className="text-xs text-muted-foreground">None</span>
                    ) : (
                      <div className="space-y-1">
                        {dev.agentKeys.map((key) => (
                          <div key={key.id} className="flex items-center gap-1">
                            <KeyRound className="h-3 w-3 text-muted-foreground" />
                            <span className="text-xs font-mono">{key.keyPrefix}...</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 px-1 text-xs text-destructive"
                              onClick={() => revokeKey(dev.id, key.id)}
                            >
                              Revoke
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleActive(dev)}
                      title={dev.active ? 'Deactivate' : 'Reactivate'}
                    >
                      {dev.active ? (
                        <UserX className="h-4 w-4 text-destructive" />
                      ) : (
                        <UserCheck className="h-4 w-4 text-green-600" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {developers.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    No developers found
                  </TableCell>
                </TableRow>
              )}
              {loading && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground">
                    Loading...
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog((prev) => ({ ...prev, open }))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmDialog.title}</DialogTitle>
            <DialogDescription>{confirmDialog.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
            >
              Cancel
            </Button>
            <Button onClick={confirmDialog.action}>Confirm</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Developer Dialog */}
      <Dialog open={addDialog} onOpenChange={setAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Developer</DialogTitle>
            <DialogDescription>
              Pre-provision a developer account. They&apos;ll be ready to go when they sign in via SSO.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="add-email">Email</Label>
              <Input
                id="add-email"
                placeholder="first.last@townsquaremedia.com"
                value={newEmail}
                onChange={(e) => handleEmailChange(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-name">Display Name</Label>
              <Input
                id="add-name"
                placeholder="First Last"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-role">Role</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="developer">Developer</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {addError && (
              <p className="text-sm text-destructive">{addError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddDeveloper}
              disabled={addingDev || !newEmail || !newName}
            >
              {addingDev ? 'Adding...' : 'Add Developer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
