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
 * Scan Claude projects directories for JSONL files, optionally filtering by modification time.
 * Supports multiple base directories and path exclusion patterns.
 *
 * File structure:
 *   ~/.claude/projects/<encoded-path>/<uuid>.jsonl        (interactive sessions)
 *   ~/.claude/projects/<encoded-path>/agent-*.jsonl        (top-level agent files)
 *   ~/.claude/projects/<encoded-path>/<uuid>/subagents/agent-*.jsonl  (subagent files)
 */
export function scanClaudeProjects(
  claudeDataDirs: string | string[],
  sinceDate?: Date,
  excludePaths?: string[]
): JsonlFile[] {
  const dirs = Array.isArray(claudeDataDirs) ? claudeDataDirs : [claudeDataDirs]
  const seen = new Set<string>()
  const files: JsonlFile[] = []

  for (const dir of dirs) {
    const baseDir = resolveClaudeDir(dir)
    if (!existsSync(baseDir)) continue

    const projectDirs = readdirSync(baseDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())

    for (const projDir of projectDirs) {
      // Check exclusions against the encoded project dir name
      if (excludePaths?.some((pattern) => projDir.name.includes(pattern))) continue

      const projPath = join(baseDir, projDir.name)
      collectJsonlFiles(projPath, projDir.name, files, sinceDate, seen)
    }
  }

  return files
}

function collectJsonlFiles(
  dirPath: string,
  projectDir: string,
  files: JsonlFile[],
  sinceDate?: Date,
  seen?: Set<string>
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

        // Deduplicate across multiple base dirs
        if (seen?.has(fullPath)) continue
        seen?.add(fullPath)

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
        collectJsonlFiles(subagentsDir, projectDir, files, sinceDate, seen)
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
