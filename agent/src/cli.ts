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
  .command('discover')
  .description('Scan environment and register discovered projects with the server')
  .option('--dry-run', 'Show what would be discovered without sending')
  .option('--verbose', 'Show detailed output')
  .action(async (options) => {
    const { discoverCommand } = await import('./commands/discover.js')
    await discoverCommand(options)
  })

program
  .command('sync')
  .description('Sync local development data to central server')
  .option('--from <date>', 'Start date for backfill (YYYY-MM-DD)')
  .option('--to <date>', 'End date for backfill (YYYY-MM-DD)')
  .option('--dry-run', 'Show what would be synced without sending')
  .option('--verbose', 'Show detailed output')
  .option('--skip-discover', 'Skip auto-discovery of new projects')
  .option('--reparse', 'Re-read all JSONL files to extract enhanced fields (tool breakdown, files)')
  .action(async (options) => {
    const { syncCommand } = await import('./commands/sync.js')
    await syncCommand(options)
  })

// Hooks subcommands
const hooks = program
  .command('hooks')
  .description('Manage Claude Code hooks for real-time tool event capture')

hooks
  .command('install')
  .description('Install PostToolUse and Stop hooks into Claude Code')
  .action(async () => {
    const { hooksInstallCommand } = await import('./commands/hooks.js')
    await hooksInstallCommand()
  })

hooks
  .command('uninstall')
  .description('Remove capitalization hooks from Claude Code')
  .action(async () => {
    const { hooksUninstallCommand } = await import('./commands/hooks.js')
    await hooksUninstallCommand()
  })

hooks
  .command('status')
  .description('Check if hooks are installed and configured')
  .action(async () => {
    const { hooksStatusCommand } = await import('./commands/hooks.js')
    await hooksStatusCommand()
  })

// MCP subcommands
const mcp = program
  .command('mcp')
  .description('Manage MCP server for Claude-native data access')

mcp
  .command('install')
  .description('Register Cap Tracker MCP server with Claude Code')
  .action(async () => {
    const { mcpInstallCommand } = await import('./commands/mcp.js')
    await mcpInstallCommand()
  })

mcp
  .command('uninstall')
  .description('Remove Cap Tracker MCP server from Claude Code')
  .action(async () => {
    const { mcpUninstallCommand } = await import('./commands/mcp.js')
    await mcpUninstallCommand()
  })

mcp
  .command('status')
  .description('Check if MCP server is registered')
  .action(async () => {
    const { mcpStatusCommand } = await import('./commands/mcp.js')
    await mcpStatusCommand()
  })

program
  .command('generate')
  .description('Generate AI daily entries (calls server API)')
  .option('--date <date>', 'Generate for a specific date (YYYY-MM-DD, default: yesterday)')
  .option('--from <date>', 'Start date for batch generation (YYYY-MM-DD)')
  .option('--to <date>', 'End date for batch generation (YYYY-MM-DD)')
  .action(async (options) => {
    const { generateCommand } = await import('./commands/generate.js')
    await generateCommand(options)
  })

program
  .command('update')
  .description('Pull latest code and rebuild the agent')
  .action(async () => {
    const { updateCommand } = await import('./commands/update.js')
    await updateCommand()
  })

program
  .command('status')
  .description('Show agent status and last sync info')
  .action(async () => {
    const { statusCommand } = await import('./commands/status.js')
    await statusCommand()
  })

program.parseAsync().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
