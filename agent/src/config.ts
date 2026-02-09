import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface AgentConfig {
  serverUrl: string
  apiKey: string
  claudeDataDir: string
  developerEmail: string
  vscodeSource?: {
    type: 'wakatime' | 'codetime' | 'none'
    apiKey?: string
    apiUrl?: string
  }
  lastSync?: string
  lastConfigVersion?: number
}

const CONFIG_DIR = join(homedir(), '.cap-agent')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

export function getConfigDir(): string {
  return CONFIG_DIR
}

export function getConfigPath(): string {
  return CONFIG_FILE
}

export function configExists(): boolean {
  return existsSync(CONFIG_FILE)
}

export function loadConfig(): AgentConfig {
  if (!existsSync(CONFIG_FILE)) {
    throw new Error(
      `Config not found at ${CONFIG_FILE}. Run 'cap init' first.`
    )
  }

  const raw = readFileSync(CONFIG_FILE, 'utf-8')
  return JSON.parse(raw) as AgentConfig
}

export function saveConfig(config: AgentConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 })
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 })
}
