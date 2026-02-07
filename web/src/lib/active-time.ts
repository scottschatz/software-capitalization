/**
 * Calculate active coding time from tool event timestamps.
 *
 * Active time = sum of intervals between consecutive events where the gap
 * is less than the idle threshold. Longer gaps are treated as breaks/idle.
 *
 * Falls back to session duration when no tool events exist.
 */

const IDLE_THRESHOLD_MS = 5 * 60 * 1000 // 5 minutes

interface TimestampedEvent {
  timestamp: Date
}

export interface ActiveTimeResult {
  activeMinutes: number
  totalMinutes: number
  idleMinutes: number
  eventCount: number
  source: 'tool_events' | 'session_duration' | 'estimate'
}

/**
 * Calculate active coding time from a list of timestamped events.
 */
export function calculateActiveTime(events: TimestampedEvent[]): ActiveTimeResult {
  if (events.length === 0) {
    return { activeMinutes: 0, totalMinutes: 0, idleMinutes: 0, eventCount: 0, source: 'tool_events' }
  }

  if (events.length === 1) {
    // Single event — assume a minimum of 1 minute of activity
    return { activeMinutes: 1, totalMinutes: 1, idleMinutes: 0, eventCount: 1, source: 'tool_events' }
  }

  // Sort by timestamp
  const sorted = [...events].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

  let activeMs = 0
  const firstTs = sorted[0].timestamp.getTime()
  const lastTs = sorted[sorted.length - 1].timestamp.getTime()
  const totalMs = lastTs - firstTs

  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].timestamp.getTime() - sorted[i - 1].timestamp.getTime()
    if (gap < IDLE_THRESHOLD_MS) {
      activeMs += gap
    }
  }

  const activeMinutes = Math.round(activeMs / 60000)
  const totalMinutes = Math.round(totalMs / 60000)
  const idleMinutes = totalMinutes - activeMinutes

  return {
    activeMinutes,
    totalMinutes,
    idleMinutes,
    eventCount: events.length,
    source: 'tool_events',
  }
}

/**
 * Calculate active time from a session's duration (fallback when no tool events).
 * Applies a heuristic: ~60% of session time is typically active coding.
 */
export function estimateActiveTimeFromDuration(durationSeconds: number | null): ActiveTimeResult {
  if (!durationSeconds || durationSeconds <= 0) {
    return { activeMinutes: 0, totalMinutes: 0, idleMinutes: 0, eventCount: 0, source: 'estimate' }
  }

  const totalMinutes = Math.round(durationSeconds / 60)
  // Heuristic: 60% of session time is active coding
  const activeMinutes = Math.round(totalMinutes * 0.6)

  return {
    activeMinutes,
    totalMinutes,
    idleMinutes: totalMinutes - activeMinutes,
    eventCount: 0,
    source: 'session_duration',
  }
}

/**
 * Convert active minutes to hours, rounded to nearest 0.25.
 */
export function activeMinutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 4) / 4
}
