import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { loadConfig } from '../config.js'

const HOOKS_DIR = join(homedir(), '.cap-agent', 'hooks')
const CLAUDE_SETTINGS_PATH = join(homedir(), '.claude', 'settings.json')

const HOOK_SCRIPTS = {
  'post-tool-use.sh': generatePostToolUseScript,
  'stop.sh': generateStopScript,
}

export async function hooksInstallCommand(): Promise<void> {
  const config = loadConfig()

  console.log('\n  Installing Claude Code hooks...\n')

  // 1. Create hooks directory
  if (!existsSync(HOOKS_DIR)) {
    mkdirSync(HOOKS_DIR, { recursive: true })
  }

  // 2. Write hook scripts
  for (const [filename, generator] of Object.entries(HOOK_SCRIPTS)) {
    const scriptPath = join(HOOKS_DIR, filename)
    const content = generator(config.serverUrl, config.apiKey)
    writeFileSync(scriptPath, content, 'utf-8')
    chmodSync(scriptPath, 0o755)
    console.log(`  Created ${scriptPath}`)
  }

  // 3. Update ~/.claude/settings.json
  let settings: Record<string, unknown> = {}
  if (existsSync(CLAUDE_SETTINGS_PATH)) {
    try {
      settings = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8'))
    } catch {
      console.log('  Warning: Could not parse existing settings.json, creating new one')
    }
  }

  const hooks = (settings.hooks ?? {}) as Record<string, unknown[]>

  // Add PostToolUse hook
  const postToolUseEntry = {
    type: 'command' as const,
    command: join(HOOKS_DIR, 'post-tool-use.sh'),
  }
  hooks.PostToolUse = mergeHookEntry(hooks.PostToolUse as Record<string, unknown>[] | undefined, postToolUseEntry)

  // Add Stop hook
  const stopEntry = {
    type: 'command' as const,
    command: join(HOOKS_DIR, 'stop.sh'),
  }
  hooks.Stop = mergeHookEntry(hooks.Stop as Record<string, unknown>[] | undefined, stopEntry)

  settings.hooks = hooks

  // Ensure .claude directory exists
  const claudeDir = join(homedir(), '.claude')
  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true })
  }

  writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf-8')
  console.log(`  Updated ${CLAUDE_SETTINGS_PATH}`)

  console.log('\n  Hooks installed successfully!')
  console.log('  PostToolUse and Stop hooks are now active for all Claude sessions.')
}

export async function hooksUninstallCommand(): Promise<void> {
  console.log('\n  Uninstalling Claude Code hooks...\n')

  // 1. Remove hook scripts
  for (const filename of Object.keys(HOOK_SCRIPTS)) {
    const scriptPath = join(HOOKS_DIR, filename)
    if (existsSync(scriptPath)) {
      unlinkSync(scriptPath)
      console.log(`  Removed ${scriptPath}`)
    }
  }

  // 2. Remove our entries from settings.json
  if (existsSync(CLAUDE_SETTINGS_PATH)) {
    try {
      const settings = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8'))
      const hooks = settings.hooks as Record<string, unknown[]> | undefined
      if (hooks) {
        for (const event of ['PostToolUse', 'Stop']) {
          if (Array.isArray(hooks[event])) {
            hooks[event] = (hooks[event] as Record<string, unknown>[]).filter(
              (h) => typeof h.command !== 'string' || !h.command.includes('.cap-agent/hooks/')
            )
            if (hooks[event].length === 0) delete hooks[event]
          }
        }
        if (Object.keys(hooks).length === 0) {
          delete settings.hooks
        } else {
          settings.hooks = hooks
        }
        writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf-8')
        console.log(`  Updated ${CLAUDE_SETTINGS_PATH}`)
      }
    } catch {
      console.log('  Warning: Could not update settings.json')
    }
  }

  console.log('\n  Hooks uninstalled successfully.')
}

