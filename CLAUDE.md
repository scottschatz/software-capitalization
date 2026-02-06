# Software Capitalization Tracker

## Project Overview
Automated tracking and reporting of developer time for ASC 350-40 software capitalization. Collects data from Claude Code sessions, git repos, and optionally VS Code activity. AI summarizes and categorizes work; developers confirm via daily review workflow.

## Architecture
- **Monorepo**: npm workspaces — `web/` (Next.js) + `agent/` (CLI tool)
- **Database**: PostgreSQL with Prisma ORM
- **Auth**: NextAuth v4 + Azure AD SSO (Townsquare tenant), dev bypass available
- **Agent auth**: Bearer token with SHA-256 hashed API keys

## Commands
- `npm run dev` — Start Next.js dev server (web/)
- `npm run build` — Build Next.js for production
- `npm run db:migrate` — Run Prisma migrations
- `npm run db:studio` — Open Prisma Studio
- `npm run agent` — Run agent CLI in dev mode
- `npx tsx agent/src/cli.ts sync --dry-run` — Preview agent sync
- `npm test` — Run all tests (Vitest)
- `npm run test:web` — Run web tests only
- `npm run test:agent` — Run agent tests only

## Key Conventions
- All raw_* tables are immutable (INSERT only, enforced by DB triggers + Prisma middleware)
- Project phase changes require admin approval (scott.schatz@townsquaremedia.com)
- All API endpoints return JSON and are documented
- JSONL parser must stream-read (files up to 192MB)
- Claude Code path encoding: `/home/user/projects/foo` → `-home-user-projects-foo`

## Environment Variables (web/.env)
- `DATABASE_URL` — PostgreSQL connection string
- `NEXTAUTH_URL` — App URL (http://localhost:3000 for dev)
- `NEXTAUTH_SECRET` — Session encryption secret
- `AZURE_AD_CLIENT_ID` — Azure AD app registration client ID
- `AZURE_AD_CLIENT_SECRET` — Azure AD client secret
- `AZURE_AD_TENANT_ID` — `a473edd8-ba25-4f04-a0a8-e8ad25c19632`
- `DEV_AUTH_BYPASS` — Set to "true" for local dev without Azure AD

---

# Documentation Protocol

This project uses claude-docs-system for automated documentation and project management.

---

## Doc Commands

| Command | When | What |
|---------|------|------|
| `/onboard` | New session | Read docs, get project briefing |
| `/dev` | Ready to code | Check env, start servers |
| `/sync` | End of session | Auto-extract issues/decisions/services |
| `/push` | Ready to ship | Scan secrets → commit → push |
| `/feature` | Have an idea | Log with phase/complexity assessment |
| `/task` | Ready to build | Create, view, or complete tasks |
| `/audit` | Status check | Deep analysis, production readiness |
| `/handoff` | Sharing project | Generate developer handoff doc |

---

## Typical Flow

```
/onboard           # Start: get briefed
/dev               # Start servers
# ... code ...
/feature [idea]    # Log ideas as they come
# ... code ...
/sync              # End: log everything
/push              # Ship: scan + commit + push
```

---

## What `/sync` Extracts

| Discussion | → Document |
|------------|-----------|
| Bugs, errors, "doesn't work" | KNOWN_ISSUES.md |
| "Let's use X because Y" | DECISIONS.md |
| npm install, API integrations | services/*.md |
| New routes, components | components/*.md |
| Session summary | CHANGELOG.md |

---

## Documentation

| Document | Purpose |
|----------|---------|
| `.claude/docs/ARCHITECTURE.md` | System overview, tech stack |
| `.claude/docs/CHANGELOG.md` | What changed when |
| `.claude/docs/DECISIONS.md` | Why things were built this way |
| `.claude/docs/KNOWN_ISSUES.md` | Bugs, tech debt, blockers |
| `.claude/docs/ASSESSMENT.md` | Production readiness (from /audit) |
| `.claude/docs/LOCAL_DEV.md` | Local dev setup (from /dev) |
| `.claude/docs/services/*.md` | External service integrations |
| `.claude/docs/components/*.md` | Internal component docs |
| `.claude/features/README.md` | Feature backlog by phase |
| `.claude/tasks/README.md` | Task board |

---

## Issue Severity

| Level | Description |
|-------|-------------|
| CRITICAL | System unusable, data loss, security |
| HIGH | Major feature broken, no workaround |
| MEDIUM | Feature impaired, workaround exists |
| LOW | Minor inconvenience |

---

## Feature Phases

| Phase | Criteria |
|-------|----------|
| MVP | Can't ship without it |
| v1.0 | Important for first release |
| v1.1 | Ship shortly after launch |
| v2.0 | Future vision |

---

## Multi-Instance Rules

When running parallel Claude instances:
- Tasks in different parallel groups (different files)
- Independent documentation work
- Never parallelize tasks that modify the same files
- Never parallelize database migrations or package.json changes
- Check `/task` for parallel execution groups before starting
