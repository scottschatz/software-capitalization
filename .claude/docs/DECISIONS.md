# Architectural Decisions

Record of technical decisions and their context.

---

## Prisma 7 with PostgreSQL Adapter
- **Date**: 2026-02-05
- **Status**: Accepted

### Context
Needed a type-safe ORM for PostgreSQL. Prisma 7 was latest but introduced breaking changes.

### Decision
Use Prisma 7 with `prisma-client` generator and `@prisma/adapter-pg`. No `url` in datasource block. Import from `@/generated/prisma/client`.

### Alternatives
1. **Drizzle ORM**: More SQL-like but less mature ecosystem
2. **Prisma 6**: Stable but outdated, missing new features

### Consequences
- **Positive**: Full type safety, excellent schema migrations, generated types
- **Negative**: Prisma 7 breaking changes required specific adapter pattern, no `$use` middleware

---

## Three-Tier Data Immutability via PostgreSQL Triggers
- **Date**: 2026-02-05
- **Status**: Accepted
- **Updated**: 2026-02-09 — Expanded to document three-tier model

### Context
Raw session and commit data must be immutable for audit compliance (ASC 350-40). However, different tables have different update requirements — raw sessions need metric updates (sessions grow via context continuations), while entries need workflow updates (developer confirmation).

### Decision
Three tiers of immutability, all enforced by PostgreSQL `BEFORE UPDATE/DELETE` triggers in `prisma/immutability_triggers.sql`:

1. **Fully immutable** (no UPDATE, no DELETE): `raw_commits`, `raw_tool_events`, `raw_vscode_activity`, `daily_entry_revisions`, `manual_entry_revisions`, `project_history`
2. **Identity-immutable** (identity fields locked, metrics updatable, DELETE blocked): `raw_sessions` — identity fields (`session_id`, `developer_id`, `project_path`, `started_at`, `is_backfill`) cannot change; metric fields can be updated on re-sync
3. **Delete-protected** (UPDATE allowed, DELETE blocked): `daily_entries`, `manual_entries` — modified through confirmation workflow; every update creates an immutable revision record

### Alternatives
1. **Prisma middleware (`$use`)**: Removed in Prisma 7
2. **Application-level checks only**: Bypassable via direct DB access
3. **Uniform full immutability for all tables**: Would block session re-sync and entry confirmation workflow

### Consequences
- **Positive**: Database-level enforcement applies regardless of access method (app, Prisma Studio, direct SQL); tiered model supports real workflows while protecting provenance
- **Negative**: Must use raw SQL for triggers, not captured in Prisma schema; identity-immutable tier adds complexity to the trigger function

---

## Dual Authentication System
- **Date**: 2026-02-05
- **Status**: Accepted

### Context
Web UI needs SSO (Azure AD), agent CLI needs programmatic access.

### Decision
NextAuth v4 for web (Azure AD + dev bypass), SHA-256 hashed API keys (`cap_` prefix) for agent Bearer token auth.

### Alternatives
1. **OAuth tokens for agent**: Too complex for CLI tool
2. **Shared session approach**: Wouldn't work for headless agent

### Consequences
- **Positive**: Clean separation, each auth type optimized for its use case
- **Negative**: Two auth systems to maintain

---

## Stream-Reading JSONL Files
- **Date**: 2026-02-05
- **Status**: Accepted

### Context
Claude Code JSONL files can be up to 192MB. Loading entire files into memory would cause crashes.

### Decision
Use Node.js `readline.createInterface` with `createReadStream` to process line by line.

### Alternatives
1. **Load entire file**: Would crash on large files
2. **Worker threads**: Overkill for sequential line processing

### Consequences
- **Positive**: Handles any file size with constant memory usage
- **Negative**: Slightly slower than bulk loading for small files (negligible)

---

## execFileSync over execSync for Git Parsing
- **Date**: 2026-02-05
- **Status**: Accepted

### Context
Git log format uses `|||` as field separator, which the shell interprets as pipe operators.

### Decision
Use `execFileSync('git', args)` which passes arguments directly to the process, bypassing shell interpretation.

