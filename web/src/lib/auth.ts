import { NextAuthOptions } from 'next-auth'
import AzureADProvider from 'next-auth/providers/azure-ad'
import CredentialsProvider from 'next-auth/providers/credentials'
import { prisma } from './prisma'

const providers: NextAuthOptions['providers'] = []

// Azure AD provider (production)
if (process.env.AZURE_AD_CLIENT_ID && process.env.AZURE_AD_CLIENT_SECRET) {
  providers.push(
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET,
      tenantId: process.env.AZURE_AD_TENANT_ID || 'a473edd8-ba25-4f04-a0a8-e8ad25c19632',
      authorization: {
        params: {
          scope: 'openid email profile User.Read',
        },
      },
    })
  )
}

// Dev bypass (local development only — blocked in production)
if (process.env.DEV_AUTH_BYPASS === 'true' && process.env.NODE_ENV !== 'production') {
  providers.push(
    CredentialsProvider({
      id: 'dev-bypass',
      name: 'Development Login',
      credentials: {
        email: { label: 'Email', type: 'text', placeholder: 'scott.schatz@townsquaremedia.com' },
      },
      async authorize(credentials) {
        if (!credentials?.email) return null

        // Find or create the developer
        let developer = await prisma.developer.findUnique({
          where: { email: credentials.email },
        })

        if (!developer) {
          developer = await prisma.developer.create({
            data: {
              email: credentials.email,
              displayName: credentials.email.split('@')[0].replace('.', ' '),
              role: 'admin', // Dev users get admin for testing
            },
          })
        }

        return {
          id: developer.id,
          email: developer.email,
          name: developer.displayName,
        }
      },
    })
  )
}

export const authOptions: NextAuthOptions = {
  // No PrismaAdapter — schema uses "Developer" not "User".
  // Developer provisioning handled in signIn callback; lookup in session callback.
  providers,
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async signIn({ user, profile }) {
      // For Azure AD: validate domain and auto-provision
      if (profile) {
        const email = user.email
        if (!email?.endsWith('@townsquaremedia.com')) {
          return false // Reject non-Townsquare users
        }

        // Auto-provision developer on first login
        const existing = await prisma.developer.findUnique({
          where: { email },
        })
        if (!existing) {
          await prisma.developer.create({
            data: {
              email,
              displayName: user.name || email.split('@')[0],
              azureOid: (profile as Record<string, unknown>).oid as string | undefined,
              role: 'developer',
            },
          })
        } else {
          // Update last login
          await prisma.developer.update({
            where: { email },
            data: { lastLoginAt: new Date() },
          })
        }
      }
      return true
    },
    async session({ session, token, user }) {
      // Attach developer info to session
      const email = session.user?.email || (token as Record<string, unknown>)?.email as string
      if (email) {
        const developer = await prisma.developer.findUnique({
          where: { email },
          select: { id: true, role: true, displayName: true, email: true },
        })
        if (developer) {
          ;(session as unknown as Record<string, unknown>).developer = developer
        }
      }
      return session
    },
    async jwt({ token, user }) {
      // For credentials provider: include email in JWT
      if (user) {
        token.email = user.email
      }
      return token
    },
  },
  pages: {
    signIn: '/auth/signin',
  },
}
