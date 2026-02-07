import { execFileSync } from 'node:child_process'

export interface GitCommit {
  commitHash: string
  repoPath: string
  branch: string | null
  authorName: string
  authorEmail: string
  committedAt: string // ISO datetime
  message: string
  filesChanged: number
  insertions: number
  deletions: number
}

const SEPARATOR = '|||'
const RECORD_START = '<<<COMMIT>>>'

/**
 * Parse git log output for a given repo, optionally filtering by date range and author.
 * Uses a start marker so numstat lines fall within each commit's chunk.
 */
export function parseGitLog(
  repoPath: string,
  options: {
    since?: string // ISO date or git date format
    until?: string
    authorEmail?: string
  } = {}
): GitCommit[] {
  const args = [
    '-C',
    repoPath,
    'log',
    `--format=${RECORD_START}%H${SEPARATOR}%an${SEPARATOR}%ae${SEPARATOR}%aI${SEPARATOR}%s`,
    '--numstat',
  ]

  if (options.since) args.push(`--since=${options.since}`)
  if (options.until) args.push(`--until=${options.until}`)
  if (options.authorEmail) {
    args.push(`--author=${options.authorEmail}`)
    args.push('--regexp-ignore-case')
  }

  let output: string
  try {
    output = execFileSync('git', args, {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large repos
      timeout: 30_000,
    })
  } catch (err: unknown) {
    const error = err as { code?: string; status?: number }
    // Only silently return empty for "not a git repo" errors (exit code 128)
    if (error.status === 128) return []
    // Log other errors (buffer overflow, timeout, etc.)
    if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
      console.error(`Warning: git log output exceeded buffer for ${repoPath}. Some commits may be missing.`)
    } else if (error.code === 'ETIMEDOUT') {
      console.error(`Warning: git log timed out for ${repoPath}`)
    } else {
      console.error(`Warning: git log failed for ${repoPath}:`, (err as Error).message ?? err)
    }
    return []
  }

  if (!output.trim()) return []

  // Get current branch
  let branch: string | null = null
  try {
    branch = execFileSync('git', ['-C', repoPath, 'rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf-8',
      timeout: 5_000,
    }).trim()
  } catch {
    // Ignore
  }

  const commits: GitCommit[] = []
  const records = output.split(RECORD_START)

  for (const record of records) {
    const trimmed = record.trim()
    if (!trimmed) continue

    const lines = trimmed.split('\n')
    const headerLine = lines[0]
    if (!headerLine) continue

    const parts = headerLine.split(SEPARATOR)
    if (parts.length < 5) continue

    const [commitHash, authorName, authorEmail, committedAt, ...messageParts] = parts
    const message = messageParts.join(SEPARATOR)

    // Parse numstat lines (additions\tdeletions\tfilename)
    let filesChanged = 0
    let insertions = 0
    let deletions = 0

    for (let i = 1; i < lines.length; i++) {
      const numstatLine = lines[i].trim()
      if (!numstatLine) continue

      const numParts = numstatLine.split('\t')
      if (numParts.length >= 3) {
        filesChanged++
        const adds = parseInt(numParts[0], 10)
        const dels = parseInt(numParts[1], 10)
        if (!isNaN(adds)) insertions += adds
        if (!isNaN(dels)) deletions += dels
      }
    }

    commits.push({
      commitHash,
      repoPath,
      branch,
      authorName,
      authorEmail,
      committedAt,
      message,
      filesChanged,
      insertions,
      deletions,
    })
  }

  return commits
}
