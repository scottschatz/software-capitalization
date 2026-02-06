# Anthropic (Claude AI)

## Purpose
AI-powered daily entry generation — analyzes raw Claude Code sessions and git commits to produce time entry suggestions with hours estimates, project matching, and phase classification.

## Environment Variables
| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Anthropic API key for Claude access |

## Files Where Used
- `web/src/lib/ai/client.ts` — Anthropic client singleton
- `web/src/lib/ai/prompts.ts` — Prompt builder with ASC 350-40 context
- `web/src/lib/ai/generate-entries.ts` — Calls Claude Sonnet 4.5, parses JSON response
- `web/src/lib/jobs/generate-daily-entries.ts` — Orchestrates per-developer AI calls
- `web/src/app/api/email-reply/inbound/route.ts` — AI interprets email reply intent

## Model Used
- `claude-sonnet-4-5-20250929` (Claude Sonnet 4.5)
- `max_tokens: 2048`

## Official Docs
- [Anthropic API Docs](https://docs.anthropic.com/)
- [@anthropic-ai/sdk on npm](https://www.npmjs.com/package/@anthropic-ai/sdk)

## Rate Limits
- Standard API rate limits apply
- One AI call per developer per day (during entry generation)
- Additional calls for email reply interpretation (rare)

## Gotchas
- AI response may be wrapped in ```json code blocks — parser handles both formats
- Empty response or parse failure returns empty array (no entries created, no error thrown)
- Prompt includes all active projects for accurate project matching
