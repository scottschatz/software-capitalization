'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Scan } from 'lucide-react'

interface NewProjectButtonProps {
  isManager: boolean
  variant?: 'default' | 'empty-state'
}

export function NewProjectButton({ isManager, variant = 'default' }: NewProjectButtonProps) {
  const router = useRouter()
  const [showDialog, setShowDialog] = useState(false)

  function handleClick() {
    if (isManager) {
      router.push('/projects/new')
    } else {
      setShowDialog(true)
    }
  }

  return (
    <>
      <Button onClick={handleClick} className={variant === 'empty-state' ? 'mt-4' : ''}>
        <Plus className="h-4 w-4 mr-1" />
        {variant === 'empty-state' ? 'Create Project' : 'New Project'}
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Before creating a project manually...</DialogTitle>
            <DialogDescription>
              Projects are normally auto-discovered when you run the agent.
              Manual creation can lead to duplicates if the project already exists under a
              different name.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-sm">
            <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
              <Scan className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Try auto-discovery first</p>
                <p className="text-muted-foreground mt-1">
                  Run <code className="bg-muted px-1.5 py-0.5 rounded text-xs">cap sync</code> from
                  your project directory. This scans your git repos and Claude Code sessions, then
                  registers projects automatically.
                </p>
              </div>
            </div>

            <p className="text-muted-foreground text-xs">
              If you&apos;ve already run sync and the project didn&apos;t appear, go ahead
              and create it manually. An admin will need to enable monitoring and authorize
              it before hours can be capitalized.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => router.push('/projects/new')}>
              Create Manually
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
