import 'dotenv/config'
import { generateEntriesForDate } from '@/lib/jobs/generate-daily-entries'
import { parseISO } from 'date-fns'

async function main() {
  console.log('Attempting Jan 22 generation...')
  try {
    const result = await generateEntriesForDate(parseISO('2026-01-22'))
    console.log('Result:', JSON.stringify(result, null, 2))
  } catch (err) {
    console.error('Error:', err instanceof Error ? err.message : err)
  }
  process.exit(0)
}
main()
