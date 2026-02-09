#!/usr/bin/env npx tsx
/**
 * Backfill workType for existing DailyEntry records using the heuristic classifier.
 * Only processes entries where workType is null.
 *
 * Usage:
 *   npx tsx scripts/backfill-work-type.ts [--dry-run]
 */

import { PrismaClient } from '../web/src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import dotenv from 'dotenv'
import { classifyHeuristic, type ClassificationInput } from '../web/src/lib/ai/classify-work-type'

dotenv.config({ path: new URL('../web/.env', import.meta.url).pathname })

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL! })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })
const isDryRun = process.argv.includes('--dry-run')

async function main() {
  console.log(`Backfill workType for DailyEntry records${isDryRun ? ' (DRY RUN)' : ''}`)
  console.log()

  // Find all entries missing workType
  const entries = await prisma.dailyEntry.findMany({
    where: { workType: null },
    select: {
      id: true,
      sourceSessionIds: true,
      sourceCommitIds: true,
      descriptionAuto: true,
    },
  })

  console.log(`Found ${entries.length} entries with null workType`)

  if (entries.length === 0) {
    console.log('Nothing to backfill.')
    return
  }

  // Collect all session IDs and commit IDs we need
  const allSessionIds = new Set<string>()
  const allCommitIds = new Set<string>()
  for (const entry of entries) {
    for (const sid of entry.sourceSessionIds) allSessionIds.add(sid)
    for (const cid of entry.sourceCommitIds) allCommitIds.add(cid)
  }

  // Batch-load sessions and commits (sourceSessionIds/sourceCommitIds store DB primary keys)
  const sessions = await prisma.rawSession.findMany({
    where: { id: { in: Array.from(allSessionIds) } },
    select: {
      id: true,
      toolBreakdown: true,
      filesReferenced: true,
      firstUserPrompt: true,
    },
  })
  const sessionMap = new Map(sessions.map(s => [s.id, s]))

  const commits = await prisma.rawCommit.findMany({
    where: { id: { in: Array.from(allCommitIds) } },
    select: { id: true, message: true },
  })
  const commitMap = new Map(commits.map(c => [c.id, c]))

  console.log(`Loaded ${sessions.length} sessions, ${commits.length} commits`)
  console.log()

  let updated = 0
  const typeCounts: Record<string, number> = {}

  for (const entry of entries) {
    // Build classification input from session data
    const toolBreakdowns: Record<string, number> = {}
    const filesReferenced: string[] = []
    const userPromptSamples: string[] = []

    for (const sid of entry.sourceSessionIds) {
      const session = sessionMap.get(sid)
      if (!session) continue

      // Merge tool breakdowns
      if (session.toolBreakdown && typeof session.toolBreakdown === 'object') {
        for (const [tool, count] of Object.entries(session.toolBreakdown as Record<string, number>)) {
          toolBreakdowns[tool] = (toolBreakdowns[tool] ?? 0) + count
        }
      }
      filesReferenced.push(...(session.filesReferenced ?? []))
      if (session.firstUserPrompt) userPromptSamples.push(session.firstUserPrompt)
    }

    const commitMessages = entry.sourceCommitIds
      .map(cid => commitMap.get(cid)?.message ?? '')
      .filter(Boolean)

    const input: ClassificationInput = {
      toolBreakdown: Object.keys(toolBreakdowns).length > 0 ? toolBreakdowns : null,
      filesReferenced,
      userPromptSamples,
      commitMessages,
      summary: entry.descriptionAuto?.split('\n---\n')[0] ?? '',
    }

    // Use heuristic only (no LLM calls for backfill — fast and free)
    const result = classifyHeuristic(input)

    typeCounts[result.workType] = (typeCounts[result.workType] ?? 0) + 1

    if (!isDryRun) {
      await prisma.dailyEntry.update({
        where: { id: entry.id },
        data: { workType: result.workType },
      })
    }
    updated++
  }

  console.log(`${isDryRun ? 'Would update' : 'Updated'} ${updated} entries`)
  console.log()
  console.log('Work type distribution:')
  for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    const pct = ((count / updated) * 100).toFixed(1)
    console.log(`  ${type.padEnd(20)} ${String(count).padStart(4)} (${pct}%)`)
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
