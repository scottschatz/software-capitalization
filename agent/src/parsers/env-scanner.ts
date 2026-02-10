import { readdirSync, existsSync, statSync } from 'node:fs'
import { join, basename } from 'node:path'
import { homedir } from 'node:os'
import { execFileSync } from 'node:child_process'

export interface DiscoveredProject {
  name: string
  localPath: string
  claudePath: string | null
  repoPath: string | null
  repoUrl: string | null
  hasGit: boolean
  hasClaude: boolean
}

/**
 * Scan the developer's environment to discover projects.
 * Supports multiple Claude data directories and path exclusions.
 *
 * 1. Scans Claude projects directories for Claude Code session directories
 * 2. For each Claude path, decodes to local path and checks if it's a git repo
 * 3. Also scans common project directories for git repos not yet linked to Claude paths
 */
export function discoverProjects(
  claudeDataDirs?: string | string[],
  excludePaths?: string[]
): DiscoveredProject[] {
  const discovered = new Map<string, DiscoveredProject>()
  const dirs = claudeDataDirs
    ? (Array.isArray(claudeDataDirs) ? claudeDataDirs : [claudeDataDirs])
    : [undefined]

  // 1. Scan Claude paths from all directories
  for (const dataDir of dirs) {
    const claudeDir = resolveClaudeDir(dataDir)
    if (!existsSync(claudeDir)) continue

    const entries = readdirSync(claudeDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())

    for (const dir of entries) {
      const claudePath = dir.name

      // Check exclusions
      if (excludePaths?.some((pattern) => claudePath.includes(pattern))) continue

      const localPath = claudePathToLocalPath(claudePath)

      // Skip if local path doesn't exist
      if (!existsSync(localPath)) continue

      // Check if it's a directory (not a file)
      try {
        if (!statSync(localPath).isDirectory()) continue
      } catch {
        continue
      }

      // Skip if already discovered from another dir
      if (discovered.has(localPath)) continue

      const hasGit = existsSync(join(localPath, '.git'))
      const repoUrl = hasGit ? getGitRemoteUrl(localPath) : null

      discovered.set(localPath, {
        name: basename(localPath),
        localPath,
        claudePath,
        repoPath: hasGit ? localPath : null,
        repoUrl,
        hasGit,
        hasClaude: true,
      })
    }
  }

  // Use the first resolved claude dir for the ~/projects/ scan
  const primaryClaudeDir = resolveClaudeDir(dirs[0])

  // 2. Scan ~/projects/ for git repos not yet found via Claude paths
  const projectsDir = join(homedir(), 'projects')
  if (existsSync(projectsDir)) {
    try {
      const dirs = readdirSync(projectsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())

      for (const dir of dirs) {
        const localPath = join(projectsDir, dir.name)
        if (discovered.has(localPath)) continue

        const hasGit = existsSync(join(localPath, '.git'))
        if (!hasGit) continue // Only discover git repos from projects dir

        const claudePath = localPathToClaudePath(localPath)
        const hasClaude = existsSync(join(primaryClaudeDir, claudePath))
        const repoUrl = getGitRemoteUrl(localPath)

        discovered.set(localPath, {
          name: dir.name,
          localPath,
          claudePath: hasClaude ? claudePath : null,
          repoPath: localPath,
          repoUrl,
          hasGit,
          hasClaude,
        })
      }
    } catch {
      // Can't read ~/projects/ — skip
    }
  }

  return Array.from(discovered.values()).sort((a, b) => a.name.localeCompare(b.name))
}

function resolveClaudeDir(claudeDataDir?: string): string {
  if (claudeDataDir) {
    return claudeDataDir.replace(/^~/, homedir())
  }
  return join(homedir(), '.claude', 'projects')
}

function claudePathToLocalPath(claudePath: string): string {
  if (!claudePath.startsWith('-')) return claudePath
  return claudePath.replace(/-/g, '/')
}

function localPathToClaudePath(localPath: string): string {
  return localPath.replace(/\//g, '-').replace(/^-/, '-')
}

function getGitRemoteUrl(repoPath: string): string | null {
  try {
    const result = execFileSync('git', ['-C', repoPath, 'remote', 'get-url', 'origin'], {
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim()
    return result || null
  } catch {
    return null
  }
}
