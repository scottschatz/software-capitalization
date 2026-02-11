# Project Audit Assessment

**Generated**: 2026-02-11
**Project**: Software Capitalization Tracker
**Repository**: github.com/scottschatz/software-capitalization (private)
**Branch**: main (up to date with origin)

---

## Project Overview

| Metric | Value |
|--------|-------|
| Type | Internal web app + CLI agent + MCP server |
| Tech Stack | Next.js 16 + PostgreSQL 16 + Prisma 7 + Local LLM + Anthropic Haiku |
| Source Files | 266 (.ts/.tsx) |
| Lines of Code | 91,556 |
| API Endpoints | 56 routes |
| Database Models | 26 |
| Test Cases | 311+ (20 test files) |
| Contributors | 2 (scott.schatz, joe.ainsworth) |
| Age | 7 days (first commit 2026-02-05) |
| Total Commits | 29 |
| Versions Released | 9 (0.1.0 → 0.9.0) |

---

## Production Readiness: 8/10

### Strengths
- **Audit compliance**: Immutable raw data (DB triggers), revision tracking, period locks (SOX)
- **Resilience**: Circuit breaker for local LLM, auto-fallback to Haiku, retry logic
- **Security**: Zod validation on all inputs, SHA-256 API key hashing, no SQL injection vectors
- **Test coverage**: 311+ test cases across parsers, validations, auth, AI prompts, active time
- **Observability**: Model event logging, system health dashboard, data quality badges
- **Documentation**: Architecture, decisions, known issues, changelog all maintained
- **Multi-developer**: Second developer onboarded with systemd timer automation
- **Server-side generation**: Post-sync auto-generation eliminates agent-side complexity

### Gaps
- **No CI/CD pipeline**: Tests run manually, no automated build/deploy
- **No reverse proxy**: App runs directly on dev machine (WSL2), not behind nginx/caddy
- **Single admin**: All approvals go through one person (scott.schatz)
- **1 unimplemented TODO**: Phase change approval email not wired up
- **phaseEffective not yet implemented**: Manager-authoritative phase override planned but not built

---

## Code Quality Scan Results

### Issues by Severity

| Severity | Count | Details |
|----------|-------|---------|
| CRITICAL | 0 | — |
| HIGH | 0 | — |
| MEDIUM | 7 active | Phase change email, GPT-OSS crashes, hooks in VSCode, hardcoded IPs, SMTP localhost fallback, EMAIL_WEBHOOK_SECRET optional, period lock consistency |
| LOW | 3 active | Post-release phase enforcement, empty catches (intentional), console.log in CLI |

### Code Hygiene

| Category | Count | Status |
|----------|-------|--------|
| TODO/FIXME comments | 1 | `project-actions.ts:369` — phase change email |
| Hardcoded IPs | 5 | `10.12.112.8` in 2 production files + 3 scripts (env var fallback) |
| Large functions (>100 lines) | 7 | `generateEntriesForDate` (~300), `updateProject` (~150), `syncCommand` (~239), others |
| `any` types | 128 | Mostly in generated Prisma client (~40), scripts, and AI prompt handling |
| ESLint disables | 0 | Clean |
| Empty catch blocks | 4 | All documented and intentional (graceful degradation) |
| Debug console.log | 0 | All 11 console.log/warn statements are intentional monitoring/CLI output |

### Type Safety

- All API inputs validated with Zod schemas
- Prisma 7 provides full type safety for DB queries
- 1 concern: `dailyBreakdown` JSON field cast without runtime validation in `generate-daily-entries.ts`
- `any` in production code limited to AI/prompt handling where structured types are impractical

### Security

- No hardcoded secrets in source code
- Auth on all routes (NextAuth session or Bearer token)
- `execFileSync` used instead of `execSync` (no shell injection)
- JWT email tokens expire after 72 hours
- Dev-only secret fallbacks properly guarded by `NODE_ENV` check
- SMTP defaults to `localhost` if `SMTP_HOST` unset — could silently fail in production
- `EMAIL_WEBHOOK_SECRET` is optional — inbound email endpoint is unauthenticated without it

---

## Architecture Assessment

### Data Flow Integrity
```
Collection → Storage → AI Analysis → Human Review → Reporting
  (agent)    (raw_*)   (daily_entries)  (confirmed)   (monthly)
```

- Raw data is immutable (INSERT only, enforced by PostgreSQL triggers)
- Entry revisions tracked in separate tables (`DailyEntryRevision`, `ManualEntryRevision`)
- Period locks prevent changes to closed months (SOX compliance)
- Date-aware authorization determines per-entry capitalization eligibility
- Post-sync auto-generation ensures entries are created promptly after data arrives

### AI System
- **Primary**: Local LLM (qwen/qwen3-32b) via OpenAI-compatible API — zero marginal cost
- **Fallback**: Anthropic Haiku — automatic on failure
- **Circuit breaker**: 3-state (normal/skip/probe) with 30min cooldown
- **Observability**: All calls logged to `model_events` table, admin health dashboard
- **Known issue**: GPT-OSS crashes on specific inputs (Jan 22) — circuit breaker handles it

