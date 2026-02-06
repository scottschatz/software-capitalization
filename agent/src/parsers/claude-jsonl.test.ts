import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseClaudeJsonl } from './claude-jsonl.js'

const TMP = join(tmpdir(), 'cap-test-jsonl-' + Date.now())

beforeAll(() => {
  mkdirSync(TMP, { recursive: true })
})

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true })
})

function writeJsonl(name: string, records: unknown[]): string {
  const path = join(TMP, name)
  writeFileSync(path, records.map((r) => JSON.stringify(r)).join('\n') + '\n')
  return path
}

describe('parseClaudeJsonl', () => {
  it('returns null for empty file', async () => {
    const path = join(TMP, 'empty.jsonl')
    writeFileSync(path, '')
    const result = await parseClaudeJsonl(path)
    expect(result).toBeNull()
  })

  it('returns null for file with only progress records', async () => {
    const path = writeJsonl('progress-only.jsonl', [
      { type: 'progress', timestamp: '2026-01-01T10:00:00Z', content: 'Running...' },
      { type: 'progress', timestamp: '2026-01-01T10:01:00Z', content: 'Done' },
    ])
    const result = await parseClaudeJsonl(path)
    expect(result).toBeNull()
  })

  it('parses a simple session with user and assistant records', async () => {
    const path = writeJsonl('simple-session.jsonl', [
      {
        type: 'user',
        timestamp: '2026-01-01T10:00:00Z',
        message: { role: 'user', content: 'Hello' },
      },
      {
        type: 'assistant',
        timestamp: '2026-01-01T10:05:00Z',
        message: {
          role: 'assistant',
          model: 'claude-sonnet-4-5-20250929',
          content: [
            { type: 'text', text: 'Hi there!' },
          ],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_read_input_tokens: 20,
            cache_creation_input_tokens: 10,
          },
        },
      },
    ])

    // Rename to simulate UUID path
    const uuidPath = join(TMP, 'a1b2c3d4-e5f6-7890-abcd-ef1234567890.jsonl')
    const { renameSync } = await import('node:fs')
    renameSync(path, uuidPath)

    const result = await parseClaudeJsonl(uuidPath)
    expect(result).not.toBeNull()
    expect(result!.messageCount).toBe(2)
    expect(result!.totalInputTokens).toBe(100)
    expect(result!.totalOutputTokens).toBe(50)
    expect(result!.totalCacheReadTokens).toBe(20)
    expect(result!.totalCacheCreateTokens).toBe(10)
    expect(result!.model).toBe('claude-sonnet-4-5-20250929')
    expect(result!.durationSeconds).toBe(300) // 5 minutes
    expect(result!.sessionId).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890')
  })

  it('counts tool_use blocks in assistant content', async () => {
    const path = writeJsonl('tool-use.jsonl', [
      {
        type: 'user',
        timestamp: '2026-01-01T10:00:00Z',
        message: { role: 'user', content: 'Read file.ts' },
      },
      {
        type: 'assistant',
        timestamp: '2026-01-01T10:00:30Z',
        message: {
          role: 'assistant',
          model: 'claude-sonnet-4-5-20250929',
          content: [
            { type: 'text', text: 'Let me read that file.' },
            { type: 'tool_use', id: 'tool_1', name: 'Read', input: {} },
            { type: 'tool_use', id: 'tool_2', name: 'Edit', input: {} },
          ],
          usage: { input_tokens: 200, output_tokens: 100 },
        },
      },
    ])
    const result = await parseClaudeJsonl(path)
    expect(result).not.toBeNull()
    expect(result!.toolUseCount).toBe(2)
  })

  it('ignores system, summary, queue-operation records', async () => {
    const path = writeJsonl('mixed-types.jsonl', [
      { type: 'system', timestamp: '2026-01-01T10:00:00Z', content: 'Init' },
      { type: 'queue-operation', timestamp: '2026-01-01T10:00:01Z' },
      { type: 'summary', content: 'Session summary' },
      {
        type: 'user',
        timestamp: '2026-01-01T10:01:00Z',
        message: { role: 'user', content: 'Hi' },
      },
      {
        type: 'assistant',
        timestamp: '2026-01-01T10:02:00Z',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello' }],
          usage: { input_tokens: 50, output_tokens: 25 },
        },
      },
    ])
    const result = await parseClaudeJsonl(path)
    expect(result).not.toBeNull()
    expect(result!.messageCount).toBe(2) // only user + assistant
    expect(result!.totalInputTokens).toBe(50)
  })

  it('handles malformed JSON lines gracefully', async () => {
    const path = join(TMP, 'malformed.jsonl')
    writeFileSync(
      path,
      '{"type":"user","timestamp":"2026-01-01T10:00:00Z","message":{"role":"user","content":"Hi"}}\n' +
        'NOT VALID JSON\n' +
        '{"type":"assistant","timestamp":"2026-01-01T10:01:00Z","message":{"role":"assistant","content":[{"type":"text","text":"Hello"}],"usage":{"input_tokens":10,"output_tokens":5}}}\n'
    )
    const result = await parseClaudeJsonl(path)
    expect(result).not.toBeNull()
    expect(result!.messageCount).toBe(2)
  })

  it('accumulates tokens across multiple assistant records', async () => {
    const path = writeJsonl('multi-assistant.jsonl', [
      {
        type: 'user',
        timestamp: '2026-01-01T10:00:00Z',
        message: { role: 'user', content: 'Q1' },
      },
      {
        type: 'assistant',
        timestamp: '2026-01-01T10:01:00Z',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'A1' }],
          usage: { input_tokens: 100, output_tokens: 50 },
        },
      },
      {
        type: 'user',
        timestamp: '2026-01-01T10:02:00Z',
        message: { role: 'user', content: 'Q2' },
      },
      {
        type: 'assistant',
        timestamp: '2026-01-01T10:03:00Z',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'A2' }],
          usage: { input_tokens: 150, output_tokens: 75 },
        },
      },
    ])
    const result = await parseClaudeJsonl(path)
    expect(result).not.toBeNull()
    expect(result!.messageCount).toBe(4)
    expect(result!.totalInputTokens).toBe(250)
    expect(result!.totalOutputTokens).toBe(125)
    expect(result!.durationSeconds).toBe(180) // 3 minutes
  })

  it('extracts project path from directory structure', async () => {
    const projectDir = join(TMP, '.claude', 'projects', '-home-user-myproject')
    mkdirSync(projectDir, { recursive: true })
    const path = writeJsonl('proj-session.jsonl', [
      {
        type: 'user',
        timestamp: '2026-01-01T10:00:00Z',
        message: { role: 'user', content: 'Hi' },
      },
      {
        type: 'assistant',
        timestamp: '2026-01-01T10:01:00Z',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello' }],
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      },
    ])
    const { renameSync } = await import('node:fs')
    const destPath = join(projectDir, 'session.jsonl')
    renameSync(path, destPath)

    const result = await parseClaudeJsonl(destPath)
    expect(result).not.toBeNull()
    expect(result!.projectPath).toBe('-home-user-myproject')
  })
})
