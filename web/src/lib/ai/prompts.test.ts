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

  it('includes ASC 350-40 context', () => {
    const prompt = buildDailyEntryPrompt(makeContext())
    expect(prompt).toContain('ASC 350-40')
    expect(prompt).toContain('capitalization')
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
          toolBreakdown: null,
          filesReferenced: [],
          firstUserPrompt: null,
          userPromptCount: null,
        },
      ],
    })
    const prompt = buildDailyEntryPrompt(ctx)
    expect(prompt).toContain('sess-123') // truncated session ID
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

  it('includes active time data when provided', () => {
    const ctx = makeContext({
      sessions: [
        {
          sessionId: 'sess-12345678-abcd-1234-abcd-123456789012',
          projectPath: '-home-user-project',
          startedAt: new Date('2026-01-15T10:00:00Z'),
          endedAt: new Date('2026-01-15T14:00:00Z'),
          durationSeconds: 14400,
          totalInputTokens: 5000,
          totalOutputTokens: 2000,
          messageCount: 50,
          toolUseCount: 30,
          model: 'claude-sonnet-4-5-20250929',
          toolBreakdown: { Edit: 10, Read: 15, Bash: 5 },
          filesReferenced: ['src/app.ts', 'src/utils.ts'],
          firstUserPrompt: 'Help me fix the login',
          userPromptCount: 20,
          activeWindow: {
            first: '2026-01-15T15:00:00Z',
            last: '2026-01-15T18:30:00Z',
            minutes: 180,
            wallClockMinutes: 210,
          },
          userPrompts: [
            { time: '2026-01-15T15:00:00Z', text: 'Fix the login bug' },
            { time: '2026-01-15T15:30:00Z', text: 'Now add unit tests' },
          ],
        },
      ],
    })
    const prompt = buildDailyEntryPrompt(ctx)
    expect(prompt).toContain('Active time: 3.0h')
    expect(prompt).toContain('gap-aware')
    expect(prompt).toContain('Edit:10')
    expect(prompt).toContain('Fix the login bug')
    expect(prompt).toContain('Now add unit tests')
  })

  it('includes tool events when provided', () => {
    const ctx = makeContext({
      sessions: [
        {
          sessionId: 'sess-1',
          projectPath: '-home-user-project',
          startedAt: new Date('2026-01-15T10:00:00Z'),
          endedAt: null,
          durationSeconds: null,
          totalInputTokens: 100,
          totalOutputTokens: 50,
          messageCount: 5,
          toolUseCount: 3,
          model: null,
          toolBreakdown: null,
          filesReferenced: [],
          firstUserPrompt: null,
          userPromptCount: null,
        },
      ],
      toolEvents: [
        {
          toolName: 'Edit',
          projectPath: '/home/user/project',
          timestamp: new Date('2026-01-15T10:05:00Z'),
          filePath: 'src/app.ts',
        },
        {
          toolName: 'Read',
          projectPath: '/home/user/project',
          timestamp: new Date('2026-01-15T10:06:00Z'),
        },
      ],
    })
    const prompt = buildDailyEntryPrompt(ctx)
    expect(prompt).toContain('Real-Time Tool Events')
    expect(prompt).toContain('2 events')
    expect(prompt).toContain('Edit:1')
    expect(prompt).toContain('Read:1')
  })

  it('includes enhancement detection instructions', () => {
    const prompt = buildDailyEntryPrompt(makeContext())
    expect(prompt).toContain('enhancementSuggested')
    expect(prompt).toContain('enhancementReason')
  })
})
