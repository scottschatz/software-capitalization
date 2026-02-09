import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock dependencies before importing route
vi.mock('@/lib/get-developer', () => ({
  getDeveloper: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    periodLock: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}))

import { GET, POST } from './route'
import { getDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'

const mockGetDeveloper = getDeveloper as ReturnType<typeof vi.fn>
const mockPrisma = prisma as unknown as {
  periodLock: {
    findUnique: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
    upsert: ReturnType<typeof vi.fn>
  }
}

describe('GET /api/periods', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetDeveloper.mockResolvedValue(null)

    const req = new NextRequest('http://localhost:3000/api/periods')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('returns all period locks when no query params', async () => {
    mockGetDeveloper.mockResolvedValue({
      id: 'dev-1',
      email: 'dev@test.com',
      displayName: 'Dev',
      role: 'developer',
    })

    const locks = [
      { id: 'lock-1', year: 2026, month: 1, status: 'locked', lockedBy: { displayName: 'Admin', email: 'admin@test.com' } },
      { id: 'lock-2', year: 2025, month: 12, status: 'open', lockedBy: null },
    ]
    mockPrisma.periodLock.findMany.mockResolvedValue(locks)

    const req = new NextRequest('http://localhost:3000/api/periods')
    const res = await GET(req)
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json).toHaveLength(2)
    expect(json[0].status).toBe('locked')
  })

  it('returns a specific period lock when year and month are provided', async () => {
    mockGetDeveloper.mockResolvedValue({
      id: 'dev-1',
      email: 'dev@test.com',
      displayName: 'Dev',
      role: 'developer',
    })

    mockPrisma.periodLock.findUnique.mockResolvedValue({
      id: 'lock-1',
      year: 2026,
      month: 1,
      status: 'locked',
      lockedBy: { displayName: 'Admin', email: 'admin@test.com' },
    })

    const req = new NextRequest('http://localhost:3000/api/periods?year=2026&month=1')
    const res = await GET(req)
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.status).toBe('locked')
    expect(json.year).toBe(2026)
  })

  it('returns default open status when no lock record exists', async () => {
    mockGetDeveloper.mockResolvedValue({
      id: 'dev-1',
      email: 'dev@test.com',
      displayName: 'Dev',
      role: 'developer',
    })

    mockPrisma.periodLock.findUnique.mockResolvedValue(null)

    const req = new NextRequest('http://localhost:3000/api/periods?year=2026&month=6')
    const res = await GET(req)
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.status).toBe('open')
    expect(json.year).toBe(2026)
    expect(json.month).toBe(6)
  })

  it('returns 400 for invalid month', async () => {
    mockGetDeveloper.mockResolvedValue({
      id: 'dev-1',
      email: 'dev@test.com',
      displayName: 'Dev',
      role: 'developer',
    })

    const req = new NextRequest('http://localhost:3000/api/periods?year=2026&month=13')
    const res = await GET(req)
    expect(res.status).toBe(400)
  })
})

describe('POST /api/periods', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    mockGetDeveloper.mockResolvedValue(null)

    const req = new NextRequest('http://localhost:3000/api/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: 2026, month: 1, status: 'locked' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
  })

  it('returns 403 when user is not admin', async () => {
    mockGetDeveloper.mockResolvedValue({
      id: 'dev-1',
      email: 'dev@test.com',
      displayName: 'Dev',
      role: 'developer',
    })

    const req = new NextRequest('http://localhost:3000/api/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: 2026, month: 1, status: 'locked' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(403)

    const json = await res.json()
    expect(json.error).toBe('Admin access required')
  })

  it('returns 403 when user is manager (not admin)', async () => {
    mockGetDeveloper.mockResolvedValue({
      id: 'mgr-1',
      email: 'mgr@test.com',
      displayName: 'Manager',
      role: 'manager',
    })

    const req = new NextRequest('http://localhost:3000/api/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: 2026, month: 1, status: 'locked' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
  })

  it('creates/updates a period lock when admin', async () => {
    mockGetDeveloper.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@test.com',
      displayName: 'Admin',
      role: 'admin',
    })

    const lockResult = {
      id: 'lock-1',
      year: 2026,
      month: 1,
      status: 'locked',
      lockedById: 'admin-1',
      lockedAt: new Date().toISOString(),
      lockedBy: { displayName: 'Admin', email: 'admin@test.com' },
    }
    mockPrisma.periodLock.upsert.mockResolvedValue(lockResult)

    const req = new NextRequest('http://localhost:3000/api/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: 2026, month: 1, status: 'locked' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.status).toBe('locked')
    expect(mockPrisma.periodLock.upsert).toHaveBeenCalledOnce()
  })

  it('returns 400 for invalid status value', async () => {
    mockGetDeveloper.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@test.com',
      displayName: 'Admin',
      role: 'admin',
    })

    const req = new NextRequest('http://localhost:3000/api/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: 2026, month: 1, status: 'invalid_status' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(400)

    const json = await res.json()
    expect(json.error).toBe('Validation failed')
  })

  it('returns 400 for invalid JSON body', async () => {
    mockGetDeveloper.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@test.com',
      displayName: 'Admin',
      role: 'admin',
    })

    const req = new NextRequest('http://localhost:3000/api/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    const res = await POST(req)
    expect(res.status).toBe(400)

    const json = await res.json()
    expect(json.error).toBe('Invalid JSON')
  })

  it('allows setting soft_close status', async () => {
    mockGetDeveloper.mockResolvedValue({
      id: 'admin-1',
      email: 'admin@test.com',
      displayName: 'Admin',
      role: 'admin',
    })

    const lockResult = {
      id: 'lock-1',
      year: 2026,
      month: 1,
      status: 'soft_close',
      lockedById: null,
      lockedAt: null,
      lockedBy: null,
    }
    mockPrisma.periodLock.upsert.mockResolvedValue(lockResult)

    const req = new NextRequest('http://localhost:3000/api/periods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year: 2026, month: 1, status: 'soft_close', note: 'Month-end review in progress' }),
    })
    const res = await POST(req)
    expect(res.status).toBe(200)

    const json = await res.json()
    expect(json.status).toBe('soft_close')
  })
})
