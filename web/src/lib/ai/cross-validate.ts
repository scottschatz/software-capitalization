export interface CrossValidationInput {
  hoursEstimate: number
  projectId: string | null
  projectName: string
  historicalEntries: Array<{
    date: Date
    hoursConfirmed: number | null
    projectId: string | null
  }>
}

export interface CrossValidationResult {
  isOutlier: boolean
  flag: string | null
  zScore: number
  avgHoursPerDay: number
  stdDev: number
}

const MIN_DATA_POINTS = 5
const Z_SCORE_THRESHOLD = 2.0
const PROJECT_MULTIPLIER_THRESHOLD = 3.0

/**
 * Cross-validate a daily entry against 30 days of historical data.
 * Checks for statistical outliers using z-scores.
 * Pure computation — no I/O, no exceptions.
 */
export function crossValidateEntry(input: CrossValidationInput): CrossValidationResult {
  const { hoursEstimate, projectId, projectName, historicalEntries } = input

  const defaultResult: CrossValidationResult = {
    isOutlier: false,
    flag: null,
    zScore: 0,
    avgHoursPerDay: 0,
    stdDev: 0,
  }

  // --- Step 1: Compute per-day total hours from historical entries ---
  // Group entries by date, summing all project hours for each day
  const hoursByDay = new Map<string, number>()
  for (const entry of historicalEntries) {
    if (entry.hoursConfirmed == null) continue
    const dateKey = entry.date.toISOString().slice(0, 10)
    hoursByDay.set(dateKey, (hoursByDay.get(dateKey) ?? 0) + entry.hoursConfirmed)
  }

  const dailyTotals = Array.from(hoursByDay.values())

  // Edge case: not enough data points
  if (dailyTotals.length < MIN_DATA_POINTS) {
    return defaultResult
  }

  // --- Step 2: Compute mean and standard deviation ---
  const mean = dailyTotals.reduce((s, v) => s + v, 0) / dailyTotals.length
  const variance = dailyTotals.reduce((s, v) => s + (v - mean) ** 2, 0) / dailyTotals.length
  const stdDev = Math.sqrt(variance)

  // --- Step 3: Compute z-score ---
  // If stdDev is 0, z-score is meaningless — skip it but still run per-project check
  const zScore = stdDev > 0 ? (hoursEstimate - mean) / stdDev : 0

  const flags: string[] = []

  if (stdDev > 0 && Math.abs(zScore) > Z_SCORE_THRESHOLD) {
    const direction = zScore > 0 ? 'above' : 'below'
    flags.push(
      `Hours estimate (${hoursEstimate.toFixed(1)}h) is ${Math.abs(zScore).toFixed(1)} standard deviations ${direction} the 30-day average (${mean.toFixed(1)}h/day, stddev ${stdDev.toFixed(1)}h)`
    )
  }

  // --- Step 4: Per-project deviation check ---
  if (projectId) {
    const projectEntries = historicalEntries.filter(
      (e) => e.projectId === projectId && e.hoursConfirmed != null
    )

    if (projectEntries.length >= MIN_DATA_POINTS) {
      // Compute per-day averages for this project
      const projectHoursByDay = new Map<string, number>()
      for (const entry of projectEntries) {
        const dateKey = entry.date.toISOString().slice(0, 10)
        projectHoursByDay.set(
          dateKey,
          (projectHoursByDay.get(dateKey) ?? 0) + (entry.hoursConfirmed ?? 0)
        )
      }

      const projectDailyTotals = Array.from(projectHoursByDay.values())
      const projectAvg =
        projectDailyTotals.reduce((s, v) => s + v, 0) / projectDailyTotals.length

      if (projectAvg > 0 && hoursEstimate > projectAvg * PROJECT_MULTIPLIER_THRESHOLD) {
        flags.push(
          `Hours for "${projectName}" (${hoursEstimate.toFixed(1)}h) is >${PROJECT_MULTIPLIER_THRESHOLD}x the project average (${projectAvg.toFixed(1)}h/day)`
        )
      }
    }
  }

  return {
    isOutlier: flags.length > 0,
    flag: flags.length > 0 ? flags.join('; ') : null,
    zScore,
    avgHoursPerDay: mean,
    stdDev,
  }
}
