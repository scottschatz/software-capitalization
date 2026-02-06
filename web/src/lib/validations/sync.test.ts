import { describe, it, expect } from 'vitest'
import { syncSessionSchema, syncCommitSchema, syncPayloadSchema } from './sync'

describe('syncSessionSchema', () => {
  it('accepts valid session', () => {
    const result = syncSessionSchema.safeParse({
      sessionId: 'abc-123',
      projectPath: '-home-user-project',
      startedAt: '2026-01-01T10:00:00Z',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.totalInputTokens).toBe(0)
      expect(result.data.messageCount).toBe(0)
      expect(result.data.isBackfill).toBe(false)
    }
  })

  it('accepts session with all fields', () => {
    const result = syncSessionSchema.safeParse({
      sessionId: 'abc-123',
      projectPath: '-home-user-project',
      startedAt: '2026-01-01T10:00:00Z',
      endedAt: '2026-01-01T11:00:00Z',
      durationSeconds: 3600,
      totalInputTokens: 1000,
      totalOutputTokens: 500,
      totalCacheReadTokens: 200,
      totalCacheCreateTokens: 100,
      messageCount: 10,
      toolUseCount: 5,
      model: 'claude-sonnet-4-5-20250929',
      rawJsonlPath: '/path/to/file.jsonl',
      isBackfill: true,
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing sessionId', () => {
    const result = syncSessionSchema.safeParse({
      projectPath: '-home-user-project',
      startedAt: '2026-01-01T10:00:00Z',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty projectPath', () => {
    const result = syncSessionSchema.safeParse({
      sessionId: 'abc-123',
      projectPath: '',
      startedAt: '2026-01-01T10:00:00Z',
    })
    expect(result.success).toBe(false)
  })
})

describe('syncCommitSchema', () => {
  it('accepts valid commit', () => {
    const result = syncCommitSchema.safeParse({
      commitHash: 'abc123def456',
      repoPath: '/home/user/repo',
      authorName: 'Test',
      authorEmail: 'test@example.com',
      committedAt: '2026-01-01T10:00:00Z',
      message: 'Initial commit',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.filesChanged).toBe(0)
      expect(result.data.insertions).toBe(0)
      expect(result.data.deletions).toBe(0)
    }
  })

  it('rejects missing required fields', () => {
    const result = syncCommitSchema.safeParse({
      commitHash: 'abc123',
    })
    expect(result.success).toBe(false)
  })
})

describe('syncPayloadSchema', () => {
  it('accepts empty payload', () => {
    const result = syncPayloadSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.syncType).toBe('incremental')
      expect(result.data.sessions).toEqual([])
      expect(result.data.commits).toEqual([])
    }
  })

  it('accepts full payload with sessions and commits', () => {
    const result = syncPayloadSchema.safeParse({
      syncType: 'backfill',
      sessions: [
        {
          sessionId: 'sess-1',
          projectPath: '-home-user-proj',
          startedAt: '2026-01-01T10:00:00Z',
        },
      ],
      commits: [
        {
          commitHash: 'abc123',
          repoPath: '/home/user/repo',
          authorName: 'Test',
          authorEmail: 'test@example.com',
          committedAt: '2026-01-01T10:00:00Z',
          message: 'Test commit',
        },
      ],
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid syncType', () => {
    const result = syncPayloadSchema.safeParse({ syncType: 'invalid' })
    expect(result.success).toBe(false)
  })
})
