'use client'

import { signIn, getProviders } from 'next-auth/react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Providers = Awaited<ReturnType<typeof getProviders>>

export default function SignInPage() {
  const [providers, setProviders] = useState<Providers>(null)
  const [email, setEmail] = useState('scott.schatz@townsquaremedia.com')

  useEffect(() => {
    getProviders().then(setProviders)
  }, [])

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Software Capitalization Tracker</CardTitle>
          <CardDescription>Sign in to track and report development hours</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {providers?.['azure-ad'] && (
            <Button
              className="w-full"
              onClick={() => signIn('azure-ad', { callbackUrl: '/' })}
            >
              Sign in with Microsoft
            </Button>
          )}

          {providers?.['dev-bypass'] && (
            <>
              {providers?.['azure-ad'] && (
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      Development Mode
                    </span>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your.name@townsquaremedia.com"
                />
              </div>
              <Button
                className="w-full"
                variant="outline"
                onClick={() =>
                  signIn('dev-bypass', {
                    email,
                    callbackUrl: '/',
                  })
                }
              >
                Dev Login
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
