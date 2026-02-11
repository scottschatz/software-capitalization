# Changelog

All notable changes documented here.

## [0.9.0] - 2026-02-11

### Added — Multi-Developer Onboarding, Server-Side Generation, Pipeline Fixes
- **Post-Sync Auto-Generation**: After a successful sync with new data, the server now auto-generates entries for the last 7 completed days (fire-and-forget, idempotent). Replaces the old agent-side generation timer.
- **Inline Enhancement Workflow**: When developers select "capitalizable" on a post-implementation project entry, an inline panel appears to create or select an enhancement project and reassign the entry — directly in the entry review card.
- **Activity-Based Sync Status**: Pipeline status `syncComplete` now checks if the last sync happened after the developer's last raw activity on that date, instead of requiring a sync after midnight. Eliminates false "not synced" indicators.
- **Second Developer Onboarded**: Joe Ainsworth added as developer with agent key and systemd timer.

### Changed
- **Agent Timer (sync-only)**: `install-timer.sh` rewritten to only install the sync timer. Generation is now server-side (post-sync hook). Old `cap-generate` timer automatically cleaned up on reinstall.
- **Timer Portability**: Service files now use `__PROJECT_DIR__` and `__NPX__` placeholders, substituted at install time. Works across machines without hardcoded paths.
- **Enhancement Route Access**: `POST /api/projects/[id]/enhancements` no longer requires admin/manager role — any authenticated developer can create enhancement projects (needed for review-flow enhancement creation).

### Fixed
- **Pipeline "Not Synced" False Positive**: Developers who stopped working at 4 PM, with a 4 PM sync capturing everything, no longer show as "not synced" until the next day's first sync.
- **systemd Availability Check**: `install-timer.sh` now checks if systemd is running before attempting install, with WSL2-specific instructions if not.

---

## [0.8.1] - 2026-02-09

### Added — Dashboard Reorganization & Documentation
- **Dashboard Card Grouping**: Reorganized 6 stat cards from 3-col interleaved grid to 2-col grouped layout: status (Pending Review | Active Projects), weekly (This Week | Last Week), monthly (Current Month | Previous Month)
- **Pipeline Developer Name**: Single-developer pipeline rows now show developer name inline next to date; multi-developer rows still show "(N developers)" with expandable sub-rows
- **Methodology: Data Collection Architecture** (4 new sections): Source 1 (Cap Agent), Source 2 (Hooks), Source 3 (Git), with detailed field-by-field lists of what each captures, advantages, limitations, and why the agent is primary
- **Methodology: Data Immutability** (new section): Three-tier immutability model — fully immutable (raw_commits, raw_tool_events, revision tables), identity-immutable (raw_sessions), delete-protected (daily_entries, manual_entries) — with enforcement mechanism details
- **Controls Summary**: Expanded from 2 immutability rows to 4 (immutable source data, identity-locked sessions, delete-protected entries, complete revision history)
- **ARCHITECTURE.md**: New "Data Collection Architecture" section with comparison tables; new "Data Immutability" section with tier/table/rule/rationale table

### Changed
- **ARCHITECTURE.md Data Flow**: Updated to distinguish agent (primary) vs hooks (optional) data paths

---

## [0.8.0] - 2026-02-09

### Added — Enhancement Workflow, Authorization, Onboarding, Generation Guards
- **Post-Implementation Entry Reclassification**: When a project moves to post-implementation phase, pending entries are auto-reclassified and flagged with enhancement suggestion
- **Entry Reassignment APIs**: `PATCH /api/entries/[id]/reassign` (individual) and `PATCH /api/entries/reassign-bulk` (bulk) for moving entries to enhancement projects
- **Enhancement Picker UI**: `EnhancementReassignPanel` on entry cards with dropdown picker; `BulkReassignBanner` in review page for grouped flagged entries
- **Date-Aware Authorization**: `authorizationDate` field determines which entries qualify for capitalization — entries before the authorization date are classified as expensed in reports
- **Minimum Activity Threshold**: Entries with < 3 messages AND < 5 min active time flagged as `low_activity` instead of created as pending — prevents phantom entries from brief directory opens
- **README Quick Start**: "Let Claude Set It Up" section with copy-paste prompt; all-in-one bash setup block; verify/troubleshooting sections
- **`.env.example`**: Created with safe placeholder values; `.gitignore` updated to track it
- **Projects Guide Component**: `projects-guide.tsx` with management authorization explanation
- **Developer Filter Component**: `developer-filter.tsx` for projects page
- **Loading Skeletons**: Added to projects, reports, review, and team pages

### Changed
- **Management Authorization**: Reframed from blocking amber warning to informational blue banner — developers confirm entries normally, accounting makes final determination
- **Report Capitalization**: Date-aware check using `authorizationDate` in query-builder.ts for both daily and manual entries
- **Entry Card Authorization Hints**: Shows context-specific hints ("pending authorization", "before authorization date", "completion not assessed")
- **Audit Hardening (Waves 1-7)**: All mutating API endpoints wrapped in `$transaction`, role-based access control, period lock checks, revision audit trails
- **Team Page**: Extracted to client component (`team-client.tsx`)

