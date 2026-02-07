# Software Capitalization Tracker

Automated tracking of developer time for ASC 350-40 software capitalization. Collects data from Claude Code sessions and git repos, AI categorizes work by project and phase, developers confirm via daily review.

## How It Works

```
Developer's Machine                          Server (web/)
┌────────────────────┐                 ┌──────────────────────┐
│ Claude Code        │                 │                      │
│  └─ JSONL logs     │──cap sync──────>│  raw_sessions        │
│  └─ Hooks ─────────│──real-time─────>│  raw_tool_events     │
│                    │                 │                      │
│ Git repos          │──cap sync──────>│  raw_commits         │
│                    │                 │                      │
│ MCP Server         │<──queries──────>│  API endpoints       │
└────────────────────┘                 │                      │
                                       │  AI (Claude Sonnet)  │
                                       │   └─ Generates daily │
                                       │      entry estimates │
                                       │                      │
                                       │  Web UI              │
                                       │   └─ Review/confirm  │
                                       │   └─ Reports/export  │
                                       └──────────────────────┘
```

1. **Agent** parses Claude Code JSONL session logs and git history, sends to server
2. **Hooks** capture real-time tool events (Edit, Read, Bash, etc.) as you work
3. **AI** analyzes daily activity and generates time entry estimates per project
4. **Developer** reviews and confirms entries via web UI or MCP tools in Claude
5. **Reports** aggregate confirmed hours for capitalization accounting

## Developer Setup

Every developer on the team needs to do these steps once:

### Step 1: Get an API Key

1. Log into the web UI at `https://<server-url>` (uses your Townsquare Azure AD login)
2. Go to **Settings** and click **Generate API Key**
3. Copy the key (starts with `cap_`) — it's shown only once

### Step 2: Initialize the Agent

```bash
# Clone the repo (or have it available locally)
git clone https://github.com/scottschatz/software-capitalization.git
cd software-capitalization

# Install dependencies
npm install

# Initialize the agent on your machine
npx tsx agent/src/cli.ts init
```

The init wizard will ask for:
- **Server URL**: The URL where the web app runs (e.g., `https://cap.townsquaremedia.com`)
- **API Key**: Paste the key from Step 1
- **Email**: Your Townsquare email (e.g., `jane.doe@townsquaremedia.com`)

This creates `~/.cap-agent/config.json` on your machine.

### Step 3: Sync Your Data

```bash
# Preview what will be synced (dry run)
npx tsx agent/src/cli.ts sync --dry-run

# Send data to server
npx tsx agent/src/cli.ts sync

# Backfill historical data (e.g., all of January)
npx tsx agent/src/cli.ts sync --from 2026-01-01 --to 2026-01-31
```

The sync command reads:
- **Claude Code sessions** from `~/.claude/projects/` (JSONL files) — extracts session duration, tool usage, files touched, user prompts
- **Git commits** from all monitored project repos — extracts commit messages, line counts, files changed

### Step 4: Install Hooks (Optional)

Hooks capture real-time tool events as you use Claude Code, giving per-tool timing data for more precise active-time calculations. **Hooks are not required** — the system works well with agent sync alone, which already captures session metadata, tool breakdowns, user prompts, and git commits. Hooks add finer timing granularity on top of that.

```bash
npx tsx agent/src/cli.ts hooks install
```

This registers hooks in `~/.claude/settings.json` that fire automatically every time Claude Code uses a tool (Edit, Read, Bash, etc.). The hooks are silent and add zero latency — they fire-and-forget a background HTTP request.

**Important: VSCode users** — Hooks currently do not fire in VSCode's Native UI panel ([known issue](https://github.com/anthropics/claude-code/issues/8985)). If you use Claude Code via the terminal (either standalone or with `claudeCode.useTerminal: true` in VSCode settings), hooks work as expected. If you prefer the VSCode Native UI, skip this step — agent sync still captures everything needed for accurate time tracking.

To check status or remove:
```bash
npx tsx agent/src/cli.ts hooks status
npx tsx agent/src/cli.ts hooks uninstall
```

### Step 5: Install MCP Server (Optional)

The MCP server lets you query your capitalization data directly from Claude Code:

```bash
npx tsx agent/src/cli.ts mcp install
```

Now you can ask Claude things like:
- "How many hours did I work on teams-notetaker this week?"
- "Show my pending entries"
- "Confirm my hours for today"
- "Log 2 hours on invoice-bot for yesterday — worked on email parsing"

To check status or remove:
```bash
npx tsx agent/src/cli.ts mcp status
npx tsx agent/src/cli.ts mcp uninstall
```

### Step 6: Set Up Auto-Sync (Recommended)

Run sync automatically so you don't have to remember:

```bash
# Linux (systemd user timer — syncs every 4 hours)
bash agent/install-timer.sh

# Or add to crontab manually
crontab -e
# Add: 0 */4 * * * cd /path/to/software-capitalization && npx tsx agent/src/cli.ts sync
```

## Daily Workflow

1. **Work normally** — Claude Code sessions and git commits are tracked automatically
2. **Check your dashboard** — log into the web UI to see estimated hours
3. **Review entries** — go to `/review/<date>` to confirm or adjust AI estimates
4. **Quick confirm via email** — daily review emails include an "Approve All" button

## Admin Setup (Server)

### Prerequisites
- Node.js 20+
- PostgreSQL 16+
- An Anthropic API key (for AI entry generation)

### Installation

