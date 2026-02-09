import { PrismaClient } from '/home/sschatz/projects/software-capitalization/web/src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config({ path: '/home/sschatz/projects/software-capitalization/web/.env' })

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
  const entries = await prisma.dailyEntry.findMany({
    select: {
      id: true, date: true, hoursEstimated: true, hoursRaw: true,
      sourceSessionIds: true, sourceCommitIds: true, status: true,
      project: { select: { name: true } },
    },
    orderBy: [{ date: 'asc' }],
  })

  const allSessions = await prisma.rawSession.findMany({
    select: { id: true, dailyBreakdown: true },
  })
  const sessionMap = new Map(allSessions.map(s => [s.id, s]))

  // Group entries by date
  const byDate = new Map<string, typeof entries>()
  for (const e of entries) {
    const d = e.date.toISOString().slice(0, 10)
    const existing = byDate.get(d) || []
    existing.push(e)
    byDate.set(d, existing)
  }

  console.log('DATE        | ENTRIES | EST HOURS | ACTIVE MIN | ACTIVE HRS | NO-SESSION | DELTA')
  console.log('------------|---------|-----------|------------|------------|------------|------')

  for (const [dateStr, dayEntries] of [...byDate.entries()].sort()) {
    const estHours = dayEntries.reduce((s, e) => s + (e.hoursEstimated ?? 0), 0)
    let totalActiveMin = 0
    let noSessionCount = 0

    for (const e of dayEntries) {
      if (e.sourceSessionIds.length === 0) {
        noSessionCount++
        continue
      }
      for (const sid of e.sourceSessionIds) {
        const session = sessionMap.get(sid)
        if (session === undefined) continue
        const breakdown = Array.isArray(session.dailyBreakdown) ? session.dailyBreakdown as Array<Record<string, unknown>> : []
        const daySlice = breakdown.find((d) => d.date === dateStr)
        totalActiveMin += (daySlice?.activeMinutes as number) ?? 0
      }
    }

    const activeHrs = totalActiveMin / 60
    const delta = estHours - activeHrs
    const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(dateStr + 'T12:00:00Z').getUTCDay()]

    console.log(
      `${dateStr} ${dayOfWeek} | ${String(dayEntries.length).padStart(7)} | ${estHours.toFixed(1).padStart(9)} | ` +
      `${String(totalActiveMin).padStart(10)} | ${activeHrs.toFixed(1).padStart(10)} | ` +
      `${String(noSessionCount).padStart(10)} | ${(delta >= 0 ? '+' : '') + delta.toFixed(1).padStart(5)}`
    )
  }

  // Find dates with raw session activity but NO entries
  console.log(`\n=== DATES WITH SESSION ACTIVITY BUT NO ENTRIES ===`)
  const allDatesWithActivity = new Set<string>()
  for (const s of allSessions) {
    const breakdown = Array.isArray(s.dailyBreakdown) ? s.dailyBreakdown as Array<Record<string, unknown>> : []
    for (const d of breakdown) {
      if (((d.activeMinutes as number) ?? 0) > 0) {
        allDatesWithActivity.add(d.date as string)
      }
    }
  }

  const datesWithEntries = new Set(byDate.keys())
  const missingDates = [...allDatesWithActivity].filter(d => !datesWithEntries.has(d)).sort()

  if (missingDates.length === 0) {
    console.log('None - all dates with activity have entries')
  } else {
    for (const d of missingDates) {
      let activeMin = 0
      for (const s of allSessions) {
        const breakdown = Array.isArray(s.dailyBreakdown) ? s.dailyBreakdown as Array<Record<string, unknown>> : []
        const slice = breakdown.find((bd) => bd.date === d)
        activeMin += ((slice?.activeMinutes as number) ?? 0)
      }
      const dayOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(d + 'T12:00:00Z').getUTCDay()]
      console.log(`  ${d} (${dayOfWeek}): ${activeMin} active min (${(activeMin / 60).toFixed(1)}h)`)
    }
  }

  // Check for duplicate session links (same session counted in entries on wrong dates)
  console.log(`\n=== SESSION DATE ALIGNMENT CHECK ===`)
  let misaligned = 0
  for (const [dateStr, dayEntries] of [...byDate.entries()].sort()) {
    for (const e of dayEntries) {
      for (const sid of e.sourceSessionIds) {
        const session = sessionMap.get(sid)
        if (session === undefined) continue
        const breakdown = Array.isArray(session.dailyBreakdown) ? session.dailyBreakdown as Array<Record<string, unknown>> : []
        const daySlice = breakdown.find((d) => d.date === dateStr)
        if (daySlice === undefined && breakdown.length > 0) {
          misaligned++
          console.log(`  MISALIGNED: Entry ${e.id.slice(0,8)} on ${dateStr} links session with no breakdown for that date`)
          console.log(`    Session breakdown dates: ${breakdown.map(d => d.date).join(', ')}`)
        }
      }
    }
  }
  if (misaligned === 0) console.log('All session links align with their dailyBreakdown dates')

  await prisma.$disconnect()
  await pool.end()
}

main().catch(console.error)
