import { loadConfig, configExists, getConfigPath } from '../config.js'
import { fetchLastSync, fetchProjects } from '../api-client.js'

export async function statusCommand(): Promise<void> {
  if (!configExists()) {
    console.log(`\n  Not configured. Run 'cap init' first.`)
    console.log(`  Config path: ${getConfigPath()}\n`)
    return
  }

  const config = loadConfig()
  console.log('\n  Cap Agent Status')
  console.log(`  Server:   ${config.serverUrl}`)
  console.log(`  Email:    ${config.developerEmail}`)
  console.log(`  Claude:   ${config.claudeDataDir}`)

  if (config.lastSync) {
    console.log(`  Last sync: ${config.lastSync}`)
  } else {
    console.log('  Last sync: never')
  }

  // Try to fetch server status
  try {
    const [lastSync, projects] = await Promise.all([
      fetchLastSync(config),
      fetchProjects(config),
    ])

    console.log(`\n  Server connection: OK`)
    console.log(`  Projects: ${projects.length}`)

    if (lastSync.lastSync) {
      console.log(`  Last server sync: ${lastSync.lastSync.completedAt}`)
      console.log(`    Sessions: ${lastSync.lastSync.sessionsCount}, Commits: ${lastSync.lastSync.commitsCount}`)
    } else {
      console.log('  Last server sync: none')
    }
  } catch (err) {
    console.log(`\n  Server connection: FAILED`)
    console.log(`  ${err instanceof Error ? err.message : err}`)
  }

  console.log()
}
