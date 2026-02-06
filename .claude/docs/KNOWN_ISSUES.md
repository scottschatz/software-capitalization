# Known Issues

## Active Issues

### [MEDIUM] Phase change request doesn't send approval email
- **Location**: `web/src/lib/actions/project-actions.ts:336`
- **Symptom**: When a phase change is requested, no email notification is sent to the approver
- **Workaround**: Approver must check the web UI manually for pending phase change requests
- **Proper Fix**: Wire up `buildPhaseChangeEmail()` from `web/src/lib/email/templates.ts` in the `requestPhaseChange()` function
- **Added**: 2026-02-05

### [LOW] Empty catch blocks in parsers
- **Location**: `agent/src/parsers/git-log.ts:50,64`, `agent/src/parsers/claude-jsonl.ts:68`, `agent/src/parsers/claude-scanner.ts:52,75`
- **Symptom**: Errors silently swallowed during file parsing (by design for graceful degradation)
- **Workaround**: None needed — intentional for robustness
- **Proper Fix**: Add optional debug logging behind a `--verbose` flag
- **Added**: 2026-02-05

### [LOW] Console.log statements in agent CLI
- **Location**: `agent/src/commands/sync.ts`, `agent/src/commands/status.ts`, `agent/src/commands/init.ts`
- **Symptom**: CLI output uses raw console.log — acceptable for a CLI tool but could be more structured
- **Workaround**: N/A (expected for CLI tools)
- **Proper Fix**: Consider a structured logger if agent grows more complex
- **Added**: 2026-02-05

### [LOW] Reports and Team pages are placeholder stubs
- **Location**: `web/src/app/(authenticated)/reports/page.tsx`, `web/src/app/(authenticated)/team/page.tsx`
- **Symptom**: Pages show "coming soon" placeholder content
- **Workaround**: None
- **Proper Fix**: Implement Phase 3 (Reports & Team Management)
- **Added**: 2026-02-05

### [LOW] No test suite
- **Location**: Project-wide
- **Symptom**: No unit or integration tests exist yet
- **Workaround**: Manual testing via dev server
- **Proper Fix**: Set up Vitest + write tests for core business logic
- **Added**: 2026-02-05

---

## Resolved Issues

### [HIGH] Git parser shell injection via `|||` separator
- **Location**: `agent/src/parsers/git-log.ts`
- **Symptom**: `execSync` interpreted `|||` as shell pipe operators
- **Fix**: Switched to `execFileSync` which bypasses shell
- **Resolved**: 2026-02-05

### [HIGH] Git parser numstat attribution incorrect
- **Location**: `agent/src/parsers/git-log.ts`
- **Symptom**: Using end marker caused numstat lines to be attributed to the wrong commit
- **Fix**: Switched to start marker `<<<COMMIT>>>` so numstat lines fall within each commit's chunk
- **Resolved**: 2026-02-05

### [MEDIUM] Prisma 7 Date type mismatch in UI components
- **Location**: `web/src/components/settings/agent-keys-manager.tsx`
- **Symptom**: Type error — Prisma returns `Date` objects but component expected `string`
- **Fix**: Changed interface to `Date | string` union type
- **Resolved**: 2026-02-05

---

## Severity Guide

| Level | Description |
|-------|-------------|
| CRITICAL | System unusable, data loss, security |
| HIGH | Major feature broken, no workaround |
| MEDIUM | Feature impaired, workaround exists |
| LOW | Minor inconvenience |
