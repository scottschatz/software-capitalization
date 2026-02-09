import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock dependencies before importing route
vi.mock('@/lib/get-developer', () => ({
  getDeveloper: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    dailyEntry: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

import { PATCH } from './route'
import { getDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'

const mockGetDeveloper = getDeveloper as ReturnType<typeof vi.fn>
const mockPrisma = prisma as unknown as {
  dailyEntry: {
    findMany: ReturnType<typeof vi.fn>
    updateMany: ReturnType<typeof vi.fn>
  }
  $transaction: ReturnType<typeof vi.fn>
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/entries/approve-bulk', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/entries/approve-bulk', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetDeveloper.mockResolvedValue(null)

    const res = await PATCH(makeRequest({ entryIds: ['entry-1'] }))
    expect(res.status).toBe(401)

    const json = await res.json()
    expect(json.error).toBe('Unauthorized')
  })

  it('returns 403 when user is a regular developer', async () => {
    mockGetDeveloper.mockResolvedValue({
      id: 'dev-1',
      email: 'dev@test.com',
      displayName: 'Dev User',
      role: 'developer',
    })

    const res = await PATCH(makeRequest({ entryIds: ['entry-1'] }))
    expect(res.status).toBe(403)

    const json = await res.json()
    expect(json.error).toBe('Manager or admin access required')
  })

  it('returns 400 when entryIds is empty', async () => {
    mockGetDeveloper.mockResolvedValue({
      id: 'mgr-1',
      email: 'mgr@test.com',
      displayName: 'Manager',
      role: 'manager',
    })

    const res = await PATCH(makeRequest({ entryIds: [] }))
    expect(res.status).toBe(400)

    const json = await res.json()
    expect(json.error).toBe('Validation failed')
  })

  it('returns 400 when body is invalid JSON', async () => {
    mockGetDeveloper.mockResolvedValue({
      id: 'mgr-1',
      email: 'mgr@test.com',
      displayName: 'Manager',
      role: 'manager',
    })

    const req = new NextRequest('http://localhost:3000/api/entries/approve-bulk', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })

    const res = await PATCH(req)
    expect(res.status).toBe(400)

    const json = await res.json()
    expect(json.error).toBe('Invalid JSON')
  })

  it('approves valid entries', async () => {
    mockGetDeveloper.mockResolvedValue({
      id: 'mgr-1',
      email: 'mgr@test.com',
      displayName: 'Manager',
      role: 'manager',
    })

    mockPrisma.dailyEntry.findMany.mockResolvedValue([
      { id: 'entry-1', status: 'pending_approval', developerId: 'dev-1' },
      { id: 'entry-2', status: 'confirmed', developerId: 'dev-2' },
    ])

    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        dailyEntry: {
          updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
      })
    })

    const res = await PATCH(makeRequest({ entryIds: ['entry-1', 'entry-2'] }))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.approved).toBe(2)
    expect(json.skipped).toEqual([])
  })

  it('skips own entries (segregation of duties)', async () => {
    mockGetDeveloper.mockResolvedValue({
      id: 'mgr-1',
      email: 'mgr@test.com',
      displayName: 'Manager',
      role: 'manager',
    })

    mockPrisma.dailyEntry.findMany.mockResolvedValue([
      { id: 'entry-1', status: 'pending_approval', developerId: 'mgr-1' }, // own entry
      { id: 'entry-2', status: 'pending_approval', developerId: 'dev-1' },
    ])

    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        dailyEntry: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      })
    })

    const res = await PATCH(makeRequest({ entryIds: ['entry-1', 'entry-2'] }))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.approved).toBe(1)
    expect(json.skipped).toHaveLength(1)
    expect(json.skipped[0].id).toBe('entry-1')
    expect(json.skipped[0].reason).toContain('segregation of duties')
  })

  it('returns correct counts with mixed valid, own, and not-found entries', async () => {
    mockGetDeveloper.mockResolvedValue({
      id: 'mgr-1',
      email: 'mgr@test.com',
      displayName: 'Manager',
      role: 'manager',
    })

    mockPrisma.dailyEntry.findMany.mockResolvedValue([
      { id: 'entry-1', status: 'pending_approval', developerId: 'dev-1' }, // valid
      { id: 'entry-2', status: 'pending_approval', developerId: 'mgr-1' }, // own entry
      { id: 'entry-3', status: 'pending', developerId: 'dev-2' }, // not approvable status
    ])

    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        dailyEntry: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      })
    })

    const res = await PATCH(
      makeRequest({ entryIds: ['entry-1', 'entry-2', 'entry-3', 'entry-not-found'] })
    )
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.approved).toBe(1)
    expect(json.skipped).toHaveLength(3)

    const skippedIds = json.skipped.map((s: { id: string }) => s.id)
    expect(skippedIds).toContain('entry-2')
    expect(skippedIds).toContain('entry-3')
    expect(skippedIds).toContain('entry-not-found')
  })

  it('allows admin to bulk approve entries', async () => {
    mockGetDeveloper.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@test.com',
      displayName: 'Admin',
      role: 'admin',
    })

    mockPrisma.dailyEntry.findMany.mockResolvedValue([
      { id: 'entry-1', status: 'pending_approval', developerId: 'dev-1' },
    ])

    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      return fn({
        dailyEntry: {
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
      })
    })

    const res = await PATCH(makeRequest({ entryIds: ['entry-1'] }))
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.approved).toBe(1)
    expect(json.skipped).toEqual([])
  })
})
