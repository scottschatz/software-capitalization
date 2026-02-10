# Architecture Overview

> Last updated: 2026-02-09

## Tech Stack

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| Frontend | Next.js (App Router) | 16.1.6 | Full-stack React framework |
| UI | React + Radix UI + shadcn/ui | 19.2.3 / 1.4.3 | Component library |
| Styling | Tailwind CSS v4 | 4.x | Utility-first CSS |
| Backend | Next.js API Routes | 16.1.6 | REST API endpoints |
| Database | PostgreSQL | 16 | Primary data store |
| ORM | Prisma | 7.3.0 | Type-safe database access |
| Auth | NextAuth v4 + Azure AD | 4.24.13 | SSO authentication |
| AI | Local LLM (gpt-oss-20b) + Anthropic Haiku fallback | — | Daily entry generation |
| Email | Nodemailer + JWT | 7.0.13 | Email notifications + quick actions |
| Validation | Zod | 4.3.6 | Schema validation |
| Forms | React Hook Form | 7.71.1 | Form state management |
| Agent CLI | Commander.js | 14.0.0 | CLI framework |
| MCP | @modelcontextprotocol/sdk | 1.x | Claude-native tool access |
| Testing | Vitest | 3.x | Unit testing (311 test cases) |
| Language | TypeScript | 5.x | Type safety |
| Runtime | Node.js | 20.19 | Server runtime |

## Directory Structure

```
software-capitalization/
├── package.json              # Root: npm workspaces (web, agent, mcp)
├── CLAUDE.md                 # Project instructions
├── .claude/                  # Documentation system
│   ├── commands/             # Slash commands
│   ├── docs/                 # Architecture, changelog, decisions, issues
│   ├── features/             # Feature backlog
│   └── tasks/                # Task board
├── web/                      # Next.js 16 application
│   ├── prisma/
│   │   ├── schema.prisma     # 26 models
│   │   ├── immutability_triggers.sql
│   │   └── migrations/
│   └── src/
│       ├── app/
│       │   ├── (authenticated)/  # Protected pages (sidebar layout)
│       │   │   ├── page.tsx          # Dashboard
│       │   │   ├── projects/         # CRUD UI (list, new, detail, edit)
│       │   │   ├── review/           # Daily entry review
│       │   │   ├── reports/          # Monthly reports, project detail, unconfirmed
│       │   │   ├── settings/         # Agent key management, system health (admin)
│       │   │   └── team/             # Team admin (developer management)
│       │   ├── api/                  # 52 API routes
│       │   │   ├── agent/            # sync, projects, last-sync, discover, hooks/*, entries/*, hours, activity
│       │   │   ├── auth/             # NextAuth
│       │   │   ├── email-reply/      # approve, inbound
│       │   │   ├── entries/          # date, confirm, confirm-all, generate, manual
│       │   │   ├── keys/             # API key CRUD
│       │   │   └── projects/         # CRUD + phase-change approval
│       │   ├── auth/signin/          # Custom sign-in page
│       │   └── layout.tsx            # Root layout
│       ├── components/
│       │   ├── layout/       # Header, Sidebar
│       │   ├── projects/     # PhaseBadge, ProjectForm, PhaseChangeDialog/Review, MonitoringToggle
│       │   ├── providers/    # SessionProvider
│       │   ├── review/       # EntryCard, ManualEntryDialog, ConfirmAllButton
│       │   ├── settings/     # AgentKeysManager
│       │   └── ui/           # 16 shadcn/ui primitives (incl. Switch)
│       ├── generated/prisma/ # Prisma 7 generated client
│       └── lib/
│           ├── actions/      # Server actions (project, agent-key)
│           ├── ai/           # Anthropic client, prompts, entry generation
│           ├── email/        # Mailer, templates, JWT tokens
│           ├── jobs/         # generate-daily-entries, send-daily-emails
│           ├── active-time.ts # Tool event-based active time calculation
│           └── validations/  # Zod schemas (project, sync)
├── agent/                    # CLI tool (@townsquare/cap-agent)
│   └── src/
│       ├── cli.ts            # Commander.js entry point
│       ├── config.ts         # ~/.cap-agent/config.json
│       ├── api-client.ts     # HTTP client for server API
│       ├── commands/         # init, sync, status, hooks, mcp, discover
│       └── parsers/          # claude-jsonl, claude-scanner, git-log, env-scanner
└── mcp/                      # MCP server (Claude-native tool access)
    └── src/server.ts         # Stdio transport, 6 tools, proxies to web API
```

## Key Components