### Auth System
| Context | Method | Status |
|---------|--------|--------|
| Web UI | NextAuth + Azure AD SSO | Working |
| Agent API | SHA-256 hashed Bearer tokens | Working |
| Email actions | JWT-signed URLs (72h) | Working |
| Dev bypass | CredentialsProvider | Working |

### Agent System
| Feature | Status |
|---------|--------|
| systemd timer (sync every 2h) | Working |
| Persistent timer (survives reboot) | Working |
| Linger (survives logout) | Working |
| Post-sync server generation | Working |
| Multi-developer support | Working (2 devs) |

---

## Test Coverage Analysis

| Area | Files | Cases | Coverage |
|------|-------|-------|----------|
| Parsers (agent) | 2 | 39 | Git log, JSONL parsing |
| Validations (web) | 2 | ~40 | Sync payload, project schema |
| Auth & API keys | 2 | ~30 | Key generation, hashing |
| AI prompts | 1 | ~25 | Prompt construction, edge cases |
| Email system | 2 | ~30 | JWT tokens, email templates |
| Active time | 1 | ~20 | Gap detection, time calculation |
| Cross-validation | 1 | ~15 | Anomaly detection |
| Export | 1 | ~15 | CSV/JSON formatting |
| Period locks | 1 | ~15 | Lock state transitions |
| Reports | 2 | ~20 | Query building, summary generation |
| Other | 5 | ~62 | Config, utilities, work type classification |

### Not Tested
- API route handlers (integration tests)
- UI components (React Testing Library)
- Email delivery (end-to-end)
- Circuit breaker state transitions
- Timezone day boundary edge cases (DST transitions)

---

## Environment Variables (24 total)

| Category | Variables | Required |
|----------|-----------|----------|
| Database | `DATABASE_URL` | Yes |
| Runtime | `NODE_ENV` | Yes |
| Auth | `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `DEV_AUTH_BYPASS` | Yes |
| Azure AD | `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID` | Prod only |
| AI | `ANTHROPIC_API_KEY`, `AI_LOCAL_URL`, `AI_LOCAL_MODEL`, `AI_LOCAL_ENABLED`, `AI_FALLBACK_MODEL` | Mixed |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `EMAIL_FROM`, `EMAIL_JWT_SECRET`, `EMAIL_WEBHOOK_SECRET` | Email feature |
| Timezone | `CAP_TIMEZONE` | No (defaults to America/New_York) |

**Missing from `.env.example`**: `CAP_TIMEZONE`, `EMAIL_WEBHOOK_SECRET`, `EMAIL_JWT_SECRET`

---

## Most Actively Changed Files (last 30 commits)

| Changes | File | Notes |
|---------|------|-------|
| 9 | `web/prisma/schema.prisma` | Schema evolution |
| 8 | `web/src/lib/jobs/generate-daily-entries.ts` | Core pipeline |
| 8 | `web/src/lib/actions/project-actions.ts` | Project lifecycle |
| 8 | `web/src/components/review/entry-card.tsx` | Review UX |
| 7 | `web/src/lib/ai/prompts.ts` | AI tuning |
| 7 | `web/src/app/(authenticated)/review/page.tsx` | Review page |
| 6 | `web/src/app/api/agent/sync/route.ts` | Sync endpoint |
| 6 | `agent/src/commands/sync.ts` | Agent sync |

---

## Recommendations

### Immediate
1. **Implement phaseEffective** — Manager-authoritative phase override (plan exists in `.claude/plans/`)
2. **Add CI workflow** — GitHub Actions for test + build on PR
3. **Require EMAIL_WEBHOOK_SECRET in production** — fail fast if email features enabled without it

### Short-term (v1.1)
1. **Wire up phase change email** — `buildPhaseChangeEmail()` exists but isn't called
2. **Add `CAP_TIMEZONE` to .env.example** — used in multiple places but undocumented
3. **Require SMTP_HOST in production** — fail fast instead of silent localhost fallback
4. **Add runtime validation for JSON fields** — `dailyBreakdown` cast is unsafe

### Medium-term (v2.0)
1. **Integration tests for API routes** — most critical gap in test coverage
2. **Refactor large functions** — `generateEntriesForDate` (300+ lines) should be broken up
3. **Move hardcoded IPs to env-only** — remove `10.12.112.8` fallbacks from source
4. **Multi-admin approval** — reduce single-point-of-failure on approvals
5. **Set up reverse proxy** — nginx or caddy for production HTTPS

---

## Documentation Status

| Document | Status | Last Updated |
|----------|--------|-------------|
| ARCHITECTURE.md | Current | 2026-02-11 |
| CHANGELOG.md | Current | 2026-02-11 (v0.9.0) |
| DECISIONS.md | Current | 2026-02-11 (14 decisions) |
| KNOWN_ISSUES.md | Current | 2026-02-11 (7 active, 6 resolved) |
| ASSESSMENT.md | Current | 2026-02-11 (this document) |
| features/README.md | Current | 2026-02-11 |
| README.md | Current | 2026-02-09 (quick start + onboarding) |
| .env.example | Current | 2026-02-09 |
| services/*.md | Needs refresh | 2026-02-05 (pre-local-LLM) |
