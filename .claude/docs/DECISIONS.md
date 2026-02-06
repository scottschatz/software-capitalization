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

## Immutable Raw Data via PostgreSQL Triggers
- **Date**: 2026-02-05
- **Status**: Accepted

### Context
Raw session and commit data must be immutable for audit compliance (ASC 350-40).

### Decision
PostgreSQL `BEFORE UPDATE OR DELETE` triggers on raw_sessions, raw_commits, raw_vscode_activity tables that RAISE EXCEPTION.

### Alternatives
1. **Prisma middleware (`$use`)**: Removed in Prisma 7
2. **Application-level checks only**: Bypassable via direct DB access

### Consequences
- **Positive**: Database-level enforcement, cannot be bypassed by application bugs
- **Negative**: Must use raw SQL for triggers, not captured in Prisma schema

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

## When to Record

Record decisions for:
- Framework/library choices
- Data model designs
- Infrastructure decisions
- Non-obvious tradeoffs
