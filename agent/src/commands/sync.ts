import { loadConfig, saveConfig } from '../config.js'
import { scanClaudeProjects } from '../parsers/claude-scanner.js'
import { parseClaudeJsonl } from '../parsers/claude-jsonl.js'
import { parseGitLog } from '../parsers/git-log.js'
import { discoverProjects } from '../parsers/env-scanner.js'
import { fetchProjects, postSync, postDiscover } from '../api-client.js'
import type { SyncPayload, SyncSession, SyncCommit } from '../api-client.js'

interface SyncOptions {
  from?: string
  to?: string
  dryRun?: boolean
  verbose?: boolean
  skipDiscover?: boolean
  reparse?: boolean
}

export async function syncCommand(options: SyncOptions): Promise<void> {
  const config = loadConfig()
  const isBackfill = !!options.from
  const isReparse = !!options.reparse
  const syncType: 'incremental' | 'backfill' | 'reparse' = isReparse ? 'reparse' : (isBackfill ? 'backfill' : 'incremental')

  console.log(`\n  Cap Agent Sync (${syncType})`)
  if (options.from) console.log(`  From: ${options.from}`)
  if (options.to) console.log(`  To: ${options.to}`)
  if (options.reparse) console.log('  Mode: reparse (re-extracting enhanced fields from all JSONL files)')
  if (options.dryRun) console.log('  Mode: dry run')
  console.log()

  // 0. Auto-discover projects
  if (!options.skipDiscover) {
    console.log('  Discovering projects...')
    const discovered = discoverProjects(config.claudeDataDir)
    if (discovered.length > 0 && !options.dryRun) {
      try {
        const discResult = await postDiscover(config, { projects: discovered })
        if (discResult.created > 0) {
          console.log(`  Auto-discovered ${discResult.created} new project(s)`)
        }
      } catch (err) {
        if (options.verbose) {
          console.log(`  Discovery warning: ${err instanceof Error ? err.message : err}`)
        }
        // Non-fatal — continue with sync
      }
    } else if (options.dryRun) {
      console.log(`  Would discover ${discovered.length} project(s)`)
    }
  }

  // 1. Fetch project definitions from server
  console.log('  Fetching project definitions...')
  let projects
  try {
    projects = await fetchProjects(config)
    const monitored = projects.filter((p) => p.monitored)
    console.log(`  Found ${projects.length} projects (${monitored.length} monitored)`)
    projects = monitored // Only sync monitored projects
  } catch (err) {
    console.error(`  Error: ${err instanceof Error ? err.message : err}`)
    return
  }

  // 2. Determine since date (reparse ignores dates — scans everything)
  let sinceDate: Date | undefined
  if (isReparse) {
    // Reparse scans ALL files regardless of lastSync
    sinceDate = undefined
  } else if (options.from) {
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
      toolBreakdown: metrics.toolBreakdown,
      filesReferenced: metrics.filesReferenced,
      userPromptCount: metrics.userPromptCount,
      firstUserPrompt: metrics.firstUserPrompt,
    })
    parsed++
  }

  console.log(`  Parsed ${parsed} sessions (${skipped} skipped)`)

  // 5. Collect git commits from project repos (skip for reparse — only sessions)
  const commits: SyncCommit[] = []

  if (isReparse) {
    console.log('  Skipping git commits (reparse mode — sessions only)')
  } else {
    console.log('  Scanning git repositories...')
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
  }

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
    if (result.sessionsUpdated) {
      console.log(`    Sessions: ${result.sessionsCreated} created, ${result.sessionsUpdated} updated, ${result.sessionsSkipped} skipped`)
    } else {
      console.log(`    Sessions: ${result.sessionsCreated} created, ${result.sessionsSkipped} skipped`)
    }
    console.log(`    Commits:  ${result.commitsCreated} created, ${result.commitsSkipped} skipped`)

    // Update lastSync in config
    config.lastSync = new Date().toISOString()
    saveConfig(config)
  } catch (err) {
    console.error(`  Sync failed: ${err instanceof Error ? err.message : err}`)
    process.exitCode = 1
  }
}
