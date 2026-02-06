import { describe, it, expect } from 'vitest'
import { localPathToClaudePath, claudePathToLocalPath } from './claude-paths'

describe('localPathToClaudePath', () => {
  it('converts absolute Linux path', () => {
    expect(localPathToClaudePath('/home/sschatz/projects/foo')).toBe(
      '-home-sschatz-projects-foo'
    )
  })

  it('converts simple path', () => {
    expect(localPathToClaudePath('/tmp/test')).toBe('-tmp-test')
  })

  it('handles root path', () => {
    expect(localPathToClaudePath('/')).toBe('-')
  })

  it('handles deeply nested path', () => {
    expect(localPathToClaudePath('/a/b/c/d/e')).toBe('-a-b-c-d-e')
  })
})

describe('claudePathToLocalPath', () => {
  it('converts encoded path back to absolute path', () => {
    expect(claudePathToLocalPath('-home-sschatz-projects-foo')).toBe(
      '/home/sschatz/projects/foo'
    )
  })

  it('converts simple encoded path', () => {
    expect(claudePathToLocalPath('-tmp-test')).toBe('/tmp/test')
  })

  it('returns non-encoded paths as-is', () => {
    expect(claudePathToLocalPath('some-relative-path')).toBe('some-relative-path')
  })
})

describe('roundtrip conversion', () => {
  it('local → claude → local preserves path (no hyphens in names)', () => {
    const original = '/home/sschatz/projects/myproject'
    const claude = localPathToClaudePath(original)
    const back = claudePathToLocalPath(claude)
    expect(back).toBe(original)
  })

  it('paths with hyphens in names are not perfectly reversible (known limitation)', () => {
    // Claude Code uses `-` as the separator, so hyphens in directory names
    // become ambiguous when converting back. This is by design — Claude Code
    // never needs to reverse the encoding.
    const original = '/home/user/my-project'
    const claude = localPathToClaudePath(original)
    expect(claude).toBe('-home-user-my-project')
    // Reverse is lossy: becomes /home/user/my/project
    const back = claudePathToLocalPath(claude)
    expect(back).not.toBe(original) // confirms it's lossy
  })
})