```bash
git clone https://github.com/scottschatz/software-capitalization.git
cd software-capitalization
npm install

# Set up environment
cp web/.env.example web/.env
# Edit web/.env — set DATABASE_URL, NEXTAUTH_SECRET, ANTHROPIC_API_KEY
# For local dev: set DEV_AUTH_BYPASS=true

# Database
createdb software_capitalization
npm run db:migrate
psql software_capitalization < web/prisma/immutability_triggers.sql

# Start
npm run dev          # http://localhost:3000
```

### Initial Configuration

1. **Create projects** in the web UI (`/projects/new`) — define project names, link git repos and Claude Code paths
2. **Invite developers** — they'll auto-provision on first Azure AD login
3. **Generate entries** — AI generates daily entries from synced raw data

### Scheduled Jobs

Set up systemd timers (or cron) for:
- **7:00 AM ET** — Generate daily entries for yesterday
- **8:00 AM ET** — Send review emails to developers

## Architecture

| Component | Tech | Purpose |
|-----------|------|---------|
| `web/` | Next.js 16, Prisma 7, NextAuth v4 | Web app, API, AI entry generation |
| `agent/` | Node.js CLI (Commander.js) | Parses JSONL logs + git, syncs to server |
| `mcp/` | MCP SDK (TypeScript) | Claude-native data access tools |
| Database | PostgreSQL 16 | All data, immutable raw tables |
| Auth | Azure AD SSO (prod), dev bypass (local) | Townsquare domain only |

### Data Flow

| Source | What's Captured | How | Stored In |
|--------|----------------|-----|-----------|
| Claude Code JSONL | Session duration, tokens, tool breakdown, files, user prompts | `cap sync` (agent parses `~/.claude/projects/`) | `raw_sessions` |
| Claude Code Hooks | Individual tool events with timestamps | Real-time POST from bash hooks | `raw_tool_events` |
| Git repos | Commits, messages, insertions/deletions | `cap sync` (agent runs `git log`) | `raw_commits` |
| AI (Claude Sonnet) | Grouped daily entries with hours/phase/summary | Server-side generation job | `daily_entries` |
| Developer | Confirmed hours, phase, description | Web UI or MCP tools | `daily_entries` (confirmed) |

### Agent Sync vs Hooks — Why Both?

| | Agent (`cap sync`) | Hooks (real-time) |
|---|---|---|
| **Session metadata** | Duration, tokens, messages, tool count | Session start/stop only |
| **Tool breakdown** | Aggregate counts per session (Edit:117, Read:191...) | Individual events with timestamps |
| **Files referenced** | Extracted from JSONL after the fact | Each file as it's touched, real-time |
| **User prompts** | First 200 chars + count | Not captured |
| **Git commits** | Full git log parsing | Not captured |
| **Timing granularity** | Session-level (start/end) | Tool-level (every Edit, Read, Bash...) |
| **When it runs** | On-demand or cron (`cap sync`) | Automatic every tool invocation |

The agent provides **richer context** for AI entry generation (user prompts, tool breakdowns, git commits). Hooks provide **finer timing granularity** for active-time calculation (individual tool timestamps vs session-level start/end). Together they give the most accurate picture of developer activity.

## Key Commands

```bash
# Web
npm run dev          # Start dev server
npm run build        # Production build
npm run db:migrate   # Run Prisma migrations
npm run db:studio    # Open Prisma Studio

# Tests
npm test             # Run all tests
npm run test:web     # Web tests only
npm run test:agent   # Agent tests only

# Agent (run from repo root)
npx tsx agent/src/cli.ts init              # First-time setup
npx tsx agent/src/cli.ts sync              # Sync sessions + commits
npx tsx agent/src/cli.ts sync --dry-run    # Preview without sending
npx tsx agent/src/cli.ts sync --reparse    # Re-extract enhanced data from all sessions
npx tsx agent/src/cli.ts status            # Show config and last sync
npx tsx agent/src/cli.ts hooks install     # Install real-time hooks
npx tsx agent/src/cli.ts hooks status      # Check hook status
npx tsx agent/src/cli.ts mcp install       # Install MCP server for Claude
npx tsx agent/src/cli.ts mcp status        # Check MCP status
```

## Project Phases (ASC 350-40)

| Phase | Treatment | Examples |
|-------|-----------|---------|
| Preliminary | Expensed | Design, evaluating alternatives, research |
| Application Development | **Capitalized** | Coding, testing, integration, deployment |
| Post-Implementation | Expensed | Maintenance, bug fixes on released software |

**In practice**: Almost all active development work is classified as `application_development`. The AI defaults to capitalizable unless the project is explicitly released and the work is clearly maintenance. When significant new features are added to a released project, a new project phase should be created (e.g., "Project Name - Phase 2").

## Admin Tasks

- **Team management**: `/team` (admin only) — manage developer roles, activate/deactivate
- **Reports**: `/reports` — monthly capitalization reports, Excel/CSV export
- **Phase changes**: Require admin approval (email notification)
- **Bulk reminders**: Send reminder emails to developers with pending entries

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Yes | Session encryption (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | Yes | App URL (`http://localhost:3000` for dev) |
| `ANTHROPIC_API_KEY` | Yes | For AI entry generation (Claude Sonnet) |
| `DEV_AUTH_BYPASS` | Dev only | Set `true` for local dev without Azure AD |
| `AZURE_AD_CLIENT_ID` | Prod | Azure AD app registration |
| `AZURE_AD_CLIENT_SECRET` | Prod | Azure AD client secret |
| `AZURE_AD_TENANT_ID` | Prod | Townsquare tenant ID |
| `SMTP_HOST` | For emails | SMTP relay host |
| `SMTP_PORT` | For emails | SMTP port |
| `EMAIL_FROM` | For emails | Sender address for review emails |
