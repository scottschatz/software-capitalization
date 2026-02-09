import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock dependencies before importing route
vi.mock('@/lib/get-developer', () => ({
  getDeveloper: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    dailyEntry: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    dailyEntryRevision: {
      count: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/period-lock', () => ({
  assertPeriodOpen: vi.fn(),
  PeriodLockedError: class PeriodLockedError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'PeriodLockedError'
    }
  },
}))

import { PATCH } from './route'
import { getDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'

const mockGetDeveloper = getDeveloper as ReturnType<typeof vi.fn>
const mockPrisma = prisma as unknown as {
  dailyEntry: {
    findUnique: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  dailyEntryRevision: {
    count: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
  }
  $transaction: ReturnType<typeof vi.fn>
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/entries/entry-1/reject', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeParams(id = 'entry-1') {
  return { params: Promise.resolve({ id }) }
}

describe('PATCH /api/entries/[id]/reject', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetDeveloper.mockResolvedValue(null)

    const res = await PATCH(makeRequest({ reason: 'Not valid work' }), makeParams())
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

    const res = await PATCH(makeRequest({ reason: 'Not valid work' }), makeParams())
    expect(res.status).toBe(403)

    const json = await res.json()
    expect(json.error).toBe('Manager or admin access required')
  })

  it('returns 400 when body is invalid JSON', async () => {
    mockGetDeveloper.mockResolvedValue({
      id: 'mgr-1',
      email: 'mgr@test.com',
      displayName: 'Manager',
      role: 'manager',
    })

    const req = new NextRequest('http://localhost:3000/api/entries/entry-1/reject', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })

    const res = await PATCH(req, makeParams())
    expect(res.status).toBe(400)

    const json = await res.json()
    expect(json.error).toBe('Invalid JSON')
  })

  it('returns 400 when reason is too short', async () => {
    mockGetDeveloper.mockResolvedValue({
      id: 'mgr-1',
      email: 'mgr@test.com',
      displayName: 'Manager',
      role: 'manager',
    })

    const res = await PATCH(makeRequest({ reason: 'short' }), makeParams())
    expect(res.status).toBe(400)

    const json = await res.json()
    expect(json.error).toBe('Validation failed')
  })

  it('returns 400 when reason is missing', async () => {
    mockGetDeveloper.mockResolvedValue({
      id: 'mgr-1',
      email: 'mgr@test.com',
      displayName: 'Manager',
      role: 'manager',
    })

    const res = await PATCH(makeRequest({}), makeParams())
    expect(res.status).toBe(400)

    const json = await res.json()
    expect(json.error).toBe('Validation failed')
  })

  it('returns 404 when entry does not exist', async () => {
    mockGetDeveloper.mockResolvedValue({
      id: 'mgr-1',
      email: 'mgr@test.com',
      displayName: 'Manager',
      role: 'manager',
    })
    mockPrisma.dailyEntry.findUnique.mockResolvedValue(null)

    const res = await PATCH(
      makeRequest({ reason: 'This entry has incorrect hours logged' }),
      makeParams()
    )
    expect(res.status).toBe(404)

    const json = await res.json()
    expect(json.error).toBe('Entry not found')
  })

  it('returns 400 when entry status is not rejectable', async () => {
    mockGetDeveloper.mockResolvedValue({
      id: 'mgr-1',
      email: 'mgr@test.com',
      displayName: 'Manager',
      role: 'manager',
    })
    mockPrisma.dailyEntry.findUnique.mockResolvedValue({
      id: 'entry-1',
      status: 'pending',
      developerId: 'dev-1',
      date: new Date('2025-01-15'),
    })

    const res = await PATCH(
      makeRequest({ reason: 'This entry has incorrect hours logged' }),
      makeParams()
    )
    expect(res.status).toBe(400)

    const json = await res.json()
    expect(json.error).toBe('Entry must be pending approval, confirmed, or flagged')
  })

  it('returns 403 when rejecting own entry (segregation of duties)', async () => {
    mockGetDeveloper.mockResolvedValue({
      id: 'dev-1',
      email: 'dev@test.com',
      displayName: 'Dev Manager',
      role: 'manager',
    })
    mockPrisma.dailyEntry.findUnique.mockResolvedValue({
      id: 'entry-1',
      status: 'pending_approval',
      developerId: 'dev-1',
      date: new Date('2025-01-15'),
    })

    const res = await PATCH(
      makeRequest({ reason: 'This entry has incorrect hours logged' }),
      makeParams()
    )
    expect(res.status).toBe(403)

    const json = await res.json()
    expect(json.error).toBe('Cannot reject your own entries (segregation of duties)')
  })

  it('successfully rejects a pending_approval entry', async () => {
    const updatedEntry = {
      id: 'entry-1',
      status: 'rejected',
      developerId: 'dev-1',
      project: { id: 'proj-1', name: 'Test Project', phase: 'application_development' },
      developer: { displayName: 'Dev User', email: 'dev@test.com' },
    }

    mockGetDeveloper.mockResolvedValue({
      id: 'mgr-1',
      email: 'mgr@test.com',
      displayName: 'Manager',
      role: 'manager',
    })
    mockPrisma.dailyEntry.findUnique.mockResolvedValue({
      id: 'entry-1',
      status: 'pending_approval',
      developerId: 'dev-1',
      date: new Date('2025-01-15'),
    })
    mockPrisma.dailyEntryRevision.count.mockResolvedValue(2)
    mockPrisma.$transaction.mockResolvedValue([updatedEntry, {}])

    const res = await PATCH(
      makeRequest({ reason: 'This entry has incorrect hours logged' }),
      makeParams()
    )
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.status).toBe('rejected')
    expect(json.id).toBe('entry-1')

    // Verify $transaction was called with correct arguments
    expect(mockPrisma.$transaction).toHaveBeenCalledOnce()
    const txArgs = mockPrisma.$transaction.mock.calls[0][0]
    expect(txArgs).toHaveLength(2)
  })

  it('successfully rejects a flagged entry', async () => {
    const updatedEntry = {
      id: 'entry-1',
      status: 'rejected',
      developerId: 'dev-1',
    }

    mockGetDeveloper.mockResolvedValue({
      id: 'mgr-1',
      email: 'mgr@test.com',
      displayName: 'Manager',
      role: 'manager',
    })
    mockPrisma.dailyEntry.findUnique.mockResolvedValue({
      id: 'entry-1',
      status: 'flagged',
      developerId: 'dev-1',
      date: new Date('2025-01-15'),
    })
    mockPrisma.dailyEntryRevision.count.mockResolvedValue(0)
    mockPrisma.$transaction.mockResolvedValue([updatedEntry, {}])

    const res = await PATCH(
      makeRequest({ reason: 'Flagged entry needs correction before approval' }),
      makeParams()
    )
    expect(res.status).toBe(200)
  })

  it('allows admin to reject entries', async () => {
    const updatedEntry = {
      id: 'entry-1',
      status: 'rejected',
      developerId: 'dev-1',
    }

    mockGetDeveloper.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@test.com',
      displayName: 'Admin',
      role: 'admin',
    })
    mockPrisma.dailyEntry.findUnique.mockResolvedValue({
      id: 'entry-1',
      status: 'pending_approval',
      developerId: 'dev-1',
      date: new Date('2025-01-15'),
    })
    mockPrisma.dailyEntryRevision.count.mockResolvedValue(0)
    mockPrisma.$transaction.mockResolvedValue([updatedEntry, {}])

    const res = await PATCH(
      makeRequest({ reason: 'Hours do not match project records' }),
      makeParams()
    )
    expect(res.status).toBe(200)
  })
})
