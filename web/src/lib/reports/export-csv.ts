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
    'Phase',
    'Type',
    'Capitalizable',
    'Status',
    'Description',
  ]

  const rows: string[][] = []

  for (const e of dailyEntries) {
    rows.push([
      format(new Date(e.date), 'yyyy-MM-dd'),
      e.developerName,
      e.projectName ?? '',
      String(e.hoursConfirmed ?? e.hoursEstimated ?? 0),
      e.phaseConfirmed ?? e.projectPhase ?? '',
      'AI-Generated',
      e.capitalizable ? 'Yes' : 'No',
      e.status,
      csvEscape(e.descriptionConfirmed ?? ''),
    ])
  }

  for (const e of manualEntries) {
    rows.push([
      format(new Date(e.date), 'yyyy-MM-dd'),
      e.developerName,
      e.projectName,
      String(e.hours),
      e.phase,
      'Manual',
      e.capitalizable ? 'Yes' : 'No',
      'confirmed',
      csvEscape(e.description),
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
