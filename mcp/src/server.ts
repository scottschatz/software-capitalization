#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

// Load agent config for server URL and API key
interface AgentConfig {
  serverUrl: string
  apiKey: string
}

function loadConfig(): AgentConfig {
  const configPath = join(homedir(), '.cap-agent', 'config.json')
  if (!existsSync(configPath)) {
    throw new Error('Agent not configured. Run `cap init` first.')
  }
  return JSON.parse(readFileSync(configPath, 'utf-8'))
}

function headers(config: AgentConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
  }
}

async function apiGet(config: AgentConfig, path: string): Promise<unknown> {
  const res = await fetch(`${config.serverUrl}${path}`, { headers: headers(config) })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }
  return res.json()
}

async function apiPost(config: AgentConfig, path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${config.serverUrl}${path}`, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`API error ${res.status}: ${text}`)
  }
  return res.json()
}

const server = new McpServer({
  name: 'cap-tracker',
  version: '0.1.0',
})

// Tool 1: get_my_hours
server.tool(
  'get_my_hours',
  'Get my development hours for a date range, grouped by project',
  {
    from: z.string().optional().describe('Start date (YYYY-MM-DD). Defaults to 7 days ago.'),
    to: z.string().optional().describe('End date (YYYY-MM-DD). Defaults to today.'),
    projectName: z.string().optional().describe('Filter by project name (partial match)'),
  },
  async ({ from, to, projectName }) => {
    const config = loadConfig()
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    if (projectName) params.set('project', projectName)
    const data = await apiGet(config, `/api/agent/hours?${params}`) as Record<string, unknown>
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  }
)

// Tool 2: get_projects
server.tool(
  'get_projects',
  'List all monitored projects with their current phases and status',
  {},
  async () => {
    const config = loadConfig()
    const data = await apiGet(config, '/api/agent/projects')
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  }
)

// Tool 3: get_pending_entries
server.tool(
  'get_pending_entries',
  'Get my unconfirmed daily time entries that need review',
  {
    date: z.string().optional().describe('Date to check (YYYY-MM-DD). Defaults to all pending.'),
  },
  async ({ date }) => {
    const config = loadConfig()
    const params = date ? `?date=${date}` : ''
    const data = await apiGet(config, `/api/agent/entries/pending${params}`)
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  }
)

// Tool 4: confirm_entries
server.tool(
  'confirm_entries',
  'Confirm daily time entries for a specific date. Optionally adjust hours, phase, or description.',
  {
    date: z.string().describe('Date to confirm entries for (YYYY-MM-DD)'),
    adjustments: z.array(z.object({
      entryId: z.string().describe('ID of the entry to adjust'),
      hours: z.number().optional().describe('Adjusted hours'),
      phase: z.string().optional().describe('Adjusted phase (preliminary, application_development, post_implementation)'),
      description: z.string().optional().describe('Adjusted description'),
    })).optional().describe('Optional adjustments to individual entries'),
  },
  async ({ date, adjustments }) => {
    const config = loadConfig()
    const data = await apiPost(config, '/api/agent/entries/confirm', { date, adjustments })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  }
)

// Tool 5: log_manual_time
server.tool(
  'log_manual_time',
  'Log time spent on a project manually (for work not captured by Claude sessions)',
  {
    projectName: z.string().describe('Project name (partial match supported)'),
    hours: z.number().describe('Number of hours worked'),
    description: z.string().describe('Description of the work done'),
    date: z.string().optional().describe('Date of the work (YYYY-MM-DD). Defaults to today.'),
    phase: z.string().optional().describe('Development phase (preliminary, application_development, post_implementation). Defaults to project phase.'),
  },
  async ({ projectName, hours, description, date, phase }) => {
    const config = loadConfig()
    const data = await apiPost(config, '/api/agent/entries/manual', {
      projectName, hours, description, date, phase,
    })
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  }
)

// Tool 6: get_activity_summary
server.tool(
  'get_activity_summary',
  'Get a summary of recent tool usage, sessions, and commits for a date',
  {
    date: z.string().optional().describe('Date to summarize (YYYY-MM-DD). Defaults to today.'),
  },
  async ({ date }) => {
    const config = loadConfig()
    const params = date ? `?date=${date}` : ''
    const data = await apiGet(config, `/api/agent/activity${params}`)
    return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
  }
)

// Start the server
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

main().catch((err) => {
  console.error('MCP server error:', err)
  process.exit(1)
})
