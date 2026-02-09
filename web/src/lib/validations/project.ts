import { z } from 'zod'

// Valid enum values matching Prisma schema
export const PROJECT_PHASES = ['preliminary', 'application_development', 'post_implementation'] as const
export const PROJECT_STATUSES = ['active', 'paused', 'completed', 'abandoned'] as const
export const UNCERTAINTY_LEVELS = ['low', 'medium', 'high'] as const
export const PHASE_CHANGE_STATUSES = ['pending', 'approved', 'rejected'] as const

// --- Repo & Claude Path sub-schemas ---

export const repoSchema = z.object({
  repoPath: z.string().min(1, 'Repo path is required'),
  repoUrl: z.string().optional().nullable(),
})

export const claudePathSchema = z.object({
  claudePath: z.string().min(1, 'Claude path is required'),
  localPath: z.string().min(1, 'Local path is required'),
})

// --- Create Project ---

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(200),
  description: z.string().optional().nullable(),
  businessJustification: z.string().optional().nullable(),
  phase: z.enum(PROJECT_PHASES).default('application_development'),
  managementAuthorized: z.boolean().default(false),
  authorizationDate: z.string().optional().nullable(), // ISO date string
  authorizationEvidence: z.string().optional().nullable(),
  probableToComplete: z.boolean().default(true),
  developmentUncertainty: z.enum(UNCERTAINTY_LEVELS).default('low'),
  status: z.enum(PROJECT_STATUSES).default('active'),
  expectedCompletion: z.string().optional().nullable(), // ISO date string
  repos: z.array(repoSchema).default([]),
  claudePaths: z.array(claudePathSchema).default([]),
})

export type CreateProjectInput = z.infer<typeof createProjectSchema>

// --- Update Project (all fields optional except id) ---

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional().nullable(),
  businessJustification: z.string().optional().nullable(),
  managementAuthorized: z.boolean().optional(),
  authorizationDate: z.string().optional().nullable(),
  authorizationEvidence: z.string().optional().nullable(),
  probableToComplete: z.boolean().optional(),
  developmentUncertainty: z.enum(UNCERTAINTY_LEVELS).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
  expectedCompletion: z.string().optional().nullable(),
  goLiveDate: z.string().optional().nullable(),
  // Phase is NOT updatable directly — must use phase change request or admin direct change
  repos: z.array(repoSchema).optional(),
  claudePaths: z.array(claudePathSchema).optional(),
})

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>

// --- Phase Change Request ---

export const phaseChangeRequestSchema = z.object({
  requestedPhase: z.enum(PROJECT_PHASES),
  reason: z.string().min(1, 'A reason for the phase change is required'),
})

export type PhaseChangeRequestInput = z.infer<typeof phaseChangeRequestSchema>

// --- Phase Change Review (approve/reject) ---

export const phaseChangeReviewSchema = z.object({
  reviewNote: z.string().optional().nullable(),
})

export type PhaseChangeReviewInput = z.infer<typeof phaseChangeReviewSchema>

// --- Direct Phase Change (admin only) ---

export const directPhaseChangeSchema = z.object({
  newPhase: z.enum(PROJECT_PHASES),
  reason: z.string().min(1, 'A reason for the phase change is required'),
  effectiveDate: z.string().optional().nullable(), // ISO date string, defaults to today
  goLiveDate: z.string().optional().nullable(), // ISO date string, auto-set for post_implementation
})

export type DirectPhaseChangeInput = z.infer<typeof directPhaseChangeSchema>

// --- Create Enhancement Project ---

export const createEnhancementSchema = z.object({
  enhancementLabel: z.string().min(1, 'Enhancement label is required').max(200),
  description: z.string().optional().nullable(),
})

export type CreateEnhancementInput = z.infer<typeof createEnhancementSchema>

// --- List Projects Query ---

export const listProjectsQuerySchema = z.object({
  status: z.enum(PROJECT_STATUSES).optional(),
  phase: z.enum(PROJECT_PHASES).optional(),
  search: z.string().optional(),
  developerId: z.string().optional(),
})

export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>
