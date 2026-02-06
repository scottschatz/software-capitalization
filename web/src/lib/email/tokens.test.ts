import { describe, it, expect } from 'vitest'
import { createActionToken, verifyActionToken, type EmailActionPayload } from './tokens'

describe('createActionToken', () => {
  it('creates a valid JWT string', () => {
    const token = createActionToken({
      developerId: 'dev-123',
      date: '2026-01-15',
      action: 'approve_all',
    })
    expect(typeof token).toBe('string')
    expect(token.split('.')).toHaveLength(3) // JWT has 3 parts
  })
})

describe('verifyActionToken', () => {
  it('verifies a valid token', () => {
    const payload: EmailActionPayload = {
      developerId: 'dev-123',
      date: '2026-01-15',
      action: 'approve_all',
    }
    const token = createActionToken(payload)
    const verified = verifyActionToken(token)

    expect(verified).not.toBeNull()
    expect(verified!.developerId).toBe('dev-123')
    expect(verified!.date).toBe('2026-01-15')
    expect(verified!.action).toBe('approve_all')
  })

  it('verifies token with targetId', () => {
    const payload: EmailActionPayload = {
      developerId: 'dev-456',
      date: '2026-02-01',
      action: 'approve_phase_change',
      targetId: 'pcr-789',
    }
    const token = createActionToken(payload)
    const verified = verifyActionToken(token)

    expect(verified).not.toBeNull()
    expect(verified!.targetId).toBe('pcr-789')
    expect(verified!.action).toBe('approve_phase_change')
  })

  it('returns null for invalid token', () => {
    const result = verifyActionToken('not-a-valid-jwt')
    expect(result).toBeNull()
  })

  it('returns null for tampered token', () => {
    const token = createActionToken({
      developerId: 'dev-123',
      date: '2026-01-15',
      action: 'approve_all',
    })
    // Tamper with the token
    const tampered = token.slice(0, -5) + 'XXXXX'
    const result = verifyActionToken(tampered)
    expect(result).toBeNull()
  })

  it('roundtrips all action types', () => {
    const actions: EmailActionPayload['action'][] = [
      'approve_all',
      'approve_phase_change',
      'reject_phase_change',
    ]
    for (const action of actions) {
      const token = createActionToken({
        developerId: 'dev-1',
        date: '2026-01-01',
        action,
      })
      const verified = verifyActionToken(token)
      expect(verified).not.toBeNull()
      expect(verified!.action).toBe(action)
    }
  })
})
