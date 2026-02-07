import { loadConfig } from '../config.js'
import { format, subDays } from 'date-fns'

interface GenerateOptions {
  date?: string
  from?: string
  to?: string
}

export async function generateCommand(options: GenerateOptions): Promise<void> {
  const config = loadConfig()

  // Determine date range
  let from: string
  let to: string

  if (options.from && options.to) {
    from = options.from
    to = options.to
  } else if (options.date) {
    from = options.date
    to = options.date
  } else {
    // Default: yesterday
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')
    from = yesterday
    to = yesterday
  }

  console.log(`\n  Cap Agent Generate`)
  console.log(`  Generating AI entries for ${from}${from !== to ? ` to ${to}` : ''}`)
  console.log()

  try {
    const res = await fetch(`${config.serverUrl}/api/agent/entries/generate-batch`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error(`  Error: ${res.status} ${res.statusText} — ${body}`)
      process.exitCode = 1
      return
    }

    const result = await res.json() as {
      summary: { daysProcessed: number; totalEntriesCreated: number; totalErrors: number }
      details: Array<{ date: string; entriesCreated: number; errors: string[] }>
    }

    console.log(`  Done!`)
    console.log(`    Days processed: ${result.summary.daysProcessed}`)
    console.log(`    Entries created: ${result.summary.totalEntriesCreated}`)

    if (result.summary.totalErrors > 0) {
      console.log(`    Errors: ${result.summary.totalErrors}`)
      for (const d of result.details) {
        for (const err of d.errors) {
          console.log(`      ${d.date}: ${err}`)
        }
      }
    }

    for (const d of result.details) {
      if (d.entriesCreated > 0) {
        console.log(`    ${d.date}: ${d.entriesCreated} entries`)
      }
    }
  } catch (err) {
    console.error(`  Failed: ${err instanceof Error ? err.message : err}`)
    process.exitCode = 1
  }
}
