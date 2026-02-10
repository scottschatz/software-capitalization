import { loadConfig, saveConfig, getClaudeDataDirs } from '../config.js'
import { scanClaudeProjects } from '../parsers/claude-scanner.js'
import { parseClaudeJsonl } from '../parsers/claude-jsonl.js'
import { parseGitLog } from '../parsers/git-log.js'
import { discoverProjects } from '../parsers/env-scanner.js'
import { fetchProjects, postSync, postDiscover, fetchAgentConfig, fetchLastSync, reportAgentState, AGENT_VERSION } from '../api-client.js'
import type { SyncPayload, SyncSession, SyncCommit } from '../api-client.js'
import { hostname, platform, release } from 'node:os'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { updateTimers } from '../timer-updater.js'

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return -1
    if ((pa[i] || 0) > (pb[i] || 0)) return 1
  }
  return 0
}

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
    const discovered = discoverProjects(getClaudeDataDirs(config), config.excludePaths)
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
  } else {
    // No local lastSync — check server for last successful sync
    try {
      const serverSync = await fetchLastSync(config)
      if (serverSync.lastSync) {
        sinceDate = new Date(serverSync.lastSync.completedAt)
        console.log(`  Resuming from server last sync: ${sinceDate.toISOString()}`)
        config.lastSync = sinceDate.toISOString()
        saveConfig(config)
      }
    } catch {
      // Non-fatal — will do full scan if server unreachable
    }
  }

  // 3. Scan Claude JSONL files
  console.log('  Scanning Claude Code sessions...')
  const jsonlFiles = scanClaudeProjects(getClaudeDataDirs(config), sinceDate, config.excludePaths)
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
      dailyBreakdown: metrics.dailyBreakdown,
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
        // Skip repo paths that don't exist on this machine (registered by another developer)
        if (!existsSync(repo.repoPath)) continue

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

    // Report machine state to server
    const hooksDir = join(homedir(), '.cap-agent', 'hooks')
    const hooksInstalled = existsSync(join(hooksDir, 'post-tool-use.sh')) && existsSync(join(hooksDir, 'stop.sh'))
    const allDiscovered = discoverProjects(getClaudeDataDirs(config), undefined) // full list without excludes
    await reportAgentState(config, {
      hostname: hostname(),
      osInfo: `${platform()} ${release()}`,
      discoveredPaths: allDiscovered.map(p => ({
        localPath: p.localPath,
        claudePath: p.claudePath,
        hasGit: p.hasGit,
        excluded: config.excludePaths?.some(ex => p.localPath.includes(ex) || (p.claudePath?.includes(ex) ?? false)) ?? false,
      })),
      hooksInstalled,
    })

    // Pull remote config and apply settings
    const remoteConfig = await fetchAgentConfig(config)
    if (remoteConfig) {
      // Apply schedule updates if config version changed
      if (remoteConfig.configVersion !== config.lastConfigVersion) {
        const timerUpdates = updateTimers(remoteConfig)
        if (timerUpdates.length > 0) {
          console.log('\n  Schedule updated from server:')
          for (const u of timerUpdates) {
            console.log(`    ${u.file}: ${u.detail}`)
          }
        }
        config.lastConfigVersion = remoteConfig.configVersion
      }

      // Apply server-managed agent settings
      if (remoteConfig.claudeDataDirs?.length) {
        config.claudeDataDirs = remoteConfig.claudeDataDirs
      }
      if (remoteConfig.excludePaths) {
        config.excludePaths = remoteConfig.excludePaths
      }

      saveConfig(config)

      // Version warnings
      if (remoteConfig.minSupportedVersion && compareVersions(AGENT_VERSION, remoteConfig.minSupportedVersion) < 0) {
        console.log(`\n  WARNING: Agent version ${AGENT_VERSION} is no longer supported (minimum: ${remoteConfig.minSupportedVersion}).`)
        console.log(`  Run 'cap update' to upgrade.`)
      } else if (remoteConfig.latestVersion && compareVersions(AGENT_VERSION, remoteConfig.latestVersion) < 0) {
        console.log(`\n  Update available: ${AGENT_VERSION} -> ${remoteConfig.latestVersion}. Run 'cap update' to upgrade.`)
      }
    }
  } catch (err) {
    console.error(`  Sync failed: ${err instanceof Error ? err.message : err}`)
    process.exitCode = 1
  }
}
