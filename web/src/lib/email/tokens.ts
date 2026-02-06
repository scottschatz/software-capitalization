import jwt from 'jsonwebtoken'

function getJwtSecret(): string {
  const secret = process.env.EMAIL_JWT_SECRET || process.env.NEXTAUTH_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('EMAIL_JWT_SECRET or NEXTAUTH_SECRET must be set in production')
    }
    return 'dev-secret-local-only'
  }
  return secret
}

const JWT_SECRET = getJwtSecret()
const TOKEN_EXPIRY = '72h'

export interface EmailActionPayload {
  developerId: string
  date: string
  action: 'approve_all' | 'approve_phase_change' | 'reject_phase_change'
  targetId?: string // phase change request ID, etc.
}

export function createActionToken(payload: EmailActionPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY })
}

export function verifyActionToken(token: string): EmailActionPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as EmailActionPayload
  } catch {
    return null
  }
}
