import { randomBytes, createHash } from 'crypto'

const KEY_PREFIX = 'cap_'
const KEY_BYTE_LENGTH = 32 // 32 bytes = 64 hex chars

/**
 * Generate a new API key. Returns the plaintext key (show once) and its SHA-256 hash (store).
 */
export function generateApiKey(): { plaintext: string; hash: string; prefix: string } {
  const random = randomBytes(KEY_BYTE_LENGTH).toString('hex')
  const plaintext = `${KEY_PREFIX}${random}`
  const hash = hashApiKey(plaintext)
  const prefix = plaintext.slice(0, 12) // "cap_" + 8 hex chars

  return { plaintext, hash, prefix }
}

/**
 * Hash an API key with SHA-256 for storage/lookup.
 */
export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}