### Fixed
- **Phantom Entries**: AI-generated entries for projects with no real activity now caught by zero-evidence guard + minimum activity threshold (e.g., 2.6h Amperwave Users entry with 0 sources)

---

## [0.7.0] - 2026-02-09

### Added — Local LLM Support & Model Health Monitoring
- **Local LLM Integration**: Primary model is now `gpt-oss-20b` via OpenAI-compatible API (`AI_LOCAL_URL`), with Anthropic Haiku as fallback
- **Retry Logic**: 3 retries with 2s delay before falling back to Haiku
- **Circuit Breaker**: After 3+ consecutive fallbacks, skips retries for 30min then probes once to auto-recover when local model comes back online
- **Model Event Logging**: New `model_events` table tracks every AI call — success, retry, fallback, error — with latency, attempt count, target date, and error messages
- **System Health Page**: Admin-only page at `/settings/system-health` showing model config, 7-day success rate, fallback dates, entry model distribution, and scrollable event log with alert banner for consecutive fallbacks
- **Hooks Quality Dot**: Violet dot in data quality indicators showing real-time hook event richness (alongside blue sessions and green commits)
- **Expense Hours in Day Header**: Day accordion header now shows expense hours alongside total and capitalizable
- **Special Token Stripping**: Strips `<|...|>` control tokens (gpt-oss/vLLM) and `<think>` blocks (Qwen3/DeepSeek-R1) from model responses
- **Regeneration Scripts**: `scripts/regenerate-with-local-llm.ts` for full model comparison, `scripts/regen-targeted.ts` for specific dates, `scripts/measure-prompt-size.ts` for context window analysis
- **Dashboard: Last Week/Month Cards**: 6 stat cards (Active Projects, Pending Review, Last Week, This Week, Last Month, This Month) with date ranges and month names
- **Dashboard: Prior Month Project Breakdown**: Previous month hours-by-project section with confirmed/pending/capitalizable bars

### Changed
- **AI Prompt (Commit-Only Projects)**: Conservative guidance — LOC does not equal hours; generated code, migrations, schema dumps can add thousands of lines in minutes
- **Work Type Classifier**: Now passes `prompt: 'classification'` for separate circuit breaker tracking
- **AICompletionResult Interface**: Added `retryCount` field to track retry depth
- **CompletionOptions Interface**: Added `targetDate` and `prompt` fields for event logging

### Fixed
- **Jan 30 Over-Estimation**: GPT-OSS estimated 13.2h due to high LOC in auto-generated code; improved prompt reduced to 3.8h
- **Sidebar Double-Highlighting**: `/settings/system-health` no longer highlights both "Settings" and "System Health" — uses most-specific-match logic
- **Model Health API 500**: Switched from `requireDeveloper()` to `getDeveloper()` in Route Handler (redirect() crashes in API routes)
- **Dashboard Month Label Timezone Bug**: Previous month showed "December" instead of "January" due to `date-fns format()` using local time on UTC midnight dates — now uses UTC-safe month name computation

---

## [0.6.0] - 2026-02-08

### Added — Review UX, Audit Controls, Reporting Enhancements
- **Data Quality Badges**: Session (blue), commit (green) quality dots with intensity-based coloring on each entry card
- **Confidence Badge**: AI confidence score displayed as colored badge (green/blue/amber/red) in entry card header
- **`confidenceScore` Field**: New `Float?` column on DailyEntry, stored at generation time and backfilled from existing entries
- **Rejection Workflow**: Entries can be rejected with reason; rejected status + tracking fields on DailyEntry
- **Multi-Date Review**: `/review/[date]` page for single-day deep-dive
- **Gap Detection**: `generateWithGapDetection()` auto-backfills missed dates in last 7 days
- **Report Tooltips**: Info tooltips explaining metrics on reports page
- **Monthly Executive Summary**: AI-generated narrative summaries per month
- **Period Locks**: SOX compliance month-end close with open/soft_close/locked states
- **Manual Entry Approval**: Workflow for manual time entries requiring manager sign-off
- **Work Type Classification**: Heuristic + LLM classifier (coding/debugging/refactoring/research/testing/documentation/devops)
- **Cross-Validation**: Anomaly detection flags entries with hours significantly above developer's historical average
- **Export Improvements**: CSV/JSON export with work type and outlier flags

### Changed
- **Session Filtering**: Multi-day sessions filtered by `dailyBreakdown` — only includes sessions with actual activity on the target date
- **Timezone Handling**: Consistent `CAP_TIMEZONE` usage across all day boundary calculations
- **Gap-Aware Active Time**: Only intervals <15min between messages count as active time

---

## [0.5.0] - 2026-02-06

