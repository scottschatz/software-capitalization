import { describe, it, expect } from 'vitest'
import {
  createProjectSchema,
  updateProjectSchema,
  phaseChangeRequestSchema,
  listProjectsQuerySchema,
} from './project'

describe('createProjectSchema', () => {
  it('accepts valid minimal input', () => {
    const result = createProjectSchema.safeParse({ name: 'My Project' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('My Project')
      expect(result.data.phase).toBe('application_development')
      expect(result.data.status).toBe('active')
      expect(result.data.repos).toEqual([])
      expect(result.data.claudePaths).toEqual([])
    }
  })

  it('accepts full input', () => {
    const result = createProjectSchema.safeParse({
      name: 'Test Project',
      description: 'A test',
      businessJustification: 'Testing purposes',
      phase: 'preliminary',
      managementAuthorized: true,
      authorizationDate: '2026-01-01',
      probableToComplete: true,
      developmentUncertainty: 'medium',
      status: 'active',
      repos: [{ repoPath: '/home/user/repo', repoUrl: 'https://github.com/org/repo' }],
      claudePaths: [{ claudePath: '-home-user-repo', localPath: '/home/user/repo' }],
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty name', () => {
    const result = createProjectSchema.safeParse({ name: '' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid phase', () => {
    const result = createProjectSchema.safeParse({ name: 'Test', phase: 'invalid' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid status', () => {
    const result = createProjectSchema.safeParse({ name: 'Test', status: 'invalid' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid uncertainty level', () => {
    const result = createProjectSchema.safeParse({
      name: 'Test',
      developmentUncertainty: 'extreme',
    })
    expect(result.success).toBe(false)
  })

  it('rejects repos with empty repoPath', () => {
    const result = createProjectSchema.safeParse({
      name: 'Test',
      repos: [{ repoPath: '' }],
    })
    expect(result.success).toBe(false)
  })
})

describe('updateProjectSchema', () => {
  it('accepts empty object (all optional)', () => {
    const result = updateProjectSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts partial updates', () => {
    const result = updateProjectSchema.safeParse({
      name: 'Updated Name',
      status: 'paused',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.name).toBe('Updated Name')
      expect(result.data.status).toBe('paused')
    }
  })

  it('does not allow phase to be set directly', () => {
    // Phase is not in the schema, so it should be stripped
    const result = updateProjectSchema.safeParse({ phase: 'preliminary' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).not.toHaveProperty('phase')
    }
  })
})

describe('phaseChangeRequestSchema', () => {
  it('accepts valid phase change request', () => {
    const result = phaseChangeRequestSchema.safeParse({
      requestedPhase: 'post_implementation',
      reason: 'Project has moved to maintenance',
    })
    expect(result.success).toBe(true)
  })

  it('rejects missing reason', () => {
    const result = phaseChangeRequestSchema.safeParse({
      requestedPhase: 'application_development',
    })
    expect(result.success).toBe(false)
  })

  it('rejects empty reason', () => {
    const result = phaseChangeRequestSchema.safeParse({
      requestedPhase: 'application_development',
      reason: '',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid phase', () => {
    const result = phaseChangeRequestSchema.safeParse({
      requestedPhase: 'not_a_phase',
      reason: 'Test',
    })
    expect(result.success).toBe(false)
  })
})

describe('listProjectsQuerySchema', () => {
  it('accepts empty query', () => {
    const result = listProjectsQuerySchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('accepts valid filters', () => {
    const result = listProjectsQuerySchema.safeParse({
      status: 'active',
      phase: 'application_development',
      search: 'foo',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid status filter', () => {
    const result = listProjectsQuerySchema.safeParse({ status: 'invalid' })
    expect(result.success).toBe(false)
  })
})
