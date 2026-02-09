import { describe, it, expect } from 'vitest'
import { crossValidateEntry, type CrossValidationInput } from './cross-validate'

/** Helper: generate N historical entries with specified hours */
function makeHistorical(
  count: number,
  hoursPerDay: number,
  projectId: string | null = 'proj-1',
): CrossValidationInput['historicalEntries'] {
  return Array.from({ length: count }, (_, i) => ({
    date: new Date(`2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`),
    hoursConfirmed: hoursPerDay,
    projectId,
  }))
}

/** Helper: generate historical entries with varying hours */
function makeVaryingHistorical(
  hours: number[],
  projectId: string | null = 'proj-1',
): CrossValidationInput['historicalEntries'] {
  return hours.map((h, i) => ({
    date: new Date(`2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z`),
    hoursConfirmed: h,
    projectId,
  }))
}

describe('crossValidateEntry', () => {
  describe('edge cases — insufficient data', () => {
    it('returns no outlier with fewer than 5 data points', () => {
      const result = crossValidateEntry({
        hoursEstimate: 100,
        projectId: 'proj-1',
        projectName: 'Test Project',
        historicalEntries: makeHistorical(4, 4),
      })
      expect(result.isOutlier).toBe(false)
      expect(result.flag).toBeNull()
      expect(result.zScore).toBe(0)
    })

    it('returns no outlier with empty historical data', () => {
      const result = crossValidateEntry({
        hoursEstimate: 8,
        projectId: 'proj-1',
        projectName: 'Test Project',
        historicalEntries: [],
      })
      expect(result.isOutlier).toBe(false)
      expect(result.flag).toBeNull()
    })

    it('handles entries with null hoursConfirmed', () => {
      const entries = [
        ...makeHistorical(3, 4),
        { date: new Date('2026-01-04'), hoursConfirmed: null, projectId: 'proj-1' },
        { date: new Date('2026-01-05'), hoursConfirmed: null, projectId: 'proj-1' },
      ]
      const result = crossValidateEntry({
        hoursEstimate: 20,
        projectId: 'proj-1',
        projectName: 'Test Project',
        historicalEntries: entries,
      })
      // Only 3 valid data points (null ones are skipped), so < MIN_DATA_POINTS
      expect(result.isOutlier).toBe(false)
    })
  })

  describe('edge cases — zero variance', () => {
    it('returns no outlier when all days are identical', () => {
      const result = crossValidateEntry({
        hoursEstimate: 10,
        projectId: 'proj-1',
        projectName: 'Test Project',
        historicalEntries: makeHistorical(10, 4),
      })
      expect(result.isOutlier).toBe(false)
      expect(result.stdDev).toBe(0)
      expect(result.avgHoursPerDay).toBe(4)
    })
  })

  describe('z-score outlier detection', () => {
    it('flags when z-score exceeds +2.0', () => {
      // Mean=4, stddev ~0.63 for [3,4,3,4,5,4,3,4,5,4]
      const result = crossValidateEntry({
        hoursEstimate: 12,
        projectId: 'proj-1',
        projectName: 'Test Project',
        historicalEntries: makeVaryingHistorical([3, 4, 3, 4, 5, 4, 3, 4, 5, 4]),
      })
      expect(result.isOutlier).toBe(true)
      expect(result.flag).toBeTruthy()
      expect(result.zScore).toBeGreaterThan(2.0)
      expect(result.flag).toContain('above')
      expect(result.flag).toContain('standard deviations')
    })

    it('flags when z-score is below -2.0', () => {
      // Mean ~6, with typical 8-hour days, estimate of 0 should be far below
      const result = crossValidateEntry({
        hoursEstimate: 0,
        projectId: 'proj-1',
        projectName: 'Test Project',
        historicalEntries: makeVaryingHistorical([6, 7, 5, 8, 6, 7, 5, 8, 6, 7]),
      })
      expect(result.isOutlier).toBe(true)
      expect(result.flag).toContain('below')
      expect(result.zScore).toBeLessThan(-2.0)
    })

    it('does not flag normal variations', () => {
      // Mean ~6, estimate of 7 should be within range
      const result = crossValidateEntry({
        hoursEstimate: 7,
        projectId: 'proj-1',
        projectName: 'Test Project',
        historicalEntries: makeVaryingHistorical([6, 7, 5, 8, 6, 7, 5, 8, 6, 7]),
      })
      expect(result.isOutlier).toBe(false)
      expect(result.flag).toBeNull()
    })
  })

  describe('per-project deviation detection', () => {
    it('flags when project hours are >3x the project average', () => {
      const entries = makeHistorical(10, 2, 'proj-1')
      const result = crossValidateEntry({
        hoursEstimate: 8, // 4x the project avg of 2
        projectId: 'proj-1',
        projectName: 'Test Project',
        historicalEntries: entries,
      })
      // This may or may not also be a z-score outlier depending on stddev
      // But the project multiplier flag should be present
      expect(result.flag).toContain('3x')
      expect(result.flag).toContain('Test Project')
    })

    it('does not flag project deviation with fewer than 5 project entries', () => {
      // Mix of projects: only 3 entries for proj-1
      const entries = [
        ...makeHistorical(3, 2, 'proj-1'),
        ...makeHistorical(7, 4, 'proj-2'),
      ]
      const result = crossValidateEntry({
        hoursEstimate: 8,
        projectId: 'proj-1',
        projectName: 'Test Project',
        historicalEntries: entries,
      })
      // Should not have a project-specific flag (not enough proj-1 data)
      if (result.flag) {
        expect(result.flag).not.toContain('Test Project')
      }
    })

    it('skips project check when projectId is null', () => {
      const result = crossValidateEntry({
        hoursEstimate: 2,
        projectId: null,
        projectName: 'Unmatched',
        historicalEntries: makeVaryingHistorical([3, 4, 3, 4, 3, 4, 3, 4, 3, 4]),
      })
      // Should still compute z-score but no project-specific check
      expect(result.avgHoursPerDay).toBeGreaterThan(0)
    })
  })

  describe('multi-entry days', () => {
    it('sums multiple entries per day for total daily hours', () => {
      // Two projects per day, 2h each = 4h total per day
      const entries = [
        ...makeHistorical(5, 2, 'proj-1'),
        ...makeHistorical(5, 2, 'proj-2'),
      ]
      const result = crossValidateEntry({
        hoursEstimate: 4,
        projectId: 'proj-1',
        projectName: 'Test Project',
        historicalEntries: entries,
      })
      expect(result.avgHoursPerDay).toBe(4) // 2+2 per day
      expect(result.isOutlier).toBe(false) // 4h matches the avg
    })
  })

  describe('result metadata', () => {
    it('returns correct mean and stddev', () => {
      const hours = [2, 4, 6, 8, 10]
      const result = crossValidateEntry({
        hoursEstimate: 6,
        projectId: null,
        projectName: 'Test',
        historicalEntries: makeVaryingHistorical(hours),
      })
      // Mean = 6, variance = (16+4+0+4+16)/5 = 8, stddev = sqrt(8) ≈ 2.83
      expect(result.avgHoursPerDay).toBeCloseTo(6, 1)
      expect(result.stdDev).toBeCloseTo(Math.sqrt(8), 1)
      expect(result.zScore).toBeCloseTo(0, 1)
    })
  })
})
