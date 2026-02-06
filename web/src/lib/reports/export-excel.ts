import ExcelJS from 'exceljs'
import type { DailyEntryRow, ManualEntryRow } from './query-builder'
import { format } from 'date-fns'

interface ExcelReportData {
  title: string
  period: string
  dailyEntries: DailyEntryRow[]
  manualEntries: ManualEntryRow[]
  projectSummary: Array<{
    projectName: string
    totalHours: number
    capHours: number
    expHours: number
    entries: number
  }>
}

const PHASE_LABELS: Record<string, string> = {
  preliminary: 'Preliminary',
  application_development: 'Application Development',
  post_implementation: 'Post-Implementation',
}

/**
 * Build an Excel workbook with 3 sheets: Summary, Detail, Capitalization.
 */
export async function buildExcelReport(data: ExcelReportData): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Cap Tracker'
  workbook.created = new Date()

  // --- Sheet 1: Summary ---
  const summary = workbook.addWorksheet('Summary')
  summary.columns = [
    { header: 'Project', key: 'project', width: 30 },
    { header: 'Total Hours', key: 'total', width: 14 },
    { header: 'Capitalizable', key: 'cap', width: 14 },
    { header: 'Expensed', key: 'exp', width: 14 },
    { header: 'Entries', key: 'entries', width: 10 },
  ]

  // Style header
  const headerStyle: Partial<ExcelJS.Style> = {
    font: { bold: true, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } },
    alignment: { horizontal: 'center' },
  }
  summary.getRow(1).eachCell((cell) => {
    cell.style = headerStyle
  })

  let grandTotal = 0
  let grandCap = 0
  let grandExp = 0

  for (const proj of data.projectSummary) {
    summary.addRow({
      project: proj.projectName,
      total: proj.totalHours,
      cap: proj.capHours,
      exp: proj.expHours,
      entries: proj.entries,
    })
    grandTotal += proj.totalHours
    grandCap += proj.capHours
    grandExp += proj.expHours
  }

  // Totals row
  const totalsRow = summary.addRow({
    project: 'TOTAL',
    total: grandTotal,
    cap: grandCap,
    exp: grandExp,
    entries: data.projectSummary.reduce((s, p) => s + p.entries, 0),
  })
  totalsRow.font = { bold: true }

  // Format number cells
  summary.getColumn('total').numFmt = '0.00'
  summary.getColumn('cap').numFmt = '0.00'
  summary.getColumn('exp').numFmt = '0.00'

  // --- Sheet 2: Detail ---
  const detail = workbook.addWorksheet('Detail')
  detail.columns = [
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Developer', key: 'developer', width: 20 },
    { header: 'Project', key: 'project', width: 25 },
    { header: 'Hours', key: 'hours', width: 10 },
    { header: 'Phase', key: 'phase', width: 24 },
    { header: 'Type', key: 'type', width: 14 },
    { header: 'Capitalizable', key: 'cap', width: 14 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Description', key: 'description', width: 50 },
  ]

  detail.getRow(1).eachCell((cell) => {
    cell.style = headerStyle
  })

  // All entries sorted by date
  const allRows: Array<{
    date: string
    developer: string
    project: string
    hours: number
    phase: string
    type: string
    cap: string
    status: string
    description: string
  }> = []

  for (const e of data.dailyEntries) {
    const phase = e.phaseConfirmed ?? e.projectPhase ?? ''
    allRows.push({
      date: format(new Date(e.date), 'yyyy-MM-dd'),
      developer: e.developerName,
      project: e.projectName ?? '',
      hours: e.hoursConfirmed ?? e.hoursEstimated ?? 0,
      phase: PHASE_LABELS[phase] ?? phase,
      type: 'AI-Generated',
      cap: e.capitalizable ? 'Yes' : 'No',
      status: e.status,
      description: (e.descriptionConfirmed ?? '').split('\n---\n')[0],
    })
  }

  for (const e of data.manualEntries) {
    allRows.push({
      date: format(new Date(e.date), 'yyyy-MM-dd'),
      developer: e.developerName,
      project: e.projectName,
      hours: e.hours,
      phase: PHASE_LABELS[e.phase] ?? e.phase,
      type: 'Manual',
      cap: e.capitalizable ? 'Yes' : 'No',
      status: 'confirmed',
      description: e.description,
    })
  }

  allRows.sort((a, b) => a.date.localeCompare(b.date) || a.developer.localeCompare(b.developer))

  for (const row of allRows) {
    const excelRow = detail.addRow(row)
    // Color capitalizable column
    const capCell = excelRow.getCell('cap')
    if (capCell.value === 'Yes') {
      capCell.font = { color: { argb: 'FF16A34A' }, bold: true }
    } else {
      capCell.font = { color: { argb: 'FF6B7280' } }
    }
  }

  detail.getColumn('hours').numFmt = '0.00'

  // --- Sheet 3: Capitalization ---
  const capSheet = workbook.addWorksheet('Capitalization')
  capSheet.columns = [
    { header: 'Project', key: 'project', width: 30 },
    { header: 'Period', key: 'period', width: 20 },
    { header: 'Capitalizable Hours', key: 'capHours', width: 20 },
    { header: 'Expensed Hours', key: 'expHours', width: 18 },
    { header: 'Total Hours', key: 'totalHours', width: 14 },
    { header: 'Cap %', key: 'capPct', width: 10 },
  ]

  capSheet.getRow(1).eachCell((cell) => {
    cell.style = headerStyle
  })

  for (const proj of data.projectSummary) {
    capSheet.addRow({
      project: proj.projectName,
      period: data.period,
      capHours: proj.capHours,
      expHours: proj.expHours,
      totalHours: proj.totalHours,
      capPct: proj.totalHours > 0 ? proj.capHours / proj.totalHours : 0,
    })
  }

  capSheet.getColumn('capHours').numFmt = '0.00'
  capSheet.getColumn('expHours').numFmt = '0.00'
  capSheet.getColumn('totalHours').numFmt = '0.00'
  capSheet.getColumn('capPct').numFmt = '0.0%'

  const buffer = await workbook.xlsx.writeBuffer()
  return buffer instanceof ArrayBuffer ? buffer : (buffer as Uint8Array).buffer as ArrayBuffer
}