### Web: Authentication System
- **Purpose**: Dual auth — session-based for web UI, token-based for agent API
- **Location**: `web/src/lib/auth.ts`, `web/src/lib/agent-auth.ts`
- **Dependencies**: NextAuth v4, Azure AD, Prisma

### Web: Project CRUD + Phase Approval
- **Purpose**: Full project lifecycle with immutable audit trail and phase change approval workflow
- **Location**: `web/src/lib/actions/project-actions.ts`, `web/src/app/api/projects/`
- **Dependencies**: Prisma, Zod validation schemas

### Web: AI Entry Generation
- **Purpose**: Local LLM (primary) or Anthropic Haiku (fallback) analyzes raw sessions + commits to generate daily time entries
- **Location**: `web/src/lib/ai/`, `web/src/lib/jobs/generate-daily-entries.ts`
- **Dependencies**: @anthropic-ai/sdk (fallback), OpenAI-compatible API (local)
- **Resilience**: 3 retries → circuit breaker (30min cooldown) → auto-probe recovery
- **Observability**: All calls logged to `model_events` table; admin health page at `/settings/system-health`
- **Enhanced fields**: toolBreakdown, filesReferenced, userPromptCount, firstUserPrompt

### Web: Email System
- **Purpose**: Daily review emails with JWT-signed quick-action buttons
- **Location**: `web/src/lib/email/`, `web/src/app/api/email-reply/`
- **Dependencies**: Nodemailer, jsonwebtoken

### Web: Active Time Calculation
- **Purpose**: Calculate active coding time from tool event timestamps (vs wall-clock session duration)
- **Location**: `web/src/lib/active-time.ts`
- **Logic**: Gaps < 5 min = active, gaps >= 5 min = idle/thinking break

### Agent: JSONL Parser (Enhanced)
- **Purpose**: Stream-parse Claude Code JSONL files (up to 192MB) for session metrics + tool breakdowns
- **Location**: `agent/src/parsers/claude-jsonl.ts`
- **Enhanced output**: toolBreakdown, filesReferenced, userPromptCount, firstUserPrompt

### Agent: Git Log Parser
- **Purpose**: Parse git log with numstat for commit metrics
- **Location**: `agent/src/parsers/git-log.ts`
- **Dependencies**: Node.js child_process (built-in)

### Agent: Claude Code Hooks
- **Purpose**: Real-time tool event capture via PostToolUse and Stop hooks
- **Location**: `agent/src/commands/hooks.ts`, `~/.cap-agent/hooks/*.sh`
- **Events**: Tool invocations → `POST /api/agent/hooks/tool-event`, session end → `POST /api/agent/hooks/session-event`

### MCP Server
- **Purpose**: Claude-native data access — query hours, confirm entries, log time from within Claude Code
- **Location**: `mcp/src/server.ts`
- **Tools**: get_my_hours, get_projects, get_pending_entries, confirm_entries, log_manual_time, get_activity_summary
- **Design**: Thin proxy to web API, no direct DB access

## Data Collection Architecture

The system collects developer activity through two complementary mechanisms:

### Cap Agent (Primary — Batch Sync)
The `cap sync` CLI is the **authoritative data source**. Runs on schedule (every 4h via cron) or on demand.

| Data Source | What It Captures | Stored In |
|-------------|-----------------|-----------|
| Claude Code JSONL files | Session metadata: duration, message counts, token usage, tool breakdown, files referenced, first user prompt, daily time breakdown | `raw_sessions` |
| Git repositories | Commit hash, author, timestamp, message, file change stats (insertions/deletions) | `raw_commits` |

Key properties: works offline, handles backfill, deduplicates on server, no external dependencies.

### Claude Code Hooks (Optional — Real-Time Events)
Installed via `cap hooks install`. Registers shell scripts in `~/.claude/settings.json`.

| Hook Event | What It Captures | Stored In |
|------------|-----------------|-----------|
| PostToolUse | Tool name, sanitized file paths, truncated commands (500 char max) | `raw_tool_events` |
| Stop | Session end timestamp | Updates `raw_sessions.ended_at` |

**Does NOT capture:** Full tool output, conversation transcript, user messages, or Claude's reasoning. Hook payloads are event-scoped — each hook fires with data for that specific event only.

**Advantages:** Real-time timestamps enable more precise active time calculation; session end detected immediately.
**Limitations:** Network dependent (events lost if server unreachable), no backfill, requires per-machine setup.

Both mechanisms feed into immutable raw data tables (see Immutability section below).

## Data Immutability

Enforced by PostgreSQL `BEFORE UPDATE/DELETE` triggers in `prisma/immutability_triggers.sql`. Rules apply regardless of access method (app, Prisma Studio, direct SQL).

