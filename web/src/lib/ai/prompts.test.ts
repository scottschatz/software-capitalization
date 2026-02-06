import { describe, it, expect } from 'vitest'
import { buildDailyEntryPrompt, type DailyActivityContext } from './prompts'

function makeContext(overrides: Partial<DailyActivityContext> = {}): DailyActivityContext {
  return {
    developer: { displayName: 'Test User', email: 'test@example.com' },
    date: '2026-01-15',
    projects: [],
    sessions: [],
    commits: [],
    ...overrides,
  }
}

describe('buildDailyEntryPrompt', () => {
  it('includes developer info', () => {
    const prompt = buildDailyEntryPrompt(makeContext())
    expect(prompt).toContain('Test User')
    expect(prompt).toContain('test@example.com')
    expect(prompt).toContain('2026-01-15')
  })

  it('includes ASC 350-40 phase rules', () => {
    const prompt = buildDailyEntryPrompt(makeContext())
    expect(prompt).toContain('ASC 350-40')
    expect(prompt).toContain('Preliminary')
    expect(prompt).toContain('Application Development')
    expect(prompt).toContain('Post-Implementation')
    expect(prompt).toContain('CAPITALIZED')
    expect(prompt).toContain('EXPENSED')
  })

  it('includes project details when provided', () => {
    const ctx = makeContext({
      projects: [
        {
          id: 'proj-1',
          name: 'Test Project',
          phase: 'application_development',
          description: 'A test project',
          repos: [{ repoPath: '/home/user/repo' }],
          claudePaths: [{ claudePath: '-home-user-repo', localPath: '/home/user/repo' }],
        },
      ],
    })
    const prompt = buildDailyEntryPrompt(ctx)
    expect(prompt).toContain('Test Project')
    expect(prompt).toContain('proj-1')
    expect(prompt).toContain('application_development')
    expect(prompt).toContain('/home/user/repo')
    expect(prompt).toContain('-home-user-repo')
  })

  it('includes session data when provided', () => {
    const ctx = makeContext({
      sessions: [
        {
          sessionId: 'sess-12345678-abcd-1234-abcd-123456789012',
          projectPath: '-home-user-project',
          startedAt: new Date('2026-01-15T10:00:00Z'),
          endedAt: new Date('2026-01-15T11:00:00Z'),
          durationSeconds: 3600,
          totalInputTokens: 1000,
          totalOutputTokens: 500,
          messageCount: 10,
          toolUseCount: 5,
          model: 'claude-sonnet-4-5-20250929',
        },
      ],
    })
    const prompt = buildDailyEntryPrompt(ctx)
    expect(prompt).toContain('sess-123') // truncated session ID
    expect(prompt).toContain('60min')
    expect(prompt).toContain('10 msgs')
    expect(prompt).toContain('5 tools')
    expect(prompt).toContain('1500 tokens') // 1000 + 500
  })

  it('includes commit data when provided', () => {
    const ctx = makeContext({
      commits: [
        {
          commitHash: 'abc123def456789012345678901234567890abcd',
          repoPath: '/home/user/repo',
          committedAt: new Date('2026-01-15T14:30:00Z'),
          message: 'Fix bug in auth module',
          filesChanged: 3,
          insertions: 25,
          deletions: 10,
        },
      ],
    })
    const prompt = buildDailyEntryPrompt(ctx)
    expect(prompt).toContain('abc123de') // truncated hash
    expect(prompt).toContain('Fix bug in auth module')
    expect(prompt).toContain('+25/-10')
    expect(prompt).toContain('3 files')
  })

  it('shows "No sessions" when empty', () => {
    const prompt = buildDailyEntryPrompt(makeContext())
    expect(prompt).toContain('No sessions')
    expect(prompt).toContain('No commits')
  })

  it('requests JSON array response format', () => {
    const prompt = buildDailyEntryPrompt(makeContext())
    expect(prompt).toContain('JSON array')
    expect(prompt).toContain('"projectId"')
    expect(prompt).toContain('"hoursEstimate"')
    expect(prompt).toContain('"confidence"')
  })
})
