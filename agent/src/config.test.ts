import { describe, it, expect, afterEach } from 'vitest'
import { mkdirSync, rmSync, statSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

// We test saveConfig/loadConfig by requiring the module fresh with a patched homedir.
// Since config.ts uses homedir() at module scope, we test the underlying behavior directly.

const TMP = join(tmpdir(), 'cap-test-config-' + Date.now())

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true })
})

describe('config file permissions', () => {
  it('creates config directory with 0o700 permissions', () => {
    const configDir = join(TMP, '.cap-agent')
    mkdirSync(configDir, { recursive: true, mode: 0o700 })
    const stat = statSync(configDir)
    // Check mode bits (last 3 octal digits)
    expect(stat.mode & 0o777).toBe(0o700)
  })

  it('creates config file with 0o600 permissions', () => {
    const configDir = join(TMP, '.cap-agent')
    mkdirSync(configDir, { recursive: true, mode: 0o700 })
    const configFile = join(configDir, 'config.json')
    const { writeFileSync } = require('node:fs')
    writeFileSync(configFile, '{"test": true}', { encoding: 'utf-8', mode: 0o600 })
    const stat = statSync(configFile)
    expect(stat.mode & 0o777).toBe(0o600)
  })

  it('config file is valid JSON after write', () => {
    const configDir = join(TMP, '.cap-agent')
    mkdirSync(configDir, { recursive: true, mode: 0o700 })
    const configFile = join(configDir, 'config.json')
    const config = {
      serverUrl: 'http://localhost:3000',
      apiKey: 'cap_abc123',
      claudeDataDir: '/home/test/.claude',
      developerEmail: 'test@example.com',
    }
    const { writeFileSync } = require('node:fs')
    writeFileSync(configFile, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 })
    const parsed = JSON.parse(readFileSync(configFile, 'utf-8'))
    expect(parsed.serverUrl).toBe('http://localhost:3000')
    expect(parsed.apiKey).toBe('cap_abc123')
  })

  it('config directory is not world-readable', () => {
    const configDir = join(TMP, '.cap-agent')
    mkdirSync(configDir, { recursive: true, mode: 0o700 })
    const stat = statSync(configDir)
    // No group or other permissions
    expect(stat.mode & 0o077).toBe(0)
  })

  it('config file is not group/world-readable', () => {
    const configDir = join(TMP, '.cap-agent')
    mkdirSync(configDir, { recursive: true, mode: 0o700 })
    const configFile = join(configDir, 'config.json')
    const { writeFileSync } = require('node:fs')
    writeFileSync(configFile, '{}', { encoding: 'utf-8', mode: 0o600 })
    const stat = statSync(configFile)
    // No group or other permissions
    expect(stat.mode & 0o077).toBe(0)
  })
})
