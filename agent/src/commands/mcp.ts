import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const MCP_SERVER_NAME = 'cap-tracker'

export async function mcpInstallCommand(): Promise<void> {
  console.log('\n  Installing Cap Tracker MCP server...\n')

  // Find the mcp server path relative to this package
  // The mcp workspace is at the root level alongside agent/
  const mcpServerPath = join(__dirname, '..', '..', '..', 'mcp', 'src', 'server.ts')

  try {
    // Register with Claude Code
    execFileSync('claude', ['mcp', 'add', MCP_SERVER_NAME, '--', 'npx', 'tsx', mcpServerPath], {
      encoding: 'utf-8',
      stdio: 'inherit',
    })
    console.log(`\n  MCP server "${MCP_SERVER_NAME}" installed successfully!`)
    console.log('  Claude can now use tools like get_my_hours, confirm_entries, log_manual_time.')
  } catch (err) {
    console.error(`  Failed to install MCP server: ${err instanceof Error ? err.message : err}`)
    console.log('\n  Make sure Claude CLI is installed and accessible.')
    console.log(`  You can manually register: claude mcp add ${MCP_SERVER_NAME} -- npx tsx ${mcpServerPath}`)
  }
}

export async function mcpUninstallCommand(): Promise<void> {
  console.log('\n  Uninstalling Cap Tracker MCP server...\n')

  try {
    execFileSync('claude', ['mcp', 'remove', MCP_SERVER_NAME], {
      encoding: 'utf-8',
      stdio: 'inherit',
    })
    console.log(`\n  MCP server "${MCP_SERVER_NAME}" removed successfully.`)
  } catch (err) {
    console.error(`  Failed to remove MCP server: ${err instanceof Error ? err.message : err}`)
  }
}

export async function mcpStatusCommand(): Promise<void> {
  console.log('\n  Cap Tracker MCP Status\n')

  try {
    const output = execFileSync('claude', ['mcp', 'list'], {
      encoding: 'utf-8',
    })

    if (output.includes(MCP_SERVER_NAME)) {
      console.log(`  \u2713 MCP server "${MCP_SERVER_NAME}" is registered`)
    } else {
      console.log(`  \u2717 MCP server "${MCP_SERVER_NAME}" is NOT registered`)
      console.log('  Run: cap mcp install')
    }
  } catch {
    console.log('  \u2717 Could not check MCP status (is Claude CLI installed?)')
  }
}
