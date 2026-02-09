import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma before importing the module under test
vi.mock('@/lib/prisma', () => ({
  prisma: {
    periodLock: {
      findUnique: vi.fn(),
    },
  },
}))

import { assertPeriodOpen, PeriodLockedError } from './period-lock'
import { prisma } from '@/lib/prisma'

const mockPrisma = prisma as unknown as {
  periodLock: {
    findUnique: ReturnType<typeof vi.fn>
  }
}

describe('assertPeriodOpen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns normally when no period lock exists', async () => {
    mockPrisma.periodLock.findUnique.mockResolvedValue(null)

    await expect(assertPeriodOpen(new Date('2026-01-15T00:00:00.000Z'))).resolves.toBeUndefined()

    expect(mockPrisma.periodLock.findUnique).toHaveBeenCalledWith({
      where: { year_month: { year: 2026, month: 1 } },
    })
  })

  it('returns normally when period status is open', async () => {
    mockPrisma.periodLock.findUnique.mockResolvedValue({
      id: 'lock-1',
      year: 2026,
      month: 1,
      status: 'open',
    })

    await expect(assertPeriodOpen(new Date('2026-01-15T00:00:00.000Z'))).resolves.toBeUndefined()
  })

  it('returns normally when period status is soft_close (does NOT block)', async () => {
    mockPrisma.periodLock.findUnique.mockResolvedValue({
      id: 'lock-1',
      year: 2026,
      month: 1,
      status: 'soft_close',
    })

    await expect(assertPeriodOpen(new Date('2026-01-15T00:00:00.000Z'))).resolves.toBeUndefined()
  })

  it('throws PeriodLockedError when period status is locked', async () => {
    mockPrisma.periodLock.findUnique.mockResolvedValue({
      id: 'lock-1',
      year: 2026,
      month: 1,
      status: 'locked',
    })

    await expect(assertPeriodOpen(new Date('2026-01-15T00:00:00.000Z'))).rejects.toThrow(PeriodLockedError)
  })

  it('PeriodLockedError has correct year, month, and message', async () => {
    mockPrisma.periodLock.findUnique.mockResolvedValue({
      id: 'lock-1',
      year: 2026,
      month: 3,
      status: 'locked',
    })

    try {
      await assertPeriodOpen(new Date('2026-03-15T00:00:00.000Z'))
      expect.fail('Should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(PeriodLockedError)
      const periodErr = err as PeriodLockedError
      expect(periodErr.year).toBe(2026)
      expect(periodErr.month).toBe(3)
      expect(periodErr.message).toBe('Period 2026-03 is locked and cannot be modified')
      expect(periodErr.name).toBe('PeriodLockedError')
    }
  })

  it('uses UTC month from the date', async () => {
    mockPrisma.periodLock.findUnique.mockResolvedValue(null)

    // December 31 UTC could be January 1 in some timezones
    await assertPeriodOpen(new Date('2026-12-31T23:59:59.000Z'))

    expect(mockPrisma.periodLock.findUnique).toHaveBeenCalledWith({
      where: { year_month: { year: 2026, month: 12 } },
    })
  })
})