| Tier | Tables | Rule | Rationale |
|------|--------|------|-----------|
| Fully immutable | `raw_commits`, `raw_tool_events`, `raw_vscode_activity`, `daily_entry_revisions`, `manual_entry_revisions`, `project_history` | No UPDATE, no DELETE | Write-once source evidence and audit logs |
| Identity-immutable | `raw_sessions` | Identity fields locked (`session_id`, `developer_id`, `project_path`, `started_at`, `is_backfill`); metric fields updatable; DELETE blocked | Sessions grow via context continuations — metrics must be updatable on re-sync without changing provenance |
| Delete-protected | `daily_entries`, `manual_entries` | UPDATE allowed (workflow), DELETE blocked | Entries are modified through confirmation workflow; every update creates an immutable revision record |

## Data Flow

```
1. Data Collection
   Agent (primary):  JSONL files + git log → cap sync → POST /api/agent/sync → raw_sessions + raw_commits
   Hooks (optional): PostToolUse → POST /api/agent/hooks/tool-event → raw_tool_events
                     Stop → POST /api/agent/hooks/session-event → raw_sessions.ended_at

2. AI Entry Generation (systemd timer, 7 AM ET)
   Queries raw_sessions + raw_commits + raw_tool_events by developer+date
   → Local LLM (primary) or Anthropic Haiku (fallback) generates entries
   → daily_entries (status: pending)

3. Developer Review (email at 8 AM ET or web UI or MCP)
   "Approve All" email button → GET /api/email-reply/approve → confirmed
   Web UI → PATCH /api/entries/[id]/confirm → confirmed
   MCP tool → POST /api/agent/entries/confirm → confirmed

4. Reporting
   Monthly reports aggregate confirmed daily_entries + manual_entries
```

## Authentication

| Context | Method | Storage |
|---------|--------|---------|
| Web UI | NextAuth session (JWT in dev, DB in prod) | Cookie |
| Agent API | Bearer token → SHA-256 hash lookup | `agent_keys` table |
| Email actions | Signed JWT (72h expiry) | URL query param |

## Database Schema (26 Models)

- **Auth**: Developer, Account, Session, VerificationToken, AgentKey
- **Immutable Raw Data**: RawSession, RawCommit, RawVscodeActivity, RawToolEvent, AgentSyncLog
- **Projects**: Project, ProjectRepo, ProjectClaudePath, ProjectHistory, PhaseChangeRequest
- **Daily Entries**: DailyEntry, ManualEntry, DailyEntryRevision, ManualEntryRevision
- **Email**: EmailLog, EmailReply
- **Reports**: MonthlyReport, MonthlyExecutiveSummary
- **Operational**: ModelEvent, SystemSetting, PeriodLock

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NEXTAUTH_URL` | Yes | Application URL |
| `NEXTAUTH_SECRET` | Yes | Session encryption secret |
| `AZURE_AD_CLIENT_ID` | Prod | Azure AD app registration |
| `AZURE_AD_CLIENT_SECRET` | Prod | Azure AD client secret |
| `AZURE_AD_TENANT_ID` | Prod | Townsquare tenant ID |
| `DEV_AUTH_BYPASS` | Dev | "true" for local dev without Azure AD |
| `ANTHROPIC_API_KEY` | Yes | AI entry generation |
| `SMTP_HOST` | Email | SMTP hostname |
| `SMTP_PORT` | Email | SMTP port |
| `SMTP_USER` | Email | SMTP username |
| `SMTP_PASS` | Email | SMTP password |
| `SMTP_SECURE` | Email | TLS flag |
| `EMAIL_FROM` | Email | Sender address |
| `EMAIL_JWT_SECRET` | Email | JWT secret for action tokens |
| `EMAIL_WEBHOOK_SECRET` | Email | Inbound email webhook auth |
| `AI_LOCAL_URL` | No | Local LLM endpoint (default: `http://10.12.112.8:11434`) |
| `AI_LOCAL_MODEL` | No | Local model name (default: `qwen/qwen3-32b`) |
| `AI_LOCAL_ENABLED` | No | Set `"false"` to disable local LLM |
| `AI_FALLBACK_MODEL` | No | Anthropic fallback model (default: `claude-haiku-4-5-20251001`) |
| `CAP_TIMEZONE` | No | Company timezone for day boundaries (default: `America/New_York`) |

## External Services

See `.claude/docs/services/` for detailed documentation.

## Deployment

### Production
- **Platform**: Microsoft App Proxy (same pattern as invoice-bot)
- **URL**: TBD (will follow `*-townsquaremedia0.msappproxy.net` pattern)
- **Deploy**: systemd service + Prisma migrations
