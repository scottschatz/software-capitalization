import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { execSync } from 'node:child_process'
import type { AgentRemoteConfig } from './api-client.js'

const SYSTEMD_USER_DIR = join(homedir(), '.config', 'systemd', 'user')

const SYNC_TIMER_TEMPLATE = `[Unit]
Description=Run Cap Tracker sync during business hours + late evening

[Timer]
{CALENDARS}
Persistent=true

[Install]
WantedBy=timers.target
`

const GENERATE_TIMER_TEMPLATE = `[Unit]
Description=Generate AI daily entries for yesterday

[Timer]
OnCalendar={CALENDAR}
Persistent=true

[Install]
WantedBy=timers.target
`

interface TimerUpdate {
  file: string
  changed: boolean
  detail: string
}

/**
 * Check if systemd user timers are installed and update them if the
 * server-provided schedule differs from what's on disk.
 * Returns a list of changes made, or empty array if nothing changed.
 */
export function updateTimers(remoteConfig: AgentRemoteConfig): TimerUpdate[] {
  const updates: TimerUpdate[] = []

  if (!existsSync(SYSTEMD_USER_DIR)) {
    return updates // systemd timers not installed — nothing to update
  }

  // Update sync timer
  const syncTimerPath = join(SYSTEMD_USER_DIR, 'cap-sync.timer')
  if (existsSync(syncTimerPath)) {
    const calendars = [
      `OnCalendar=${remoteConfig.syncSchedule.weekday}`,
      `OnCalendar=${remoteConfig.syncSchedule.weekend}`,
    ].join('\n')
    const newContent = SYNC_TIMER_TEMPLATE.replace('{CALENDARS}', calendars)
    const current = readFileSync(syncTimerPath, 'utf-8')

    if (current.trim() !== newContent.trim()) {
      writeFileSync(syncTimerPath, newContent)
      updates.push({
        file: 'cap-sync.timer',
        changed: true,
        detail: `weekday=${remoteConfig.syncSchedule.weekday}, weekend=${remoteConfig.syncSchedule.weekend}`,
      })
    }
  }

  // Update generate timer
  const generateTimerPath = join(SYSTEMD_USER_DIR, 'cap-generate.timer')
  if (existsSync(generateTimerPath)) {
    const newContent = GENERATE_TIMER_TEMPLATE.replace('{CALENDAR}', remoteConfig.generateSchedule)
    const current = readFileSync(generateTimerPath, 'utf-8')

    if (current.trim() !== newContent.trim()) {
      writeFileSync(generateTimerPath, newContent)
      updates.push({
        file: 'cap-generate.timer',
        changed: true,
        detail: `schedule=${remoteConfig.generateSchedule}`,
      })
    }
  }

  // Reload systemd if any timers changed
  if (updates.length > 0) {
    try {
      execSync('systemctl --user daemon-reload', { stdio: 'pipe' })
    } catch {
      // Non-fatal — user might not have systemd
    }
  }

  return updates
}
