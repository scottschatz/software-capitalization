import { readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export interface JsonlFile {
  path: string
  projectDir: string // encoded project path (e.g., -home-sschatz-projects-foo)
  modifiedAt: Date
  sizeBytes: number
}

/**
 * Scan ~/.claude/projects/ for JSONL files, optionally filtering by modification time.
 *
 * File structure:
 *   ~/.claude/projects/<encoded-path>/<uuid>.jsonl        (interactive sessions)
 *   ~/.claude/projects/<encoded-path>/agent-*.jsonl        (top-level agent files)
 *   ~/.claude/projects/<encoded-path>/<uuid>/subagents/agent-*.jsonl  (subagent files)
 */
export function scanClaudeProjects(
  claudeDataDir?: string,
  sinceDate?: Date
): JsonlFile[] {
  const baseDir = resolveClaudeDir(claudeDataDir)
  if (!existsSync(baseDir)) {
    return []
  }

  const files: JsonlFile[] = []

  // Each subdirectory in projects/ is an encoded project path
  const projectDirs = readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())

  for (const projDir of projectDirs) {
    const projPath = join(baseDir, projDir.name)
    collectJsonlFiles(projPath, projDir.name, files, sinceDate)
  }

  return files
}

function collectJsonlFiles(
  dirPath: string,
  projectDir: string,
  files: JsonlFile[],
  sinceDate?: Date
): void {
  let entries
  try {
    entries = readdirSync(dirPath, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name)

    if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      try {
        const stat = statSync(fullPath)

        // Skip empty files
        if (stat.size === 0) continue

        // Skip files not modified since last sync
        if (sinceDate && stat.mtime < sinceDate) continue

        files.push({
          path: fullPath,
          projectDir,
          modifiedAt: stat.mtime,
          sizeBytes: stat.size,
        })
      } catch {
        // Skip inaccessible files
      }
    }

    // Recurse into UUID directories to find subagents/
    if (entry.isDirectory()) {
      // Check for subagents subdirectory
      const subagentsDir = join(fullPath, 'subagents')
      if (existsSync(subagentsDir)) {
        collectJsonlFiles(subagentsDir, projectDir, files, sinceDate)
      }
    }
  }
}

function resolveClaudeDir(claudeDataDir?: string): string {
  if (claudeDataDir) {
    return claudeDataDir.replace(/^~/, homedir())
  }
  return join(homedir(), '.claude', 'projects')
}
