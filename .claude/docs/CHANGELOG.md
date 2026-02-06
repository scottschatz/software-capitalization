# Changelog

All notable changes documented here.

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
