import { describe, it, expect } from 'vitest'
import { generateApiKey, hashApiKey } from './api-keys'

describe('generateApiKey', () => {
  it('generates key with cap_ prefix', () => {
    const { plaintext } = generateApiKey()
    expect(plaintext).toMatch(/^cap_/)
  })

  it('generates key of correct length (cap_ + 64 hex chars)', () => {
    const { plaintext } = generateApiKey()
    expect(plaintext).toHaveLength(4 + 64) // "cap_" + 32 bytes hex
  })

  it('returns a 64-char hex hash', () => {
    const { hash } = generateApiKey()
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('returns prefix of 12 chars', () => {
    const { prefix, plaintext } = generateApiKey()
    expect(prefix).toHaveLength(12)
    expect(prefix).toBe(plaintext.slice(0, 12))
  })

  it('generates unique keys', () => {
    const key1 = generateApiKey()
    const key2 = generateApiKey()
    expect(key1.plaintext).not.toBe(key2.plaintext)
    expect(key1.hash).not.toBe(key2.hash)
  })

  it('hash is deterministic for same input', () => {
    const { plaintext, hash } = generateApiKey()
    expect(hashApiKey(plaintext)).toBe(hash)
  })
})

describe('hashApiKey', () => {
  it('returns consistent SHA-256 hash', () => {
    const key = 'cap_test1234567890abcdef'
    const hash1 = hashApiKey(key)
    const hash2 = hashApiKey(key)
    expect(hash1).toBe(hash2)
  })

  it('returns 64-char hex string', () => {
    const hash = hashApiKey('cap_anything')
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('different inputs produce different hashes', () => {
    const hash1 = hashApiKey('cap_key1')
    const hash2 = hashApiKey('cap_key2')
    expect(hash1).not.toBe(hash2)
  })
})
