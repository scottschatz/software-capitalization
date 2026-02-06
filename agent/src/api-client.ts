import type { AgentConfig } from './config.js'

export interface SyncPayload {
  syncType: 'incremental' | 'backfill'
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
  repos: { repoPath: string; repoUrl: string | null }[]
  claudePaths: { claudePath: string; localPath: string }[]
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
