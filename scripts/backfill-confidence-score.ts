/**
 * Backfill confidenceScore on existing DailyEntry records.
 * Parses the embedded "Confidence: XX%" from descriptionAuto.
 *
 * Run from web/ directory:
 *   cd web && npx tsx --tsconfig tsconfig.json ../scripts/backfill-confidence-score.ts
 */
import 'dotenv/config'
import { prisma } from '@/lib/prisma'

async function main() {
  const entries = await prisma.dailyEntry.findMany({
    where: { confidenceScore: null, descriptionAuto: { not: null } },
    select: { id: true, descriptionAuto: true },
  })

  console.log(`Found ${entries.length} entries to backfill`)

  let updated = 0
  let skipped = 0

  for (const entry of entries) {
    const desc = entry.descriptionAuto ?? ''
    const match = desc.match(/Confidence:\s*(\d+)%/)

    if (!match) {
      skipped++
      continue
    }

    const score = parseInt(match[1]) / 100

    await prisma.dailyEntry.update({
      where: { id: entry.id },
      data: { confidenceScore: score },
    })
    updated++
  }

  console.log(`Backfilled: ${updated}, Skipped (no confidence text): ${skipped}`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