### Alternatives
1. **Different separator**: Would require escaping or choosing uncommon characters
2. **JSON output format**: Git doesn't natively output JSON with numstat

### Consequences
- **Positive**: No shell injection risk, `|||` works safely
- **Negative**: Cannot use shell features (pipes, redirects) — not needed

---

## Phase Change Approval via Single Admin Email
- **Date**: 2026-02-05
- **Status**: Accepted

### Context
ASC 350-40 requires management authorization for project phase changes that affect capitalization.

### Decision
Hardcode `scott.schatz@townsquaremedia.com` as the sole approver. Phase changes create a pending request requiring explicit approval.

### Alternatives
1. **Role-based approval**: Any admin can approve — too permissive for compliance
2. **Multi-party approval**: Overkill for a small team

### Consequences
- **Positive**: Clear accountability, audit trail, compliance-friendly
- **Negative**: Single point of failure if approver is unavailable

---

## JWT-Signed Email Action Buttons
- **Date**: 2026-02-05
- **Status**: Accepted

### Context
Email clients don't support POST requests or JavaScript. Need clickable approve/reject buttons.

### Decision
Use signed JWTs with 72-hour expiry embedded in GET URLs. Server verifies JWT and performs action.

### Alternatives
1. **Magic links with DB lookup**: More DB queries, harder to manage expiry
2. **No email actions**: Require web UI for all actions — poor mobile UX

### Consequences
- **Positive**: Works in all email clients, self-contained, auto-expires
- **Negative**: GET requests performing mutations (acceptable for one-time action links)

---

## Agent as Primary, Hooks as Optional Enrichment
- **Date**: 2026-02-06
- **Status**: Accepted
- **Updated**: 2026-02-09 — Clarified that agent is authoritative; hooks are optional

### Context
Agent sync provides rich session summaries and git commit history but runs periodically (every 4 hours). Hooks can capture real-time tool events but lack broader context. Hook payloads are event-scoped — each fires with data for that specific event only (not the full transcript or conversation).

### Decision
Agent (`cap sync`) is the **authoritative primary source**. It parses full JSONL session files (up to 192MB streamed) and git logs, extracting complete session metadata: duration, message counts, token usage, tool breakdown, files referenced, first user prompt, daily time breakdown. It works offline, handles backfill, and deduplicates on server.

Hooks are **optional enrichment**. PostToolUse captures tool name + sanitized file paths (truncated to 500 chars). Stop captures session end timestamp. Both are fire-and-forget HTTP calls. Hooks do NOT capture: full tool output, conversation transcript, user messages, or Claude's reasoning.

The system works fully without hooks. When hooks are active, tool event timestamps enable more precise gap-aware active time calculation.

### Alternatives
1. **Hooks only**: Would miss git commits, session-level context, and full session metadata; network-dependent with no backfill
2. **Agent only**: Would miss real-time tool-level granularity for active time calculation; no immediate session end detection
3. **Hooks sending full transcripts**: Impractical — JSONL files up to 192MB; real-time streaming during sessions would be disruptive; hook payloads don't include transcript data

### Consequences
- **Positive**: Agent ensures reliability regardless of hook configuration; hooks add precision when available; configurable per-team
- **Negative**: Two data collection paths to maintain; data feeds different tables (`raw_sessions` vs `raw_tool_events`); hooks require per-machine install (`cap hooks install`)

---

## MCP Server as API Proxy
- **Date**: 2026-02-06
- **Status**: Accepted

### Context
MCP server needed for Claude-native data access. Could access DB directly or proxy through the web API.

### Decision
MCP server calls web API endpoints using the developer's agent key. No direct database access from MCP.

### Alternatives
1. **Direct DB access**: Faster but duplicates auth/business logic
2. **GraphQL layer**: Overkill for 6 tools

### Consequences
- **Positive**: Single source of truth for auth and business logic; MCP server stays thin
- **Negative**: Extra network hop; MCP server needs `~/.cap-agent/config.json` with server URL and API key

---

## AI-Assisted Hour Estimation
- **Date**: 2026-02-06
- **Status**: Accepted

