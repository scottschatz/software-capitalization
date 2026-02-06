import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { parseGitLog } from './git-log.js'

const TMP = join(tmpdir(), 'cap-test-git-' + Date.now())

function git(args: string[]) {
  return execFileSync('git', ['-C', TMP, ...args], { encoding: 'utf-8' })
}

beforeAll(() => {
  mkdirSync(TMP, { recursive: true })
  git(['init'])
  git(['config', 'user.email', 'test@example.com'])
  git(['config', 'user.name', 'Test User'])

  // Create 3 commits with different file changes
  writeFileSync(join(TMP, 'file1.ts'), 'const a = 1\nconst b = 2\n')
  git(['add', 'file1.ts'])
  git(['commit', '-m', 'Add file1 with two lines'])

  writeFileSync(join(TMP, 'file2.ts'), 'export function hello() { return "world" }\n')
  git(['add', 'file2.ts'])
  git(['commit', '-m', 'Add file2 with a function'])

  writeFileSync(join(TMP, 'file1.ts'), 'const a = 1\nconst b = 2\nconst c = 3\n')
  git(['add', 'file1.ts'])
  git(['commit', '-m', 'Add third line to file1'])
})

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true })
})

describe('parseGitLog', () => {
  it('parses all commits from a repo', () => {
    const commits = parseGitLog(TMP)
    expect(commits).toHaveLength(3)
  })

  it('returns commits in reverse chronological order', () => {
    const commits = parseGitLog(TMP)
    expect(commits[0].message).toBe('Add third line to file1')
    expect(commits[1].message).toBe('Add file2 with a function')
    expect(commits[2].message).toBe('Add file1 with two lines')
  })

  it('correctly counts file stats (numstat)', () => {
    const commits = parseGitLog(TMP)

    // Most recent: modified file1.ts (1 insertion, 0 deletions for the diff)
    const latestCommit = commits[0]
    expect(latestCommit.filesChanged).toBe(1)
    expect(latestCommit.insertions).toBeGreaterThan(0)

    // Second: added file2.ts (1 file, 1 line)
    const secondCommit = commits[1]
    expect(secondCommit.filesChanged).toBe(1)
    expect(secondCommit.insertions).toBe(1)

    // First: added file1.ts (1 file, 2 lines)
    const firstCommit = commits[2]
    expect(firstCommit.filesChanged).toBe(1)
    expect(firstCommit.insertions).toBe(2)
  })

  it('populates commit metadata correctly', () => {
    const commits = parseGitLog(TMP)
    const commit = commits[0]

    expect(commit.repoPath).toBe(TMP)
    expect(commit.authorName).toBe('Test User')
    expect(commit.authorEmail).toBe('test@example.com')
    expect(commit.commitHash).toMatch(/^[0-9a-f]{40}$/)
    expect(commit.committedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(commit.branch).toBe('main')
  })

  it('filters by author email', () => {
    const commits = parseGitLog(TMP, { authorEmail: 'nonexistent@example.com' })
    expect(commits).toHaveLength(0)

    const realCommits = parseGitLog(TMP, { authorEmail: 'test@example.com' })
    expect(realCommits).toHaveLength(3)
  })

  it('returns empty array for non-existent repo', () => {
    const commits = parseGitLog('/nonexistent/repo/path')
    expect(commits).toHaveLength(0)
  })

  it('returns empty array for non-git directory', () => {
    const nonGitDir = join(tmpdir(), 'cap-test-nongit-' + Date.now())
    mkdirSync(nonGitDir, { recursive: true })
    const commits = parseGitLog(nonGitDir)
    expect(commits).toHaveLength(0)
    rmSync(nonGitDir, { recursive: true, force: true })
  })

  it('handles --since date filter', () => {
    // All commits are from just now, so a future date should return nothing
    const commits = parseGitLog(TMP, { since: '2099-01-01' })
    expect(commits).toHaveLength(0)

    // A past date should return all
    const allCommits = parseGitLog(TMP, { since: '2020-01-01' })
    expect(allCommits).toHaveLength(3)
  })
})
