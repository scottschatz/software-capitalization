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
 *
 * 1. Scans ~/.claude/projects/ for Claude Code session directories
 * 2. For each Claude path, decodes to local path and checks if it's a git repo
 * 3. Also scans common project directories for git repos not yet linked to Claude paths
 */
export function discoverProjects(claudeDataDir?: string): DiscoveredProject[] {
  const discovered = new Map<string, DiscoveredProject>()

  // 1. Scan Claude paths
  const claudeDir = resolveClaudeDir(claudeDataDir)
  if (existsSync(claudeDir)) {
    const dirs = readdirSync(claudeDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())

    for (const dir of dirs) {
      const claudePath = dir.name
      const localPath = claudePathToLocalPath(claudePath)

      // Skip if local path doesn't exist
      if (!existsSync(localPath)) continue

      // Check if it's a directory (not a file)
      try {
        if (!statSync(localPath).isDirectory()) continue
      } catch {
        continue
      }

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
        const hasClaude = existsSync(join(claudeDir, claudePath))
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