### Context
Claude Code does most of the actual coding. Traditional time tracking assumes human writes all code, but in AI-assisted development, the developer's role is directing and reviewing.

### Decision
AI prompt explicitly accounts for AI-assisted development. Uses user prompt count, tool breakdown, and session engagement metrics rather than commit volume. Active human time estimated at 50-70% of session duration.

### Alternatives
1. **Use session duration as-is**: Overestimates human effort significantly
2. **Use commit/line count**: Even worse — AI generates most code
3. **Manual time entry only**: Defeats the purpose of automation

### Consequences
- **Positive**: More accurate capitalization hours; conservative estimates reduce audit risk
- **Negative**: Estimates are still imperfect; requires developer review/confirmation

---

## Application Development as Default Phase
- **Date**: 2026-02-06
- **Status**: Accepted

### Context
ASC 350-40 has three phases: preliminary (expensed), application_development (capitalized), post_implementation (expensed). Almost all developer coding work falls into application_development.

### Decision
AI defaults to `application_development` for all coding work. Only uses `preliminary` for pure research/evaluation with no code. Only uses `post_implementation` when project is explicitly released AND work is purely maintenance/bug fixes.

### Alternatives
1. **Strict classification based on work type**: Bug fixes during development classified differently — overly complex, doesn't match accounting practice
2. **Always use project's current phase**: Ignores actual work being done

### Consequences
- **Positive**: Maximizes capitalizable hours (correct per ASC 350-40); reduces false post_implementation classification
- **Negative**: Post-release feature work needs manual phase creation (future: automated enforcement)

---

## Circuit Breaker for Local LLM Fallback
- **Date**: 2026-02-09
- **Status**: Accepted

### Context
Local LLM (gpt-oss-20b) can crash or become unreachable. With 3 retries at 3min timeout each, a down model wastes 9+ minutes per date before falling back to Haiku. When processing 40+ dates in batch, this is unacceptable.

### Decision
Three-state circuit breaker: `normal` (full 3 retries), `skip` (go straight to Haiku), `probe` (try once after 30min cooldown). State is determined by querying the last 5 model events from the `model_events` table. If all are fallbacks, circuit opens. After 30min, a single probe tests recovery — if it succeeds, the `success` event breaks the fallback streak and circuit closes.

### Alternatives
1. **Simple retry count only**: No adaptation to persistent outages — always wastes time retrying
2. **Manual circuit breaker toggle**: Requires human intervention to flip a flag when model is down/up
3. **Health check endpoint polling**: Would need a separate background process; model can pass health checks but still crash on specific inputs

### Consequences
- **Positive**: Self-healing — automatically adapts to model downtime and recovers when model comes back. Zero human intervention needed.
- **Negative**: 30min cooldown means up to 30min of Haiku-only operation after model recovers. Acceptable tradeoff.

---

## Local LLM as Primary, Anthropic as Fallback
- **Date**: 2026-02-09
- **Status**: Accepted

### Context
Anthropic Haiku works well but has per-token costs. A local gpt-oss-20b instance is available on the internal network at no marginal cost.

### Decision
Use local LLM as primary for all AI calls (entry generation, work type classification). Fall back to Haiku on failure. Log all model events for observability. Track which model generated each entry via `modelUsed`/`modelFallback` fields.

### Alternatives
1. **Haiku only**: Simpler but ongoing API costs
2. **Local only, no fallback**: Risky — model crashes would block entry generation entirely
3. **Request-level model selection**: Over-complex for current needs

### Consequences
- **Positive**: Zero marginal cost for most calls; Haiku fallback ensures reliability; full observability via model_events table
- **Negative**: Two model paths to test; local model can produce different quality results (addressed by improved prompts)

---

## Management Authorization as Informational (Not Blocking)
- **Date**: 2026-02-09
- **Status**: Accepted

### Context
The system showed "Hours on this project cannot be capitalized until management authorization is documented" as a blocking amber warning. But the system is a time tracker, not an accounting system — developers classify what they think happened, and accounting makes the final capitalization determination.

