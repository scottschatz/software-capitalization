'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function AuthenticatedError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Application error:', error)
  }, [error])

  const isAdminError = error.message === 'Admin access required'

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="text-destructive">
            {isAdminError ? 'Access Denied' : 'Something went wrong'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            {isAdminError
              ? 'You do not have admin permissions to access this page.'
              : 'An unexpected error occurred. Please try again.'}
          </p>
          {!isAdminError && (
            <Button onClick={reset} variant="outline">
              Try again
            </Button>
          )}
          <Button
            variant="link"
            className="block"
            onClick={() => (window.location.href = '/')}
          >
            Go to Dashboard
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
