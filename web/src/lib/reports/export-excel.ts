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
    { header: 'Phase (Developer)', key: 'phaseDev', width: 24 },
    { header: 'Phase (Effective)', key: 'phaseEff', width: 24 },
    { header: 'Override', key: 'override', width: 10 },
    { header: 'Work Type', key: 'workType', width: 16 },
    { header: 'Type', key: 'type', width: 14 },
    { header: 'Capitalizable', key: 'cap', width: 14 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Hours (Raw)', key: 'hoursRaw', width: 12 },
    { header: 'Adj. Factor', key: 'adjFactor', width: 12 },
    { header: 'Hours (Est.)', key: 'hoursEst', width: 12 },
    { header: 'Adjustment Reason', key: 'adjReason', width: 22 },
    { header: 'AI Model', key: 'aiModel', width: 18 },
    { header: 'Confirmed By', key: 'confirmedBy', width: 18 },
    { header: 'Confirmed At', key: 'confirmedAt', width: 20 },
    { header: 'Confirm Method', key: 'confirmMethod', width: 16 },
    { header: 'Description', key: 'description', width: 50 },
  ]

  // Insert legend row above headers (pushes headers to row 2)
  detail.spliceRows(1, 0, ['Note: Rows highlighted in light blue indicate entries modified after initial confirmation (revision count > 0).'])
  detail.mergeCells('A1:T1')
  const legendCell = detail.getCell('A1')
  legendCell.font = { italic: true, color: { argb: 'FF6B7280' } }

  // Style header row (now row 2 after legend insertion)
  detail.getRow(2).eachCell((cell) => {
    cell.style = headerStyle
  })

  const revisionHighlight: Partial<ExcelJS.Fill> = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE3F2FD' },
  }

  // All entries sorted by date, with source entry for audit fields
  interface DetailRowData {
    date: string
    developer: string
    project: string
    hours: number
    phaseDev: string
    phaseEff: string
    override: string
    workType: string
    type: string
    cap: string
    status: string
    hoursRaw: number | null
    adjFactor: number | null
    hoursEst: number | null
    adjReason: string
    aiModel: string
    confirmedBy: string
    confirmedAt: string
    confirmMethod: string
    description: string
    _revisionCount: number
  }

  const allRows: DetailRowData[] = []

  for (const e of data.dailyEntries) {
    const devPhase = e.phaseConfirmed ?? e.projectPhase ?? ''
    const effPhase = e.phaseEffective ?? devPhase
    allRows.push({
      date: format(new Date(e.date), 'yyyy-MM-dd'),
      developer: e.developerName,
      project: e.projectName ?? '',
      hours: e.hoursConfirmed ?? e.hoursEstimated ?? 0,
      phaseDev: PHASE_LABELS[devPhase] ?? devPhase,
      phaseEff: PHASE_LABELS[effPhase] ?? effPhase,
      override: e.phaseEffective && e.phaseEffective !== devPhase ? 'Yes' : '',
      workType: e.workType ?? '',
      type: 'AI-Generated',
      cap: e.capitalizable ? 'Yes' : 'No',
      status: e.status,
      hoursRaw: e.hoursRaw ?? null,
      adjFactor: e.adjustmentFactor ?? null,
      hoursEst: e.hoursEstimated ?? null,
      adjReason: e.adjustmentReason ?? '',
      aiModel: e.modelUsed ?? '',
      confirmedBy: e.confirmedBy ?? '',
      confirmedAt: e.confirmedAt ? format(new Date(e.confirmedAt), "yyyy-MM-dd'T'HH:mm:ss'Z'") : '',
      confirmMethod: e.confirmationMethod ?? '',
      description: (e.descriptionConfirmed ?? '').split('\n---\n')[0],
      _revisionCount: e.revisionCount,
    })
  }

  for (const e of data.manualEntries) {
    let desc = e.description
    if (e.hours > 4) desc = `[HIGH HOURS] ${desc}`
    if (e.status === 'pending_approval') desc = `[PENDING APPROVAL] ${desc}`
    allRows.push({
      date: format(new Date(e.date), 'yyyy-MM-dd'),
      developer: e.developerName,
      project: e.projectName,
      hours: e.hours,
      phaseDev: PHASE_LABELS[e.phase] ?? e.phase,
      phaseEff: PHASE_LABELS[e.phaseEffective ?? e.phase] ?? (e.phaseEffective ?? e.phase),
      override: e.phaseEffective && e.phaseEffective !== e.phase ? 'Yes' : '',
      workType: '',
      type: 'Manual',
      cap: e.capitalizable ? 'Yes' : 'No',
      status: e.status,
      hoursRaw: null,
      adjFactor: null,
      hoursEst: null,
      adjReason: '',
      aiModel: '',
      confirmedBy: '',
      confirmedAt: '',
      confirmMethod: '',
      description: desc,
      _revisionCount: 0,
    })
  }

  allRows.sort((a, b) => a.date.localeCompare(b.date) || a.developer.localeCompare(b.developer))

  for (const row of allRows) {
    const { _revisionCount, ...rowData } = row
    const excelRow = detail.addRow(rowData)

    // Color capitalizable column
    const capCell = excelRow.getCell('cap')
    if (capCell.value === 'Yes') {
      capCell.font = { color: { argb: 'FF16A34A' }, bold: true }
    } else {
      capCell.font = { color: { argb: 'FF6B7280' } }
    }

    // Highlight revised entries in light blue
    if (_revisionCount > 0) {
      excelRow.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = revisionHighlight as ExcelJS.Fill
      })
    }
  }

  detail.getColumn('hours').numFmt = '0.00'
  detail.getColumn('hoursRaw').numFmt = '0.00'
  detail.getColumn('adjFactor').numFmt = '0.000'
  detail.getColumn('hoursEst').numFmt = '0.00'

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