### Added — Phase 5: Hybrid Integration
- **Claude Code Hooks**: Real-time tool event capture via PostToolUse and Stop hooks
- **MCP Server**: 6 tools for Claude-native data access (`get_my_hours`, `get_projects`, `get_pending_entries`, `confirm_entries`, `log_manual_time`, `get_activity_summary`)
- **Enhanced JSONL Parser**: Extracts tool breakdown, files referenced, user prompt count, first user prompt from session logs
- **Batch Entry Generation**: Admin endpoint `POST /api/agent/entries/generate-batch` for backfilling date ranges
- **Active Time Calculation**: Tool event timestamp analysis for accurate active coding time (`web/src/lib/active-time.ts`)
- **Project Auto-Discovery**: `cap discover` scans local repos and Claude paths, `POST /api/agent/discover`
- **Monitoring Toggle**: Per-project monitoring on/off from project list UI
- **Agent API Expansion**: 8 new endpoints — hooks (tool-event, session-event), entries (pending, confirm, manual, generate-batch), hours, activity
- **Agent CLI Commands**: `cap hooks install/uninstall/status`, `cap mcp install/uninstall`, `cap discover`
- **Hook Scripts**: Fire-and-forget bash scripts in `~/.cap-agent/hooks/` for zero-latency capture

### Changed
- **AI Prompts**: Smarter phase classification (application_development as default), AI-assisted hour estimation using session engagement metrics
- **Dashboard**: Shows pending/estimated entries alongside confirmed data with visual distinction
- **Sync Validation**: Extended to accept enhanced session fields (toolBreakdown, filesReferenced, userPromptCount, firstUserPrompt)
- **Entry Generation Job**: Fetches and passes enhanced session fields to AI prompt
- **README**: Rewritten with architecture diagram, data flow table, agent vs hooks comparison, comprehensive setup instructions
- **Database Schema**: 22 models (added RawToolEvent), enhanced RawSession with 4 new columns

---

## [0.4.0] - 2026-02-05

### Added — Phase 4: Hardening
- **Vitest Test Framework**: 114 tests (91 web + 23 agent) covering parsers, validations, auth, AI prompts, active time
- **Security Fixes**: Input validation, error handling, auth hardening
- **Systemd Timer**: Cron jobs for entry generation (7 AM ET) and email sending (8 AM ET)
- **Error Boundaries**: Authenticated layout error boundary (`web/src/app/(authenticated)/error.tsx`)

---

## [0.3.5] - 2026-02-05

### Added — Phase 3.5: Team Management
- **Admin API Routes**: `GET/PATCH /api/admin/developers`, role management
- **Developer Management UI**: Team page with developer list, role assignment, activity status

---

## [0.3.0] - 2026-02-05

### Added — Phase 3: Reporting
- **Monthly Reports**: Capitalization reports with developer x project grid, capitalizable vs expensed totals
- **Project Detail Report**: Daily breakdown with source data drill-down
- **Unconfirmed Entries Report**: Cross-team pending entries with bulk reminder emails

---

## [0.1.0] - 2026-02-05

### Added — Phase 1: Foundation
- **Project Scaffold**: Monorepo with npm workspaces (`web/` Next.js 16 + `agent/` CLI)
- **Database Schema**: 21 Prisma models with PostgreSQL 16, immutability triggers on raw_* tables
- **Authentication**: NextAuth v4 with Azure AD SSO + dev bypass (CredentialsProvider)
- **App Layout**: Responsive sidebar navigation with Header, mobile Sheet support
- **Project CRUD**: Full REST API (5 endpoints) + UI (list, create, edit, detail with tabs)
- **Phase Approval Workflow**: Phase changes require admin approval (scott.schatz@townsquaremedia.com), 3 API endpoints
- **Agent Key Management**: Generate/revoke API keys with SHA-256 hashing, settings UI
- **Agent API Routes**: POST /api/agent/sync, GET /api/agent/projects, GET /api/agent/last-sync
- **Agent CLI**: `cap init`, `cap sync`, `cap status` commands
- **JSONL Parser**: Stream-reads Claude Code JSONL files (handles 192MB+ files)
- **Git Log Parser**: Parses git log with numstat using `execFileSync`
- **Claude Scanner**: Scans ~/.claude/projects/ for JSONL files, filters by modification time

### Added — Phase 2: AI & Confirmation
- **AI Integration**: Anthropic SDK with Claude Sonnet 4.5 for daily entry generation
- **Daily Entry Generation**: Systemd job groups raw data by developer+date, calls AI, creates pending entries
- **Daily Review UI**: Entry cards with editable fields, adjustment reason for >20% changes, source data
- **Entry API Routes**: 5 endpoints (get by date, confirm single, confirm all, manual, generate)
- **Email System**: Nodemailer + JWT-signed quick-action buttons (72h expiry)
- **Email Templates**: Daily review summary + phase change approval emails
- **Email Reply Processing**: AI interprets plain text email replies
- **Dashboard**: Real-time stats (projects, pending review, weekly/monthly hours), alerts for stale entries

### Fixed
- Git parser shell injection: switched `execSync` to `execFileSync` for `|||` separator safety
- Git parser numstat attribution: switched to start marker `<<<COMMIT>>>`
- Prisma Date type mismatch in AgentKeysManager: `Date | string` union type

---

## Format

- **Added**: New features
- **Changed**: Changes to existing functionality
- **Fixed**: Bug fixes
- **Removed**: Removed features
- **Security**: Security fixes
