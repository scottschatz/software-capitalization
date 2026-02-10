# Project Audit Assessment

**Generated**: 2026-02-09
**Project**: Software Capitalization Tracker
**Repository**: github.com/scottschatz/software-capitalization (private)
**Branch**: main (5 commits ahead of origin)

---

## Project Overview

| Metric | Value |
|--------|-------|
| Type | Internal web app + CLI agent + MCP server |
| Tech Stack | Next.js 16 + PostgreSQL 16 + Prisma 7 + Local LLM + Anthropic Haiku |
| Source Files | 220 (.ts/.tsx) |
| Lines of Code | 84,612 |
| API Endpoints | 52 routes |
| Database Models | 26 |
| Test Cases | 311 (20 test files) |
| Contributors | 1 (scott.schatz) |
| Age | 5 days (first commit 2026-02-05) |
| Versions Released | 8 (0.1.0 → 0.8.0) |

---

## Production Readiness: 8/10

### Strengths
- **Audit compliance**: Immutable raw data (DB triggers), revision tracking, period locks (SOX)
- **Resilience**: Circuit breaker for local LLM, auto-fallback to Haiku, retry logic
- **Security**: Zod validation on all inputs, SHA-256 API key hashing, no SQL injection vectors
- **Test coverage**: 311 test cases across parsers, validations, auth, AI prompts, active time
- **Observability**: Model event logging, system health dashboard, data quality badges
- **Documentation**: Architecture, decisions, known issues, changelog all maintained

### Gaps
- **No CI/CD pipeline**: Tests run manually, no automated build/deploy
- **No reverse proxy**: App runs directly on dev machine (WSL2), not behind nginx/caddy
- **Single admin**: All approvals go through one person (scott.schatz)
- **1 unimplemented TODO**: Phase change approval email not wired up

---

## Code Quality Scan Results

### Issues by Severity

| Severity | Count | Details |
|----------|-------|---------|
| CRITICAL | 0 | — |
| HIGH | 0 | — |
| MEDIUM | 5 active | Phase change email, GPT-OSS crashes, hooks in VSCode, hardcoded IPs, SMTP localhost fallback |
| LOW | 3 active | Post-release phase enforcement, empty catches (intentional), console.log in CLI |

### Code Hygiene

| Category | Count | Status |
|----------|-------|--------|
| TODO/FIXME comments | 1 | `project-actions.ts:356` — phase change email |
| Hardcoded IPs | 5 | `10.12.112.8` in 2 production files + 3 scripts (env var fallback) |
| Large functions (>100 lines) | 7 | `generateEntriesForDate` (~300), `updateProject` (~150), `syncCommand` (~239), others |
| `any` types | 11 | All in scripts/test files, none in production code |
| ESLint disables | 0 | Clean |
| Empty catch blocks | 4 | All documented and intentional (graceful degradation) |
| Debug console.log | 0 | All console.log usage is intentional CLI output |

### Type Safety

- All API inputs validated with Zod schemas
- Prisma 7 provides full type safety for DB queries
- 1 concern: `dailyBreakdown` JSON field cast without runtime validation in `generate-daily-entries.ts`
- `any` usage confined to dev scripts only

### Security

- No hardcoded secrets in source code
- Auth on all routes (NextAuth session or Bearer token)
- `execFileSync` used instead of `execSync` (no shell injection)
- JWT email tokens expire after 72 hours
- Dev-only secret fallbacks properly guarded by `NODE_ENV` check
- SMTP defaults to `localhost` if `SMTP_HOST` unset — could silently fail in production

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

### AI System
- **Primary**: Local LLM (gpt-oss-20b) via OpenAI-compatible API — zero marginal cost
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

---

## Environment Variables (22 total)

| Category | Variables | Required |
|----------|-----------|----------|
| Database | `DATABASE_URL` | Yes |
| Auth | `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `DEV_AUTH_BYPASS` | Yes |
| Azure AD | `AZURE_AD_CLIENT_ID`, `AZURE_AD_CLIENT_SECRET`, `AZURE_AD_TENANT_ID` | Prod only |
| AI | `ANTHROPIC_API_KEY`, `AI_LOCAL_URL`, `AI_LOCAL_MODEL`, `AI_LOCAL_ENABLED`, `AI_FALLBACK_MODEL` | Mixed |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_SECURE`, `EMAIL_FROM`, `EMAIL_JWT_SECRET`, `EMAIL_WEBHOOK_SECRET` | Email feature |
| Timezone | `CAP_TIMEZONE` | No (defaults to America/New_York) |

**Missing from `.env.example`**: `CAP_TIMEZONE`, `EMAIL_WEBHOOK_SECRET`, `EMAIL_JWT_SECRET`

---

## Recommendations

### Immediate (before team onboarding)
1. **Set up reverse proxy** — nginx or caddy in front of the app for HTTPS
2. **Push to origin** — 5 commits ahead, team needs access
3. **Add CI workflow** — GitHub Actions for test + build on PR

### Short-term (v1.1)
1. **Wire up phase change email** — `buildPhaseChangeEmail()` exists but isn't called in `requestPhaseChange()`
2. **Add `CAP_TIMEZONE` to .env.example** — used in 3 places but undocumented
3. **Require SMTP_HOST in production** — fail fast instead of silent localhost fallback
4. **Add runtime validation for JSON fields** — `dailyBreakdown` cast is unsafe

### Medium-term (v2.0)
1. **Integration tests for API routes** — most critical gap in test coverage
2. **Refactor large functions** — `generateEntriesForDate` (300+ lines) should be broken up
3. **Move hardcoded IPs to env-only** — remove `10.12.112.8` fallbacks from source
4. **Multi-admin approval** — reduce single-point-of-failure on approvals

---

## Documentation Status

| Document | Status | Last Updated |
|----------|--------|-------------|
| ARCHITECTURE.md | Current | 2026-02-09 |
| CHANGELOG.md | Current | 2026-02-09 (v0.8.0) |
| DECISIONS.md | Current | 2026-02-09 (12 decisions) |
| KNOWN_ISSUES.md | Current | 2026-02-09 (5 active, 6 resolved) |
| ASSESSMENT.md | Current | 2026-02-09 (this document) |
| features/README.md | Current | 2026-02-09 |
| README.md | Current | 2026-02-09 (quick start + onboarding) |
| .env.example | Current | 2026-02-09 |
| services/*.md | Needs refresh | 2026-02-05 (pre-local-LLM) |
