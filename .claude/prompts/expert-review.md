# Expert Review Prompt

Use this prompt to generate a multi-wave improvement plan from three expert perspectives (UX, Finance/Audit, AI/LLM).

## Prompt

> Call two agents, front end usability specialist and a finance/accounting audit specialist and ask them for input. Don't perform anything, synthesize their feedback in the context of what we are building, our stated goals, my previous feedback and provide suggestions. Also call an agent to review our AI feedback mechanism and provide feedback on that as well. Given that we have local LLM ability here, should we have some other LLM calls to perform pre or post validation for us, synthesize reports, do something cool in realtime or on a cron? Think hard about what would be useful and special.

## Notes

- This generates the plan at `.claude/plans/sparkling-herding-aho.md`
- Waves 1-2 were implemented in the first pass (audit blockers + quick wins)
- Re-run this prompt periodically as the codebase evolves to get fresh expert input
