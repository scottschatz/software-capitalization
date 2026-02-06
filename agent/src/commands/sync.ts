import { loadConfig, saveConfig } from '../config.js'
import { scanClaudeProjects } from '../parsers/claude-scanner.js'
import { parseClaudeJsonl } from '../parsers/claude-jsonl.js'
import { parseGitLog } from '../parsers/git-log.js'
import { fetchProjects, postSync } from '../api-client.js'
import type { SyncPayload, SyncSession, SyncCommit } from '../api-client.js'

interface SyncOptions {
  from?: string
  to?: string
  dryRun?: boolean
  verbose?: boolean
}

export async function syncCommand(options: SyncOptions): Promise<void> {
  const config = loadConfig()
  const isBackfill = !!options.from
  const syncType = isBackfill ? 'backfill' : 'incremental'

  console.log(`\n  Cap Agent Sync (${syncType})`)
  if (options.from) console.log(`  From: ${options.from}`)
  if (options.to) console.log(`  To: ${options.to}`)
  if (options.dryRun) console.log('  Mode: dry run')
  console.log()

  // 1. Fetch project definitions from server
  console.log('  Fetching project definitions...')
  let projects
  try {
    projects = await fetchProjects(config)
    console.log(`  Found ${projects.length} projects`)
  } catch (err) {
    console.error(`  Error: ${err instanceof Error ? err.message : err}`)
    return
  }

  // 2. Determine since date
  let sinceDate: Date | undefined
  if (options.from) {
    sinceDate = new Date(options.from)
  } else if (config.lastSync) {
    sinceDate = new Date(config.lastSync)
  }
  // If no lastSync and no --from, scan everything

  // 3. Scan Claude JSONL files
  console.log('  Scanning Claude Code sessions...')
  const jsonlFiles = scanClaudeProjects(config.claudeDataDir, sinceDate)
  console.log(`  Found ${jsonlFiles.length} JSONL files to process`)

  // Build a set of known project claude paths for quick lookup
  const claudePathSet = new Set<string>()
  for (const proj of projects) {
    for (const cp of proj.claudePaths) {
      claudePathSet.add(cp.claudePath)
    }
  }

  // 4. Parse JSONL files
  const sessions: SyncSession[] = []
  let parsed = 0
  let skipped = 0

  for (const file of jsonlFiles) {
    // Only sync files matching known project claude paths
    if (!claudePathSet.has(file.projectDir)) {
      skipped++
      if (options.verbose) {
        console.log(`    Skip (unmatched): ${file.projectDir}`)
      }
      continue
    }

    if (options.verbose) {
      const sizeMB = (file.sizeBytes / 1024 / 1024).toFixed(1)
      console.log(`    Parsing: ${file.path} (${sizeMB} MB)`)
    }

    const metrics = await parseClaudeJsonl(file.path)
    if (!metrics) {
      skipped++
      continue
    }

    sessions.push({
      sessionId: metrics.sessionId,
      projectPath: metrics.projectPath,
      startedAt: metrics.startedAt!,
      endedAt: metrics.endedAt,
      durationSeconds: metrics.durationSeconds,
      totalInputTokens: metrics.totalInputTokens,
      totalOutputTokens: metrics.totalOutputTokens,
      totalCacheReadTokens: metrics.totalCacheReadTokens,
      totalCacheCreateTokens: metrics.totalCacheCreateTokens,
      messageCount: metrics.messageCount,
      toolUseCount: metrics.toolUseCount,
      model: metrics.model,
      rawJsonlPath: metrics.rawJsonlPath,
      isBackfill: isBackfill,
    })
    parsed++
  }

  console.log(`  Parsed ${parsed} sessions (${skipped} skipped)`)

  // 5. Collect git commits from project repos
  console.log('  Scanning git repositories...')
  const commits: SyncCommit[] = []

  for (const proj of projects) {
    for (const repo of proj.repos) {
      const gitCommits = parseGitLog(repo.repoPath, {
        since: options.from ?? sinceDate?.toISOString(),
        until: options.to,
        authorEmail: config.developerEmail || undefined,
      })

      for (const gc of gitCommits) {
        commits.push({
          ...gc,
          isBackfill: isBackfill,
        })
      }

      if (options.verbose && gitCommits.length > 0) {
        console.log(`    ${repo.repoPath}: ${gitCommits.length} commits`)
      }
    }
  }

  console.log(`  Found ${commits.length} commits`)

  // 6. Summary
  console.log('\n  Summary:')
  console.log(`    Sessions: ${sessions.length}`)
  console.log(`    Commits:  ${commits.length}`)

  if (sessions.length === 0 && commits.length === 0) {
    console.log('\n  Nothing to sync.')
    return
  }

  if (options.dryRun) {
    console.log('\n  Dry run complete — no data sent.')
    if (options.verbose) {
      console.log('\n  Sessions:')
      for (const s of sessions) {
        console.log(`    ${s.sessionId} | ${s.projectPath} | ${s.messageCount} msgs | ${s.totalInputTokens + s.totalOutputTokens} tokens`)
      }
      console.log('\n  Commits:')
      for (const c of commits) {
        console.log(`    ${c.commitHash.slice(0, 8)} | ${c.repoPath} | ${c.message.slice(0, 60)}`)
      }
    }
    return
  }

  // 7. POST to server
  console.log('\n  Syncing to server...')
  const payload: SyncPayload = {
    syncType,
    sessions,
    commits,
    fromDate: options.from ?? null,
    toDate: options.to ?? null,
  }

  try {
    const result = await postSync(config, payload)
    console.log(`  Done!`)
    console.log(`    Sessions: ${result.sessionsCreated} created, ${result.sessionsSkipped} skipped`)
    console.log(`    Commits:  ${result.commitsCreated} created, ${result.commitsSkipped} skipped`)

    // Update lastSync in config
    config.lastSync = new Date().toISOString()
    saveConfig(config)
  } catch (err) {
    console.error(`  Sync failed: ${err instanceof Error ? err.message : err}`)
    process.exitCode = 1
  }
}
