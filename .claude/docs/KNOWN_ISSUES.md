# Known Issues

## Active Issues

### [MEDIUM] Phase change request doesn't send approval email
- **Location**: `web/src/lib/actions/project-actions.ts:336`
- **Symptom**: When a phase change is requested, no email notification is sent to the approver
- **Workaround**: Approver must check the web UI manually for pending phase change requests
- **Proper Fix**: Wire up `buildPhaseChangeEmail()` from `web/src/lib/email/templates.ts` in the `requestPhaseChange()` function
- **Added**: 2026-02-05

### [MEDIUM] Claude Code hooks don't fire in VSCode Native UI mode
- **Location**: External — Claude Code VSCode extension
- **Symptom**: PostToolUse and Stop hooks in `~/.claude/settings.json` are silently ignored when using VSCode's Native UI panel. Debug logs show `Found 0 hook matchers` in VSCode vs `Found 2` in CLI.
- **Workaround**: Enable terminal mode in VSCode: Settings → `claudeCode.useTerminal` → true. This runs the full CLI inside VSCode where hooks work correctly.
- **Proper Fix**: Upstream fix needed from Anthropic. Tracked in [#8985](https://github.com/anthropics/claude-code/issues/8985) (39+ upvotes), [#16114](https://github.com/anthropics/claude-code/issues/16114).
- **Impact**: Without hooks, the system still works — agent sync provides session-level data. Hooks only add tool-level timing granularity.
- **Added**: 2026-02-07

### [MEDIUM] GPT-OSS crashes on specific inputs (Jan 22)
- **Location**: `web/src/lib/ai/client.ts` — `callLocalModel()`
- **Symptom**: Local model `gpt-oss-20b` consistently crashes with "Exit code: null" or "StopIteration" on Jan 22 input. Not a context size issue (prompt is only ~3674 tokens). Likely a model bug triggered by specific content.
- **Workaround**: Circuit breaker detects the crash and falls back to Haiku automatically. Entry is generated successfully via fallback.
- **Proper Fix**: Upstream model fix or switching to a more stable local model. Could also add input sanitization if specific content patterns are identified.
- **Added**: 2026-02-09

### [MEDIUM] No post-release phase enforcement
- **Location**: `web/src/lib/ai/prompts.ts`, project UI
- **Symptom**: When a released project has significant new feature work, the system doesn't force creation of a new project phase (Phase 2, 3, etc.)
- **Workaround**: Manually create new project phases for post-release feature development
- **Proper Fix**: Detect new feature work on released projects during entry generation and prompt/require phase creation
- **Added**: 2026-02-06

### [LOW] Empty catch blocks in parsers
- **Location**: `agent/src/parsers/git-log.ts`, `agent/src/parsers/claude-jsonl.ts`, `agent/src/parsers/claude-scanner.ts`
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

---

## Resolved Issues

### [MEDIUM] Hook scripts silently fail — jq not available
- **Location**: `~/.cap-agent/hooks/post-tool-use.sh`, `stop.sh`
- **Symptom**: Hook scripts used `jq` for JSON parsing, which isn't installed on all systems (including WSL). Scripts exited silently with no events recorded.
- **Fix**: Replaced all `jq` calls with `python3` (universally available). Updated both hook scripts and the `generatePostToolUseScript()`/`generateStopScript()` generators in `agent/src/commands/hooks.ts`.
- **Resolved**: 2026-02-07

### [LOW] No test suite
- **Location**: Project-wide
- **Symptom**: No unit or integration tests existed
- **Fix**: Added Vitest with 114 tests (91 web + 23 agent) in Phase 4
- **Resolved**: 2026-02-05

### [LOW] Reports and Team pages are placeholder stubs
- **Location**: `web/src/app/(authenticated)/reports/page.tsx`, `web/src/app/(authenticated)/team/page.tsx`
- **Symptom**: Pages showed "coming soon" placeholder content
- **Fix**: Implemented in Phase 3 (Reports) and Phase 3.5 (Team Management)
- **Resolved**: 2026-02-05

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
