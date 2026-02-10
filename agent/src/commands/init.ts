import * as readline from 'node:readline'
import { saveConfig, configExists, getConfigPath, loadConfig } from '../config.js'
import type { AgentConfig } from '../config.js'

function prompt(rl: readline.Interface, question: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` [${defaultValue}]` : ''
  return new Promise((resolve) => {
    rl.question(`${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultValue || '')
    })
  })
}

export async function initCommand(): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  console.log('\n  Software Capitalization Agent Setup\n')

  if (configExists()) {
    const overwrite = await prompt(rl, 'Config already exists. Overwrite? (y/N)', 'N')
    if (overwrite.toLowerCase() !== 'y') {
      console.log('Aborted.')
      rl.close()
      return
    }
  }

  const serverUrl = await prompt(rl, 'Server URL', 'https://softwarecapitalization-townsquaremedia0.msappproxy.net')
  const apiKey = await prompt(rl, 'API key (from web UI Settings page)')

  if (!apiKey) {
    console.error('Error: API key is required.')
    rl.close()
    return
  }

  // Validate API key and fetch developer info from server
  let serverEmail: string | undefined
  let serverLastSync: string | undefined
  console.log('\nValidating API key...')
  const authHeaders = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
  try {
    const syncRes = await fetch(`${serverUrl}/api/agent/last-sync`, {
      headers: authHeaders,
    })
    if (syncRes.ok) {
      const syncData = await syncRes.json()
      serverEmail = syncData.developerEmail
      if (syncData.lastSync?.completedAt) {
        serverLastSync = syncData.lastSync.completedAt
      }
      console.log(`  Key valid — registered to ${serverEmail}`)
    } else if (syncRes.status === 401) {
      console.error('  Error: Invalid API key. Check your key and try again.')
      rl.close()
      return
    }
  } catch {
    console.warn('  Warning: Could not reach server to validate key. Continuing with manual setup.')
  }

  // Use server email as default, or prompt manually if server unavailable
  const developerEmail = serverEmail
    ? await prompt(rl, 'Your email', serverEmail)
    : await prompt(rl, 'Your email')
  console.log('\nClaude Code stores session logs in ~/.claude/projects/ (not your source code folder).')
  const claudeDataDir = await prompt(rl, 'Claude Code session log directory', '~/.claude/projects')

  // Additional monitored directories
  console.log('\nMonitor additional directories? (one per line, blank line to finish)')
  console.log('  Examples: ~/work/.claude/projects, ~/personal/.claude/projects')
  const extraDirs: string[] = []
  let dir = await prompt(rl, 'Additional directory (blank to skip)')
  while (dir) {
    extraDirs.push(dir)
    dir = await prompt(rl, 'Additional directory (blank to finish)')
  }

  const claudeDataDirs = [claudeDataDir, ...extraDirs]

  // Exclude patterns
  console.log('\nExclude patterns? Projects matching these are skipped. (one per line, blank to finish)')
  console.log('  Examples: node_modules, test-project, .archive')
  const excludePaths: string[] = []
  let pattern = await prompt(rl, 'Exclude pattern (blank to skip)')
  while (pattern) {
    excludePaths.push(pattern)
    pattern = await prompt(rl, 'Exclude pattern (blank to finish)')
  }

  // Optional VS Code tracking
  console.log('\nDo you use WakaTime or Code Time? (VS Code extensions that track coding time)')
  console.log('  These capture time spent editing in VS Code — useful if you do significant')
  console.log('  manual coding outside of Claude Code sessions.')
  console.log('  1. Skip (recommended — most dev time is captured via Claude Code sessions + git)')
  console.log('  2. WakaTime (wakatime.com — requires API key)')
  console.log('  3. Code Time (software.com — reads local data)')
  const vscodeChoice = await prompt(rl, 'Choice', '1')

  let vscodeSource: AgentConfig['vscodeSource'] = { type: 'none' }
  if (vscodeChoice === '2') {
    const wakaApiKey = await prompt(rl, 'WakaTime API key')
    const wakaApiUrl = await prompt(rl, 'WakaTime API URL', 'https://wakatime.com/api/v1')
    vscodeSource = { type: 'wakatime', apiKey: wakaApiKey, apiUrl: wakaApiUrl }
  } else if (vscodeChoice === '3') {
    vscodeSource = { type: 'codetime' }
  }

  // Preserve sync state from existing config
  let existingState: Pick<AgentConfig, 'lastSync' | 'lastConfigVersion'> = {}
  if (configExists()) {
    try {
      const existing = loadConfig()
      existingState = {
        ...(existing.lastSync ? { lastSync: existing.lastSync } : {}),
        ...(existing.lastConfigVersion ? { lastConfigVersion: existing.lastConfigVersion } : {}),
      }
    } catch { /* ignore parse errors */ }
  }

  const config: AgentConfig = {
    serverUrl,
    apiKey,
    claudeDataDir,
    claudeDataDirs,
    excludePaths,
    developerEmail,
    vscodeSource,
    ...existingState,
  }

  // Apply server last sync if available (prevents full re-scan)
  if (serverLastSync) {
    config.lastSync = serverLastSync
  }

  // Fetch project count for confirmation
  console.log('\nVerifying connection...')
  try {
    const res = await fetch(`${serverUrl}/api/agent/projects`, {
      headers: authHeaders,
    })
    if (res.ok) {
      const data = await res.json()
      console.log(`  Connected. ${data.projects?.length ?? 0} projects found.`)
      if (config.lastSync) {
        console.log(`  Last sync: ${new Date(config.lastSync).toLocaleString()}`)
      }
    } else {
      console.warn(`  Warning: Server returned ${res.status}.`)
    }
  } catch {
    console.warn(`  Warning: Could not connect to ${serverUrl}. Config will be saved anyway.`)
  }

  saveConfig(config)

  console.log(`\nConfig saved to ${getConfigPath()}`)
  console.log(`  Monitored: ${claudeDataDirs.join(', ')}`)
  if (excludePaths.length > 0) {
    console.log(`  Excludes:  ${excludePaths.join(', ')}`)
  }
  console.log('\nRun \'cap sync --dry-run\' to preview what would be synced.')
  console.log('You can also manage these settings from the web UI (Settings > gear icon).\n')

  rl.close()
}
