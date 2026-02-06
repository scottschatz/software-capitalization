import * as readline from 'node:readline'
import { saveConfig, configExists, getConfigPath } from '../config.js'
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

  const serverUrl = await prompt(rl, 'Server URL', 'http://localhost:3000')
  const apiKey = await prompt(rl, 'API key (from web UI Settings page)')

  if (!apiKey) {
    console.error('Error: API key is required.')
    rl.close()
    return
  }

  const developerEmail = await prompt(rl, 'Your email')
  const claudeDataDir = await prompt(rl, 'Claude Code projects directory', '~/.claude/projects')

  // Optional VS Code tracking
  console.log('\nDo you use WakaTime or Code Time for VS Code tracking? (optional)')
  console.log('  1. Skip (recommended if you primarily use Claude Code)')
  console.log('  2. WakaTime')
  console.log('  3. Code Time')
  const vscodeChoice = await prompt(rl, 'Choice', '1')

  let vscodeSource: AgentConfig['vscodeSource'] = { type: 'none' }
  if (vscodeChoice === '2') {
    const wakaApiKey = await prompt(rl, 'WakaTime API key')
    const wakaApiUrl = await prompt(rl, 'WakaTime API URL', 'https://wakatime.com/api/v1')
    vscodeSource = { type: 'wakatime', apiKey: wakaApiKey, apiUrl: wakaApiUrl }
  } else if (vscodeChoice === '3') {
    vscodeSource = { type: 'codetime' }
  }

  const config: AgentConfig = {
    serverUrl,
    apiKey,
    claudeDataDir,
    developerEmail,
    vscodeSource,
  }

  // Verify connection
  console.log('\nVerifying connection...')
  try {
    const res = await fetch(`${serverUrl}/api/agent/projects`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (res.ok) {
      const data = await res.json()
      console.log(`  Connected. ${data.projects?.length ?? 0} projects found.`)
    } else if (res.status === 401) {
      console.warn('  Warning: Authentication failed. Check your API key.')
      console.warn('  Config will be saved anyway — you can update the key later.')
    } else {
      console.warn(`  Warning: Server returned ${res.status}. Config will be saved anyway.`)
    }
  } catch (e) {
    console.warn(`  Warning: Could not connect to ${serverUrl}. Config will be saved anyway.`)
  }

  saveConfig(config)
  console.log(`\nConfig saved to ${getConfigPath()}`)
  console.log('Run \'cap sync --dry-run\' to preview what would be synced.\n')

  rl.close()
}
