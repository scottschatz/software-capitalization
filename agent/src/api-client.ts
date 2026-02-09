import type { AgentConfig } from './config.js'

export interface SyncPayload {
  syncType: 'incremental' | 'backfill' | 'reparse'
  sessions: SyncSession[]
  commits: SyncCommit[]
  fromDate?: string | null
  toDate?: string | null
}

export interface SyncSession {
  sessionId: string
  projectPath: string
  gitBranch?: string | null
  claudeVersion?: string | null
  slug?: string | null
  startedAt: string
  endedAt?: string | null
  durationSeconds?: number | null
  totalInputTokens: number
  totalOutputTokens: number
  totalCacheReadTokens: number
  totalCacheCreateTokens: number
  messageCount: number
  toolUseCount: number
  model?: string | null
  rawJsonlPath?: string | null
  isBackfill: boolean
  // Enhanced fields (Phase 5)
  toolBreakdown?: Record<string, number> | null
  filesReferenced?: string[] | null
  userPromptCount?: number | null
  firstUserPrompt?: string | null
  dailyBreakdown?: Array<{
    date: string; firstTimestamp: string; lastTimestamp: string; activeMinutes: number; wallClockMinutes: number;
    messageCount: number; toolUseCount: number; userPromptCount: number;
    userPromptSamples: string[];
    userPrompts: Array<{ time: string; text: string }>;
  }> | null
}

export interface SyncCommit {
  commitHash: string
  repoPath: string
  branch?: string | null
  authorName: string
  authorEmail: string
  committedAt: string
  message: string
  filesChanged: number
  insertions: number
  deletions: number
  isBackfill: boolean
}

export interface SyncResult {
  syncLogId: string
  sessionsCreated: number
  sessionsUpdated?: number
  sessionsSkipped: number
  commitsCreated: number
  commitsSkipped: number
}

export interface LastSyncResult {
  lastSync: {
    id: string
    completedAt: string
    sessionsCount: number
    commitsCount: number
    syncType: string
  } | null
}

export interface ProjectDefinition {
  id: string
  name: string
  phase: string
  status: string
  monitored: boolean
  repos: { repoPath: string; repoUrl: string | null }[]
  claudePaths: { claudePath: string; localPath: string }[]
}

export interface DiscoverPayload {
  projects: {
    name: string
    localPath: string
    claudePath: string | null
    repoPath: string | null
    repoUrl: string | null
    hasGit: boolean
    hasClaude: boolean
  }[]
}

export interface DiscoverResult {
  created: number
  updated: number
  total: number
  projects: ProjectDefinition[]
}

export interface AgentRemoteConfig {
  configVersion: number
  syncSchedule: {
    weekday: string
    weekend: string
  }
  generateSchedule: string
}

function headers(config: AgentConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  }
}

export async function fetchProjects(config: AgentConfig): Promise<ProjectDefinition[]> {
  const res = await fetch(`${config.serverUrl}/api/agent/projects`, {
    headers: headers(config),
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch projects: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

export async function fetchLastSync(config: AgentConfig): Promise<LastSyncResult> {
  const res = await fetch(`${config.serverUrl}/api/agent/last-sync`, {
    headers: headers(config),
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch last sync: ${res.status} ${res.statusText}`)
  }
  return res.json()
}

export async function postSync(config: AgentConfig, payload: SyncPayload): Promise<SyncResult> {
  const res = await fetch(`${config.serverUrl}/api/agent/sync`, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Sync failed: ${res.status} ${res.statusText} — ${body}`)
  }
  return res.json()
}

export async function fetchAgentConfig(config: AgentConfig): Promise<AgentRemoteConfig | null> {
  try {
    const res = await fetch(`${config.serverUrl}/api/agent/config`, {
      headers: headers(config),
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null // Non-fatal — server may not support this endpoint yet
  }
}

export async function postDiscover(config: AgentConfig, payload: DiscoverPayload): Promise<DiscoverResult> {
  const res = await fetch(`${config.serverUrl}/api/agent/discover`, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Discover failed: ${res.status} ${res.statusText} — ${body}`)
  }
  return res.json()
}
