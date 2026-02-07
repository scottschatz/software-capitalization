import type { Project, RawSession, RawCommit } from '@/generated/prisma/client'

export interface DailyActivityContext {
  developer: { displayName: string; email: string }
  date: string
  projects: Array<{
    id: string
    name: string
    phase: string
    description: string | null
    repos: { repoPath: string }[]
    claudePaths: { claudePath: string; localPath: string }[]
  }>
  sessions: Array<{
    sessionId: string
    projectPath: string
    startedAt: Date
    endedAt: Date | null
    durationSeconds: number | null
    totalInputTokens: number
    totalOutputTokens: number
    messageCount: number
    toolUseCount: number
    model: string | null
    toolBreakdown: Record<string, number> | null
    filesReferenced: string[]
    firstUserPrompt: string | null
    userPromptCount: number | null
  }>
  commits: Array<{
    commitHash: string
    repoPath: string
    committedAt: Date
    message: string
    filesChanged: number
    insertions: number
    deletions: number
  }>
}

export interface AIEntryResult {
  projectId: string | null
  projectName: string
  summary: string
  hoursEstimate: number
  phase: string
  capitalizable: boolean
  confidence: number // 0-1
  reasoning: string
}

export function buildDailyEntryPrompt(ctx: DailyActivityContext): string {
  const projectList = ctx.projects.map((p) => {
    const repos = p.repos.map((r) => r.repoPath).join(', ')
    const paths = p.claudePaths.map((c) => `${c.claudePath} → ${c.localPath}`).join(', ')
    return `- ${p.name} (ID: ${p.id}, phase: ${p.phase})${p.description ? `\n    Description: ${p.description}` : ''}\n    Repos: ${repos || 'none'}\n    Claude paths: ${paths || 'none'}`
  }).join('\n')

  const sessionList = ctx.sessions.map((s) => {
    const dur = s.durationSeconds ? `${Math.round(s.durationSeconds / 60)}min` : 'unknown'
    const tokens = s.totalInputTokens + s.totalOutputTokens
    const lines = [`- Session ${s.sessionId.slice(0, 8)} | project: ${s.projectPath} | ${dur} | ${s.messageCount} msgs | ${s.toolUseCount} tools | ${tokens} tokens | ${s.model || 'unknown'}`]
    if (s.firstUserPrompt) {
      lines.push(`    First prompt: "${s.firstUserPrompt}"`)
    }
    if (s.toolBreakdown && Object.keys(s.toolBreakdown).length > 0) {
      const tools = Object.entries(s.toolBreakdown)
        .sort(([, a], [, b]) => b - a)
        .map(([name, count]) => `${name}:${count}`)
        .join(', ')
      lines.push(`    Tools used: ${tools}`)
    }
    if (s.filesReferenced.length > 0) {
      // Show up to 10 key files, truncated
      const files = s.filesReferenced.slice(0, 10).map(f => f.split('/').slice(-2).join('/')).join(', ')
      const more = s.filesReferenced.length > 10 ? ` (+${s.filesReferenced.length - 10} more)` : ''
      lines.push(`    Files touched: ${files}${more}`)
    }
    if (s.userPromptCount && s.userPromptCount > 1) {
      lines.push(`    User prompts: ${s.userPromptCount}`)
    }
    return lines.join('\n')
  }).join('\n')

  const commitList = ctx.commits.map((c) => {
    return `- ${c.commitHash.slice(0, 8)} | ${c.repoPath} | ${c.message} | +${c.insertions}/-${c.deletions} in ${c.filesChanged} files`
  }).join('\n')

  return `You are an AI assistant helping with software capitalization tracking under ASC 350-40.

## Context
Developer: ${ctx.developer.displayName} (${ctx.developer.email})
Date: ${ctx.date}

## Active Projects
${projectList || 'No projects configured'}

## Claude Code Sessions (${ctx.date})
${sessionList || 'No sessions'}

## Git Commits (${ctx.date})
${commitList || 'No commits'}

## ASC 350-40 Phase Rules
- **Preliminary**: Conceptual design, evaluating alternatives, determining technology. Hours are EXPENSED.
- **Application Development**: Active coding, testing, installation, data conversion, building new features, writing tests for new functionality, integrating new systems, substantial enhancements. Hours are CAPITALIZED.
- **Post-Implementation**: Training, maintenance, minor bug fixes for production issues, routine support, minor cosmetic tweaks. Hours are EXPENSED.

Only hours in the "Application Development" phase are capitalizable.

## Phase Classification Guidance
Almost all developer work should be classified as **application_development** (capitalizable). The only exceptions:

1. **Preliminary** — VERY RARE. Only if the session is purely research/evaluation with NO actual code written (e.g., reading docs, comparing frameworks, writing a design doc). If any code was written, it's application_development.

2. **Application Development** — THE DEFAULT. Use this for:
   - Building new features (obviously)
   - Bug fixes found DURING development (part of the dev cycle)
   - Refactoring during development
   - Writing tests
   - Integration work
   - Configuration and infrastructure for the project
   - Basically ALL coding work on a project that hasn't been formally released

3. **Post-Implementation** — Only if the project has been formally released/deployed to production AND the work is purely maintenance:
   - Minor bug fixes on released production software
   - Routine dependency updates
   - Config tweaks
   - NOTE: If significant NEW features are being added to a released project, that work should be classified as application_development — it likely represents a new development phase (Phase 2, 3, etc.)

**When in doubt, use application_development.** It's better to capitalize and have an auditor question it than to miss legitimate capitalizable hours.

## Instructions
Analyze the sessions and commits for ${ctx.date}. Group activity by project and generate one entry per project the developer worked on.

For each entry estimate:
1. **Project match**: Match sessions (by claude path) and commits (by repo path) to the correct project. If a session/commit doesn't match any project, use "Unmatched" as the project name.
2. **Hours**: Estimate active HUMAN development hours — the time the developer spent directing, reviewing, and working alongside the AI. Key considerations:
   - Session duration is wall-clock time; actual active time is typically 50-70% of that.
   - These are AI-assisted sessions: Claude Code does much of the heavy lifting (writing code, running tests, etc.). The developer's role is directing, reviewing, and iterating. A session with 1000+ lines of code but only 10 user prompts may represent 30-60 minutes of human effort, not hours.
   - Look at the user prompt count and first prompt to gauge human involvement.
   - High tool use counts with few user prompts suggest Claude was doing automated work (less human time).
   - Many user prompts suggest more back-and-forth iteration (more human time).
   - Be conservative — overestimating is worse than underestimating for capitalization compliance.
3. **Summary**: Write a 1-2 sentence description of what was done, based on commit messages and session context.
4. **Phase**: Start with the project's current phase, but override based on the actual work as described in the Phase Classification Guidance above. If the work is clearly feature development (adding new features, building new systems, substantial new code), use **application_development** regardless of the project's listed phase.
5. **Capitalizable**: true only if phase is "application_development".

Respond with a JSON array of entries:
\`\`\`json
[
  {
    "projectId": "uuid-or-null",
    "projectName": "Project Name",
    "summary": "Brief description of work done",
    "hoursEstimate": 2.5,
    "phase": "application_development",
    "capitalizable": true,
    "confidence": 0.85,
    "reasoning": "Why this estimate"
  }
]
\`\`\`

If there is no meaningful activity for the date, return an empty array: []`
}
