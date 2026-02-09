import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock dependencies before importing route
vi.mock('@/lib/get-developer', () => ({
  getDeveloper: vi.fn(),
}))

vi.mock('@/lib/prisma', () => {
  const mockDailyEntry = {
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
    aggregate: vi.fn(),
  }
  const mockDailyEntryRevision = {
    count: vi.fn(),
    create: vi.fn(),
  }
  const mockManualEntry = {
    aggregate: vi.fn(),
  }
  return {
    prisma: {
      dailyEntry: mockDailyEntry,
      dailyEntryRevision: mockDailyEntryRevision,
      manualEntry: mockManualEntry,
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
        // Pass the same mocks as the tx object so existing mock setups work
        return fn({
          dailyEntry: mockDailyEntry,
          dailyEntryRevision: mockDailyEntryRevision,
          manualEntry: mockManualEntry,
        })
      }),
    },
  }
})

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
    findUniqueOrThrow: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    aggregate: ReturnType<typeof vi.fn>
  }
  dailyEntryRevision: {
    count: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
  }
  manualEntry: {
    aggregate: ReturnType<typeof vi.fn>
  }
}

const validBody = {
  hoursConfirmed: 4,
  phaseConfirmed: 'application_development',
  descriptionConfirmed: 'Worked on feature X',
}

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/entries/entry-1/confirm', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function makeParams(id = 'entry-1') {
  return { params: Promise.resolve({ id }) }
}

describe('PATCH /api/entries/[id]/confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 403 when entry status is approved', async () => {
    mockGetDeveloper.mockResolvedValue({
      id: 'dev-1',
      email: 'dev@test.com',
      displayName: 'Dev User',
      role: 'developer',
    })
    mockPrisma.dailyEntry.findUniqueOrThrow.mockResolvedValue({
      id: 'entry-1',
      status: 'approved',
      developerId: 'dev-1',
      hoursEstimated: 4,
      hoursConfirmed: 4,
      phaseAuto: 'application_development',
      phaseConfirmed: 'application_development',
      descriptionAuto: 'Some work',
      descriptionConfirmed: 'Some work',
      adjustmentFactor: 1.0,
      hoursRaw: 4,
      projectId: 'proj-1',
      project: { requiresManagerApproval: false },
    })

    const res = await PATCH(makeRequest(validBody), makeParams())
    expect(res.status).toBe(403)

    const json = await res.json()
    expect(json.error).toBe('Cannot modify approved or rejected entries')
  })

  it('returns 403 when entry status is rejected', async () => {
    mockGetDeveloper.mockResolvedValue({
      id: 'dev-1',
      email: 'dev@test.com',
      displayName: 'Dev User',
      role: 'developer',
    })
    mockPrisma.dailyEntry.findUniqueOrThrow.mockResolvedValue({
      id: 'entry-1',
      status: 'rejected',
      developerId: 'dev-1',
      hoursEstimated: 4,
      hoursConfirmed: 4,
      phaseAuto: 'application_development',
      phaseConfirmed: 'application_development',
      descriptionAuto: 'Some work',
      descriptionConfirmed: 'Some work',
      adjustmentFactor: 1.0,
      hoursRaw: 4,
      projectId: 'proj-1',
      project: { requiresManagerApproval: false },
    })

    const res = await PATCH(makeRequest(validBody), makeParams())
    expect(res.status).toBe(403)

    const json = await res.json()
    expect(json.error).toBe('Cannot modify approved or rejected entries')
  })

  it('allows confirmation of pending entries', async () => {
    const updatedEntry = {
      id: 'entry-1',
      status: 'confirmed',
      developerId: 'dev-1',
      hoursConfirmed: 4,
      phaseConfirmed: 'application_development',
      descriptionConfirmed: 'Worked on feature X',
      project: { id: 'proj-1', name: 'Test Project', phase: 'application_development' },
    }

    mockGetDeveloper.mockResolvedValue({
      id: 'dev-1',
      email: 'dev@test.com',
      displayName: 'Dev User',
      role: 'developer',
    })
    mockPrisma.dailyEntry.findUniqueOrThrow.mockResolvedValue({
      id: 'entry-1',
      status: 'pending',
      developerId: 'dev-1',
      date: new Date('2025-01-15'),
      hoursEstimated: 4,
      hoursConfirmed: null,
      phaseAuto: 'application_development',
      phaseConfirmed: null,
      descriptionAuto: 'Worked on feature X',
      descriptionConfirmed: null,
      confirmedAt: null,
      adjustmentFactor: 1.0,
      hoursRaw: 4,
      projectId: 'proj-1',
      project: { requiresManagerApproval: false },
    })
    mockPrisma.dailyEntry.aggregate.mockResolvedValue({
      _sum: { hoursConfirmed: null, hoursEstimated: null },
    })
    mockPrisma.manualEntry.aggregate.mockResolvedValue({
      _sum: { hours: null },
    })
    mockPrisma.dailyEntryRevision.count.mockResolvedValue(0)
    mockPrisma.dailyEntry.update.mockResolvedValue(updatedEntry)

    const res = await PATCH(makeRequest(validBody), makeParams())
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.id).toBe('entry-1')
    expect(json.status).toBe('confirmed')
  })
})
