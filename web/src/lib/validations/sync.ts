import { z } from 'zod'

export const syncSessionSchema = z.object({
  sessionId: z.string().min(1),
  projectPath: z.string().min(1),
  gitBranch: z.string().optional().nullable(),
  claudeVersion: z.string().optional().nullable(),
  slug: z.string().optional().nullable(),
  startedAt: z.string(), // ISO datetime
  endedAt: z.string().optional().nullable(),
  durationSeconds: z.number().int().optional().nullable(),
  totalInputTokens: z.number().int().default(0),
  totalOutputTokens: z.number().int().default(0),
  totalCacheReadTokens: z.number().int().default(0),
  totalCacheCreateTokens: z.number().int().default(0),
  messageCount: z.number().int().default(0),
  toolUseCount: z.number().int().default(0),
  model: z.string().optional().nullable(),
  rawJsonlPath: z.string().optional().nullable(),
  isBackfill: z.boolean().default(false),
})

export const syncCommitSchema = z.object({
  commitHash: z.string().min(1),
  repoPath: z.string().min(1),
  branch: z.string().optional().nullable(),
  authorName: z.string().min(1),
  authorEmail: z.string().min(1),
  committedAt: z.string(), // ISO datetime
  message: z.string(),
  filesChanged: z.number().int().default(0),
  insertions: z.number().int().default(0),
  deletions: z.number().int().default(0),
  isBackfill: z.boolean().default(false),
})

export const syncPayloadSchema = z.object({
  syncType: z.enum(['incremental', 'backfill']).default('incremental'),
  sessions: z.array(syncSessionSchema).default([]),
  commits: z.array(syncCommitSchema).default([]),
  fromDate: z.string().optional().nullable(),
  toDate: z.string().optional().nullable(),
})

export type SyncPayload = z.infer<typeof syncPayloadSchema>
export type SyncSession = z.infer<typeof syncSessionSchema>
export type SyncCommit = z.infer<typeof syncCommitSchema>