export async function hooksStatusCommand(): Promise<void> {
  console.log('\n  Claude Code Hooks Status\n')

  // Check hook scripts exist
  let allScriptsExist = true
  for (const filename of Object.keys(HOOK_SCRIPTS)) {
    const scriptPath = join(HOOKS_DIR, filename)
    const exists = existsSync(scriptPath)
    console.log(`  ${exists ? '\u2713' : '\u2717'} ${scriptPath}`)
    if (!exists) allScriptsExist = false
  }

  // Check settings.json
  let hooksConfigured = false
  if (existsSync(CLAUDE_SETTINGS_PATH)) {
    try {
      const settings = JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, 'utf-8'))
      const hooks = settings.hooks as Record<string, unknown[]> | undefined
      if (hooks) {
        const hasPostToolUse = Array.isArray(hooks.PostToolUse) &&
          hooks.PostToolUse.some((h: unknown) => {
            const hook = h as Record<string, unknown>
            return typeof hook.command === 'string' && hook.command.includes('.cap-agent/hooks/')
          })
        const hasStop = Array.isArray(hooks.Stop) &&
          hooks.Stop.some((h: unknown) => {
            const hook = h as Record<string, unknown>
            return typeof hook.command === 'string' && hook.command.includes('.cap-agent/hooks/')
          })

        console.log(`  ${hasPostToolUse ? '\u2713' : '\u2717'} PostToolUse hook in settings.json`)
        console.log(`  ${hasStop ? '\u2713' : '\u2717'} Stop hook in settings.json`)
        hooksConfigured = hasPostToolUse && hasStop
      }
    } catch {
      console.log('  \u2717 Could not read settings.json')
    }
  } else {
    console.log('  \u2717 ~/.claude/settings.json not found')
  }

  // Check config
  try {
    const config = loadConfig()
    console.log(`  ${config.serverUrl ? '\u2713' : '\u2717'} Server URL: ${config.serverUrl}`)
    console.log(`  ${config.apiKey ? '\u2713' : '\u2717'} API key configured`)
  } catch {
    console.log('  \u2717 Agent not configured (run cap init)')
  }

  console.log()
  if (allScriptsExist && hooksConfigured) {
    console.log('  Status: INSTALLED and ready')
  } else {
    console.log('  Status: NOT INSTALLED (run cap hooks install)')
  }
}

function mergeHookEntry(
  existing: Record<string, unknown>[] | undefined,
  entry: Record<string, unknown>
): Record<string, unknown>[] {
  const list = existing ?? []
  // Remove any existing cap-agent hook entry
  const filtered = list.filter(
    (h) => typeof h.command !== 'string' || !h.command.includes('.cap-agent/hooks/')
  )
  filtered.push(entry)
  return filtered
}

function generatePostToolUseScript(serverUrl: string, apiKey: string): string {
  return `#!/bin/bash
# Cap Agent — PostToolUse hook
# Captures tool usage events and sends to capitalization server
# Fire-and-forget: must never block Claude sessions

INPUT=$(cat)
SERVER="${serverUrl}"
KEY="${apiKey}"

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
PROJECT_PATH=$(echo "$INPUT" | jq -r '.cwd // empty')

# Skip if missing required fields
[ -z "$SESSION_ID" ] || [ -z "$TOOL_NAME" ] && exit 0

# Sanitize input: keep file paths and short commands, strip content
TOOL_INPUT=$(echo "$INPUT" | jq -c '{
  file_path: (.tool_input.file_path // null),
  path: (.tool_input.path // null),
  command: ((.tool_input.command // "") | .[:500]),
  pattern: (.tool_input.pattern // null),
  description: ((.tool_input.description // "") | .[:200])
} | with_entries(select(.value != null and .value != ""))')

# Fire and forget
curl -s -X POST "$SERVER/api/agent/hooks/tool-event" \\
  -H "Authorization: Bearer $KEY" \\
  -H "Content-Type: application/json" \\
  -d "{\\"sessionId\\":\\"$SESSION_ID\\",\\"toolName\\":\\"$TOOL_NAME\\",\\"toolInput\\":$TOOL_INPUT,\\"projectPath\\":\\"$PROJECT_PATH\\"}" \\
  > /dev/null 2>&1 &

exit 0
`
}

function generateStopScript(serverUrl: string, apiKey: string): string {
  return `#!/bin/bash
# Cap Agent — Stop hook
# Marks session end time on the server
# Fire-and-forget: must never block Claude sessions

INPUT=$(cat)
SERVER="${serverUrl}"
KEY="${apiKey}"

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')

# Skip if missing session ID
[ -z "$SESSION_ID" ] && exit 0

PROJECT_PATH=$(echo "$INPUT" | jq -r '.cwd // empty')
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

# Fire and forget
curl -s -X POST "$SERVER/api/agent/hooks/session-event" \\
  -H "Authorization: Bearer $KEY" \\
  -H "Content-Type: application/json" \\
  -d "{\\"sessionId\\":\\"$SESSION_ID\\",\\"type\\":\\"stop\\",\\"projectPath\\":\\"$PROJECT_PATH\\",\\"timestamp\\":\\"$TIMESTAMP\\"}" \\
  > /dev/null 2>&1 &

exit 0
`
}