### Decision
Reframe authorization as informational. Developers can confirm entries normally regardless of authorization status. Reports use `authorizationDate` to determine per-entry capitalization eligibility (date-aware — authorization on Feb 15 doesn't retroactively apply to January entries). Blue info banner replaces amber warning.

### Alternatives
1. **Blocking workflow**: Prevent entry confirmation until authorized — too disruptive, conflates tracker with accounting system
2. **Ignore authorization entirely**: Loses ASU 2025-06 compliance tracking

### Consequences
- **Positive**: Developers aren't blocked; accounting gets the data they need from reports; date-aware means accurate per-entry classification
- **Negative**: Reports may show entries as "expensed" that will later become capitalizable once authorization date is set

---

## Minimum Activity Threshold for Entry Generation
- **Date**: 2026-02-09
- **Status**: Accepted

### Context
AI generated 2.6h for "Amperwave Users" project on 2/5 with zero source sessions and commits. The zero-evidence guard existed but didn't fire because a session's projectPath matched the project's registered claude path — even though the session had trivial activity (brief directory open, no real work).

### Decision
Add a minimum activity threshold: if matched source sessions have < 3 messages AND < 5 min active time on the target date, flag the entry as `low_activity` instead of creating as pending. This catches "opened Claude Code in wrong directory" without blocking legitimate brief work sessions that have commits to back them up.

### Alternatives
1. **Stricter zero-evidence guard only**: Doesn't catch sessions with path match but trivial activity
2. **Higher thresholds**: Risk flagging legitimate short sessions
3. **Remove path-based matching entirely**: Too aggressive, would break legitimate entries

### Consequences
- **Positive**: Phantom entries from brief directory opens caught and flagged; commit-backed entries unaffected
- **Negative**: Very short legitimate sessions (1-2 messages, no commits) will be flagged for review — acceptable tradeoff

---

## Post-Sync Auto-Generation (Server-Side)
- **Date**: 2026-02-11
- **Status**: Accepted

### Context
Entry generation was previously triggered by a separate systemd timer on each developer's machine. This required agent-side setup and meant generation only happened at fixed times regardless of sync timing. With multiple developers, generation should be centralized.

### Decision
Move generation to a server-side post-sync hook. After a successful sync with new data (`sessionsCreated > 0 || commitsCreated > 0`), the server fires off async entry generation for the last 7 completed days. Fire-and-forget: errors are logged but don't block the sync response. Agent `install-timer.sh` updated to be sync-only and clean up old generate timer.

### Alternatives
1. **Scheduled server cron**: Would require separate scheduler infrastructure (not just Next.js)
2. **Agent-side generation**: Requires each machine to have generation timer; doesn't scale to multiple developers
3. **Webhook from agent to trigger generation**: Extra complexity for same result

### Consequences
- **Positive**: Generation happens immediately after new data arrives; centralized; no agent-side setup needed; idempotent (safe to call repeatedly)
- **Negative**: Fire-and-forget means generation errors are only visible in server logs; generation tied to sync frequency

---

## Activity-Based Pipeline Sync Status
- **Date**: 2026-02-11
- **Status**: Accepted

### Context
Pipeline status checked `lastSync > endOfDay` to determine if a day was fully synced. This caused false "not synced" indicators when a developer's last sync captured all their activity but no subsequent sync ran after midnight (because the agent correctly found nothing new to send).

### Decision
Change `syncComplete` to check `lastSync > lastActivityTimestamp` per developer per date. Track the latest raw activity (session endedAt or commit committedAt) for each developer on each date. If the last sync happened after their last activity, the day is fully synced. Falls back to `endOfDay` if no activity is tracked.

### Alternatives
1. **Agent heartbeat**: Have agent send empty "ping" syncs to update server timestamp — adds unnecessary network traffic
2. **Keep end-of-day check**: Technically correct but confusing UX; pipeline shows "not synced" even when data is complete

### Consequences
- **Positive**: Accurate sync status; no false alarms; no agent changes needed
- **Negative**: Slightly more complex query (tracks per-developer per-date activity timestamps)

---

## When to Record

Record decisions for:
- Framework/library choices
- Data model designs
- Infrastructure decisions
- Non-obvious tradeoffs
