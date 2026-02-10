import { loadConfig, configExists, getConfigPath, getClaudeDataDirs } from '../config.js'
import { fetchLastSync, fetchProjects, fetchAgentConfig, AGENT_VERSION } from '../api-client.js'

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return -1
    if ((pa[i] || 0) > (pb[i] || 0)) return 1
  }
  return 0
}

export async function statusCommand(): Promise<void> {
  if (!configExists()) {
    console.log(`\n  Not configured. Run 'cap init' first.`)
    console.log(`  Config path: ${getConfigPath()}\n`)
    return
  }

  const config = loadConfig()
  console.log('\n  Cap Agent Status')
  console.log(`  Version:  ${AGENT_VERSION}`)
  console.log(`  Server:   ${config.serverUrl}`)
  console.log(`  Email:    ${config.developerEmail}`)

  const dirs = getClaudeDataDirs(config)
  if (dirs.length === 1) {
    console.log(`  Claude:   ${dirs[0]}`)
  } else {
    console.log(`  Claude:   ${dirs.length} directories`)
    for (const d of dirs) {
      console.log(`            - ${d}`)
    }
  }

  if (config.excludePaths?.length) {
    console.log(`  Excludes: ${config.excludePaths.join(', ')}`)
  }

  // Try to fetch server status
  try {
    const [lastSync, projects, remoteConfig] = await Promise.all([
      fetchLastSync(config),
      fetchProjects(config),
      fetchAgentConfig(config),
    ])

    // Show last sync — prefer server-side data, fall back to local
    if (lastSync.lastSync) {
      const syncTime = new Date(lastSync.lastSync.completedAt).toLocaleString()
      console.log(`  Last sync: ${syncTime}`)
      console.log(`    Sessions: ${lastSync.lastSync.sessionsCount}, Commits: ${lastSync.lastSync.commitsCount}`)
    } else if (config.lastSync) {
      console.log(`  Last sync: ${new Date(config.lastSync).toLocaleString()}`)
    } else {
      console.log('  Last sync: never')
    }

    console.log(`\n  Server connection: OK`)
    console.log(`  Projects: ${projects.length}`)

    // Version check
    if (remoteConfig) {
      if (remoteConfig.minSupportedVersion && compareVersions(AGENT_VERSION, remoteConfig.minSupportedVersion) < 0) {
        console.log(`\n  VERSION: ${AGENT_VERSION} (UNSUPPORTED — minimum ${remoteConfig.minSupportedVersion})`)
        console.log(`  Run 'cap update' to upgrade.`)
      } else if (remoteConfig.latestVersion && compareVersions(AGENT_VERSION, remoteConfig.latestVersion) < 0) {
        console.log(`\n  VERSION: ${AGENT_VERSION} (update available: ${remoteConfig.latestVersion})`)
        console.log(`  Run 'cap update' to upgrade.`)
      } else {
        console.log(`\n  VERSION: ${AGENT_VERSION} (up to date)`)
      }
    }
  } catch (err) {
    console.log(`\n  Server connection: FAILED`)
    console.log(`  ${err instanceof Error ? err.message : err}`)
  }

  console.log()
}
