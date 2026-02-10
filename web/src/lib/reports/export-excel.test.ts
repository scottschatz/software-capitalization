import { describe, it, expect } from 'vitest'
import { buildExcelReport } from './export-excel'
import ExcelJS from 'exceljs'
import type { DailyEntryRow, ManualEntryRow } from './query-builder'

function makeDailyEntry(overrides: Partial<DailyEntryRow> = {}): DailyEntryRow {
  return {
    id: 'de-1',
    date: new Date('2026-01-15'),
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
    confirmedAt: new Date('2026-01-16'),
    requiresManagerApproval: false,
    ...overrides,
  }
}

function makeManualEntry(overrides: Partial<ManualEntryRow> = {}): ManualEntryRow {
  return {
    id: 'me-1',
    date: new Date('2026-01-15'),
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

const projectSummary = [
  { projectName: 'Project A', totalHours: 3.5, capHours: 3.5, expHours: 0, entries: 1 },
  { projectName: 'Project B', totalHours: 2, capHours: 0, expHours: 2, entries: 1 },
]

async function parseWorkbook(buffer: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  return workbook
}

describe('buildExcelReport', () => {
  it('should return an ArrayBuffer', async () => {
    const result = await buildExcelReport({
      title: 'Test Report',
      period: '2026-01',
      dailyEntries: [],
      manualEntries: [],
      projectSummary: [],
    })
    expect(result).toBeInstanceOf(ArrayBuffer)
  })

  it('should create a valid Excel workbook with 3 sheets', async () => {
    const buffer = await buildExcelReport({
      title: 'Test Report',
      period: '2026-01',
      dailyEntries: [makeDailyEntry()],
      manualEntries: [makeManualEntry()],
      projectSummary,
    })
    const wb = await parseWorkbook(buffer)
    expect(wb.worksheets).toHaveLength(3)
    expect(wb.worksheets[0].name).toBe('Summary')
    expect(wb.worksheets[1].name).toBe('Detail')
    expect(wb.worksheets[2].name).toBe('Capitalization')
  })

  it('should populate Summary sheet with project data and totals', async () => {
    const buffer = await buildExcelReport({
      title: 'Test Report',
      period: '2026-01',
      dailyEntries: [],
      manualEntries: [],
      projectSummary,
    })
    const wb = await parseWorkbook(buffer)
    const sheet = wb.getWorksheet('Summary')!
    // Header + 2 projects + 1 totals row = 4 rows
    expect(sheet.rowCount).toBe(4)

    // Check first project row
    const row2 = sheet.getRow(2)
    expect(row2.getCell(1).value).toBe('Project A')
    expect(row2.getCell(2).value).toBe(3.5)

    // Check totals row
    const totals = sheet.getRow(4)
    expect(totals.getCell(1).value).toBe('TOTAL')
    expect(totals.getCell(2).value).toBe(5.5)
  })

  it('should populate Detail sheet with sorted entries', async () => {
    const buffer = await buildExcelReport({
      title: 'Test Report',
      period: '2026-01',
      dailyEntries: [makeDailyEntry()],
      manualEntries: [makeManualEntry()],
      projectSummary,
    })
    const wb = await parseWorkbook(buffer)
    const sheet = wb.getWorksheet('Detail')!
    // Legend row + Header + 2 entries = 4 rows
    expect(sheet.rowCount).toBe(4)

    // Both entries are same date, so sorted by developer name (Alice < Bob)
    // Row 1 = legend, Row 2 = headers, data starts at row 3
    const row3 = sheet.getRow(3)
    expect(row3.getCell(2).value).toBe('Alice')
    expect(row3.getCell(9).value).toBe('AI-Generated')

    const row4 = sheet.getRow(4)
    expect(row4.getCell(2).value).toBe('Bob')
    expect(row4.getCell(9).value).toBe('Manual')
  })

  it('should populate Capitalization sheet with percentages', async () => {
    const buffer = await buildExcelReport({
      title: 'Test Report',
      period: '2026-01',
      dailyEntries: [],
      manualEntries: [],
      projectSummary,
    })
    const wb = await parseWorkbook(buffer)
    const sheet = wb.getWorksheet('Capitalization')!
    // Header + 2 projects = 3 rows
    expect(sheet.rowCount).toBe(3)

    // Project A: 3.5 cap / 3.5 total = 100%
    const row2 = sheet.getRow(2)
    expect(row2.getCell(1).value).toBe('Project A')
    expect(row2.getCell(6).value).toBe(1) // 100% as decimal

    // Project B: 0 cap / 2 total = 0%
    const row3 = sheet.getRow(3)
    expect(row3.getCell(6).value).toBe(0)
  })

  it('should handle empty data gracefully', async () => {
    const buffer = await buildExcelReport({
      title: 'Empty Report',
      period: '2026-01',
      dailyEntries: [],
      manualEntries: [],
      projectSummary: [],
    })
    const wb = await parseWorkbook(buffer)
    const summary = wb.getWorksheet('Summary')!
    // Header + totals row (no projects)
    expect(summary.rowCount).toBe(2)
    const totals = summary.getRow(2)
    expect(totals.getCell(1).value).toBe('TOTAL')
    expect(totals.getCell(2).value).toBe(0)
  })

  it('should display phase labels in Detail sheet', async () => {
    const buffer = await buildExcelReport({
      title: 'Test Report',
      period: '2026-01',
      dailyEntries: [makeDailyEntry({ phaseConfirmed: 'application_development' })],
      manualEntries: [makeManualEntry({ phase: 'post_implementation' })],
      projectSummary,
    })
    const wb = await parseWorkbook(buffer)
    const sheet = wb.getWorksheet('Detail')!
    // Row 1 = legend, Row 2 = headers, data starts at row 3
    expect(sheet.getRow(3).getCell(5).value).toBe('Application Development')
    expect(sheet.getRow(4).getCell(5).value).toBe('Post-Implementation')
  })
})
