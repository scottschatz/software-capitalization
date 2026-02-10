import type { DailyEntryRow, ManualEntryRow } from './query-builder'
import { format } from 'date-fns'

/**
 * Build a CSV string from daily + manual entries.
 */
export function buildCsv(
  dailyEntries: DailyEntryRow[],
  manualEntries: ManualEntryRow[]
): string {
  const headers = [
    'Date',
    'Developer',
    'Project',
    'Hours',
    'Phase (Developer)',
    'Phase (Effective)',
    'Override',
    'Work Type',
    'Type',
    'Capitalizable',
    'Status',
    'Hours (Raw)',
    'Adj. Factor',
    'Hours (Est.)',
    'Adjustment Reason',
    'AI Model',
    'Confirmed By',
    'Confirmed At',
    'Confirm Method',
    'Description',
  ]

  const rows: string[][] = []

  for (const e of dailyEntries) {
    const devPhase = e.phaseConfirmed ?? e.projectPhase ?? ''
    const effPhase = e.phaseEffective ?? devPhase
    rows.push([
      format(new Date(e.date), 'yyyy-MM-dd'),
      e.developerName,
      e.projectName ?? '',
      String(e.hoursConfirmed ?? e.hoursEstimated ?? 0),
      devPhase,
      effPhase,
      e.phaseEffective && e.phaseEffective !== devPhase ? 'Yes' : '',
      e.workType ?? '',
      'AI-Generated',
      e.capitalizable ? 'Yes' : 'No',
      e.status,
      e.hoursRaw != null ? String(e.hoursRaw) : '',
      e.adjustmentFactor != null ? String(e.adjustmentFactor) : '',
      e.hoursEstimated != null ? String(e.hoursEstimated) : '',
      csvEscape(e.adjustmentReason ?? ''),
      csvEscape(e.modelUsed ?? ''),
      csvEscape(e.confirmedBy ?? ''),
      e.confirmedAt ? format(new Date(e.confirmedAt), "yyyy-MM-dd'T'HH:mm:ss'Z'") : '',
      csvEscape(e.confirmationMethod ?? ''),
      csvEscape(e.descriptionConfirmed ?? ''),
    ])
  }

  for (const e of manualEntries) {
    let desc = e.description
    if (e.hours > 4) desc = `[HIGH HOURS] ${desc}`
    if (e.status === 'pending_approval') desc = `[PENDING APPROVAL] ${desc}`
    rows.push([
      format(new Date(e.date), 'yyyy-MM-dd'),
      e.developerName,
      e.projectName,
      String(e.hours),
      e.phase,
      e.phaseEffective ?? e.phase,
      e.phaseEffective && e.phaseEffective !== e.phase ? 'Yes' : '',
      '', // Work Type (N/A for manual entries)
      'Manual',
      e.capitalizable ? 'Yes' : 'No',
      e.status,
      '', // Hours (Raw)
      '', // Adj. Factor
      '', // Hours (Est.)
      '', // Adjustment Reason
      '', // AI Model
      '', // Confirmed By
      '', // Confirmed At
      '', // Confirm Method
      csvEscape(desc),
    ])
  }

  // Sort by date, then developer
  rows.sort((a, b) => a[0].localeCompare(b[0]) || a[1].localeCompare(b[1]))

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}
