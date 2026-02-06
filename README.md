# Software Capitalization Tracker

Automated tracking of developer time for ASC 350-40 software capitalization. Collects data from Claude Code sessions and git repos, AI categorizes work, developers confirm via daily review.

## Quick Start (Local Dev)

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp web/.env.example web/.env  # or edit web/.env directly
# Required: DATABASE_URL, NEXTAUTH_SECRET
# Set DEV_AUTH_BYPASS=true for local dev without Azure AD

# 3. Database
createdb software_capitalization
npm run db:migrate
psql software_capitalization < web/prisma/immutability_triggers.sql

# 4. Run
npm run dev          # http://localhost:3000
npm run db:studio    # Prisma Studio at :5555
```

## Agent Setup (Per Developer)

```bash
# 1. Generate an API key in the web UI (Settings page)

# 2. Initialize the agent
npx tsx agent/src/cli.ts init
# Enter: server URL, API key, your email

# 3. Sync your data
npx tsx agent/src/cli.ts sync --dry-run   # preview
npx tsx agent/src/cli.ts sync             # send

# 4. (Optional) Auto-sync via systemd timer
bash agent/install-timer.sh
```

## Architecture

| Component | Tech | Purpose |
|-----------|------|---------|
| `web/` | Next.js 16, Prisma 7, NextAuth v4 | Web app + API |
| `agent/` | Node.js CLI (Commander.js) | Collects dev data locally |
| Database | PostgreSQL | All data, immutable raw tables |
| Auth | Azure AD SSO (prod), dev bypass (local) | Townsquare domain only |

## Key Commands

```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run db:migrate   # Run Prisma migrations
npm run db:studio    # Open Prisma Studio
npm test             # Run all tests (91 tests)
npm run test:web     # Web tests only
npm run test:agent   # Agent tests only
```

## Project Phases (ASC 350-40)

| Phase | Treatment | Examples |
|-------|-----------|---------|
| Preliminary | Expensed | Design, evaluating alternatives |
| Application Development | **Capitalized** | Coding, testing, deployment |
| Post-Implementation | Expensed | Maintenance, bug fixes, training |

## Admin Tasks

- **Team management**: `/team` (admin only) - manage developer roles, activate/deactivate
- **Reports**: `/reports` - monthly capitalization reports, Excel/CSV export
- **Phase changes**: Require admin approval (email notification to scott.schatz@townsquaremedia.com)
- **Bulk reminders**: Send reminder emails to developers with pending entries

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | Yes | Session encryption (generate with `openssl rand -base64 32`) |
| `NEXTAUTH_URL` | Yes | App URL (http://localhost:3000 for dev) |
| `DEV_AUTH_BYPASS` | Dev only | Set `true` for local dev without Azure AD |
| `AZURE_AD_CLIENT_ID` | Prod | Azure AD app registration |
| `AZURE_AD_CLIENT_SECRET` | Prod | Azure AD client secret |
| `AZURE_AD_TENANT_ID` | Prod | Townsquare tenant ID |
| `ANTHROPIC_API_KEY` | Yes | For AI entry generation |
| `SMTP_HOST` | Yes | SMTP relay host |
| `SMTP_PORT` | Yes | SMTP port |
| `EMAIL_FROM` | Yes | Sender address for emails |
| `EMAIL_WEBHOOK_SECRET` | If using inbound email | Webhook auth for inbound email endpoint |
