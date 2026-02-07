import { loadConfig } from '../config.js'
import { discoverProjects } from '../parsers/env-scanner.js'
import { postDiscover } from '../api-client.js'

interface DiscoverOptions {
  dryRun?: boolean
  verbose?: boolean
}

export async function discoverCommand(options: DiscoverOptions): Promise<void> {
  const config = loadConfig()

  console.log('\n  Cap Agent — Project Discovery')
  console.log()

  // 1. Scan local environment
  console.log('  Scanning environment for projects...')
  const discovered = discoverProjects(config.claudeDataDir)
  console.log(`  Found ${discovered.length} projects`)

  if (discovered.length === 0) {
    console.log('\n  No projects found in your environment.')
    return
  }

  if (options.verbose) {
    console.log()
    for (const p of discovered) {
      const sources = [p.hasGit ? 'git' : '', p.hasClaude ? 'claude' : ''].filter(Boolean).join('+')
      console.log(`    ${p.name.padEnd(30)} [${sources}] ${p.localPath}`)
    }
  }

  if (options.dryRun) {
    console.log('\n  Dry run — discovered projects:')
    for (const p of discovered) {
      const sources = [p.hasGit ? 'git' : '', p.hasClaude ? 'claude' : ''].filter(Boolean).join('+')
      console.log(`    ${p.name.padEnd(30)} [${sources}]`)
    }
    console.log('\n  Dry run complete — no data sent.')
    return
  }

  // 2. Send to server
  console.log('\n  Registering projects with server...')
  try {
    const result = await postDiscover(config, { projects: discovered })
    console.log(`  Done!`)
    console.log(`    New projects created: ${result.created}`)
    console.log(`    Existing updated:     ${result.updated}`)
    console.log(`    Total projects:       ${result.total}`)

    if (options.verbose && result.projects.length > 0) {
      console.log('\n  Server projects:')
      for (const p of result.projects) {
        const status = p.monitored ? 'monitored' : 'ignored'
        console.log(`    ${p.name.padEnd(30)} [${status}] ${p.phase}`)
      }
    }
  } catch (err) {
    console.error(`  Error: ${err instanceof Error ? err.message : err}`)
    process.exitCode = 1
  }
}
