import { describe, it, expect } from 'vitest'
import { buildCsv } from './export-csv'
import type { DailyEntryRow, ManualEntryRow } from './query-builder'

function makeDailyEntry(overrides: Partial<DailyEntryRow> = {}): DailyEntryRow {
  return {
    id: 'de-1',
    date: new Date('2026-01-15T12:00:00Z'),
    developerName: 'Alice',
    developerEmail: 'alice@test.com',
    projectName: 'Project A',
    projectPhase: 'application_development',
    hoursEstimated: 4,
    hoursConfirmed: 3.5,
    hoursRaw: null,
    adjustmentFactor: null,
    adjustmentReason: null,
    modelUsed: null,
    modelFallback: false,
    workType: null,
    confirmedBy: null,
    confirmationMethod: null,
    revisionCount: 0,
    projectAuthorized: true,
    phaseConfirmed: 'application_development',
    phaseEffective: null,
    descriptionConfirmed: 'Built feature X',
    status: 'confirmed',
    capitalizable: true,
    confirmedAt: new Date('2026-01-16T12:00:00Z'),
    requiresManagerApproval: false,
    ...overrides,
  }
}

function makeManualEntry(overrides: Partial<ManualEntryRow> = {}): ManualEntryRow {
  return {
    id: 'me-1',
    date: new Date('2026-01-15T12:00:00Z'),
    developerName: 'Bob',
    developerEmail: 'bob@test.com',
    projectName: 'Project B',
    hours: 2,
    phase: 'preliminary',
    phaseEffective: null,
    description: 'Research task',
    capitalizable: false,
    status: 'confirmed',
    approvedBy: null,
    approvedAt: null,
    ...overrides,
  }
}

describe('buildCsv', () => {
  it('should produce correct headers', () => {
    const csv = buildCsv([], [])
    const headers = csv.split('\n')[0]
    expect(headers).toBe('Date,Developer,Project,Hours,Phase (Developer),Phase (Effective),Override,Work Type,Type,Capitalizable,Status,Hours (Raw),Adj. Factor,Hours (Est.),Adjustment Reason,AI Model,Confirmed By,Confirmed At,Confirm Method,Description')
  })

  it('should return only headers for empty data', () => {
    const csv = buildCsv([], [])
    expect(csv.split('\n')).toHaveLength(1)
  })

  it('should format daily entries correctly', () => {
    const csv = buildCsv([makeDailyEntry()], [])
    const lines = csv.split('\n')
    expect(lines).toHaveLength(2)
    const row = lines[1].split(',')
    expect(row[0]).toBe('2026-01-15')
    expect(row[1]).toBe('Alice')
    expect(row[2]).toBe('Project A')
    expect(row[3]).toBe('3.5')  // hoursConfirmed takes precedence
    expect(row[7]).toBe('')     // workType (null → empty)
    expect(row[8]).toBe('AI-Generated')
    expect(row[9]).toBe('Yes')
    expect(row[10]).toBe('confirmed')
  })

  it('should fall back to hoursEstimated when hoursConfirmed is null', () => {
    const csv = buildCsv([makeDailyEntry({ hoursConfirmed: null, hoursEstimated: 5 })], [])
    const row = csv.split('\n')[1].split(',')
    expect(row[3]).toBe('5')
  })

  it('should format manual entries correctly', () => {
    const csv = buildCsv([], [makeManualEntry()])
    const lines = csv.split('\n')
    expect(lines).toHaveLength(2)
    const row = lines[1].split(',')
    expect(row[1]).toBe('Bob')
    expect(row[3]).toBe('2')
    expect(row[7]).toBe('')     // workType (N/A for manual)
    expect(row[8]).toBe('Manual')
    expect(row[9]).toBe('No')
    expect(row[10]).toBe('confirmed')
  })

  it('should sort by date then developer', () => {
    const csv = buildCsv(
      [
        makeDailyEntry({ date: new Date('2026-01-20T12:00:00Z'), developerName: 'Zara' }),
        makeDailyEntry({ id: 'de-2', date: new Date('2026-01-10T12:00:00Z'), developerName: 'Alice' }),
      ],
      [makeManualEntry({ date: new Date('2026-01-20T12:00:00Z'), developerName: 'Bob' })]
    )
    const lines = csv.split('\n').slice(1)
    expect(lines[0]).toMatch(/^2026-01-10,Alice/)
    expect(lines[1]).toMatch(/^2026-01-20,Bob/)
    expect(lines[2]).toMatch(/^2026-01-20,Zara/)
  })

  it('should escape descriptions with commas', () => {
    const csv = buildCsv(
      [makeDailyEntry({ descriptionConfirmed: 'Added login, signup, and profile' })],
      []
    )
    const line = csv.split('\n')[1]
    expect(line).toContain('"Added login, signup, and profile"')
  })

  it('should escape descriptions with double quotes', () => {
    const csv = buildCsv(
      [makeDailyEntry({ descriptionConfirmed: 'Used "useEffect" hook' })],
      []
    )
    const line = csv.split('\n')[1]
    expect(line).toContain('"Used ""useEffect"" hook"')
  })

  it('should escape descriptions with newlines', () => {
    const csv = buildCsv(
      [makeDailyEntry({ descriptionConfirmed: 'Line 1\nLine 2' })],
      []
    )
    const line = csv.split('\n').slice(1).join('\n')
    expect(line).toContain('"Line 1\nLine 2"')
  })

  it('should handle null project name for daily entries', () => {
    const csv = buildCsv([makeDailyEntry({ projectName: null })], [])
    const row = csv.split('\n')[1].split(',')
    expect(row[2]).toBe('')
  })

  it('should use projectPhase when phaseConfirmed is null', () => {
    const csv = buildCsv(
      [makeDailyEntry({ phaseConfirmed: null, projectPhase: 'preliminary' })],
      []
    )
    const row = csv.split('\n')[1].split(',')
    expect(row[4]).toBe('preliminary')
  })
})
