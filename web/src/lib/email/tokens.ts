import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.EMAIL_JWT_SECRET || process.env.NEXTAUTH_SECRET || 'dev-secret'
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
