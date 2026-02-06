#!/usr/bin/env node
import { Command } from 'commander'

const program = new Command()
program
  .name('cap')
  .description('Software Capitalization Agent — collects development activity data')
  .version('0.1.0')

program
  .command('init')
  .description('Initialize agent configuration')
  .action(async () => {
    const { initCommand } = await import('./commands/init.js')
    await initCommand()
  })

program
  .command('sync')
  .description('Sync local development data to central server')
  .option('--from <date>', 'Start date for backfill (YYYY-MM-DD)')
  .option('--to <date>', 'End date for backfill (YYYY-MM-DD)')
  .option('--dry-run', 'Show what would be synced without sending')
  .option('--verbose', 'Show detailed output')
  .action(async (options) => {
    const { syncCommand } = await import('./commands/sync.js')
    await syncCommand(options)
  })

program
  .command('status')
  .description('Show agent status and last sync info')
  .action(async () => {
    const { statusCommand } = await import('./commands/status.js')
    await statusCommand()
  })

program.parse()
