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
    userPromptSamples?: string[]   // legacy — first 10 prompts
    activeWindow?: { first: string; last: string; minutes: number; wallClockMinutes?: number } | null
    userPrompts?: Array<{ time: string; text: string }>  // full timestamped transcript
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
  toolEvents?: Array<{
    toolName: string
    projectPath: string | null
    timestamp: Date
    filePath?: string
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

/** Build a concise summary of real-time tool events from hooks. */
function buildToolEventsSection(
  events: Array<{ toolName: string; projectPath: string | null; timestamp: Date; filePath?: string }>,
  formatLocalTime: (iso: string) => string,
): string {
  if (events.length === 0) return ''

  // Group by project path, then summarize
  const byProject = new Map<string, typeof events>()
  for (const e of events) {
    const key = e.projectPath ?? 'unknown'
    if (!byProject.has(key)) byProject.set(key, [])
    byProject.get(key)!.push(e)
  }

  const lines: string[] = [`## Real-Time Tool Events from Hooks (${events.length} events)`]
  lines.push(`Note: These are individual tool invocations captured in real-time via Claude Code hooks. They show exactly when the AI was actively executing code, reading files, or running commands — corroborating the session data above.`)

  for (const [project, projEvents] of byProject) {
    // Tool breakdown for this project
    const toolCounts: Record<string, number> = {}
    for (const e of projEvents) {
      toolCounts[e.toolName] = (toolCounts[e.toolName] || 0) + 1
    }
    const toolSummary = Object.entries(toolCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([name, count]) => `${name}:${count}`)
      .join(', ')

    const first = formatLocalTime(projEvents[0].timestamp.toISOString())
    const last = formatLocalTime(projEvents[projEvents.length - 1].timestamp.toISOString())

    lines.push(`- Project: ${project} | ${projEvents.length} events | ${first} – ${last} | ${toolSummary}`)
  }

  return lines.join('\n') + '\n\n'
}

export function buildDailyEntryPrompt(ctx: DailyActivityContext): string {
  const projectList = ctx.projects.map((p) => {
    const repos = p.repos.map((r) => r.repoPath).join(', ')
    const paths = p.claudePaths.map((c) => `${c.claudePath} → ${c.localPath}`).join(', ')
    return `- ${p.name} (ID: ${p.id}, phase: ${p.phase})${p.description ? `\n    Description: ${p.description}` : ''}\n    Repos: ${repos || 'none'}\n    Claude paths: ${paths || 'none'}`
  }).join('\n')

  // Compute aggregate stats across all sessions
  const totalDurationMin = ctx.sessions.reduce((sum, s) => sum + Math.round((s.durationSeconds ?? 0) / 60), 0)
  const totalMessages = ctx.sessions.reduce((sum, s) => sum + s.messageCount, 0)
  const totalToolUses = ctx.sessions.reduce((sum, s) => sum + s.toolUseCount, 0)
  const totalTokens = ctx.sessions.reduce((sum, s) => sum + s.totalInputTokens + s.totalOutputTokens, 0)
  const totalUserPrompts = ctx.sessions.reduce((sum, s) => sum + (s.userPromptCount ?? 0), 0)

  // Format a UTC ISO timestamp to a human-readable local time (e.g. "8:12 AM")
  const formatLocalTime = (iso: string): string => {
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: process.env.CAP_TIMEZONE ?? 'America/New_York',
        hour: 'numeric', minute: '2-digit', hour12: true,
      }).format(new Date(iso))
    } catch { return iso }
  }

  const sessionList = ctx.sessions.map((s) => {
    const dur = s.durationSeconds ? `${Math.round(s.durationSeconds / 60)}min` : 'unknown'
    const tokens = s.totalInputTokens + s.totalOutputTokens
    const lines = [`- Session ${s.sessionId.slice(0, 8)} | project: ${s.projectPath} | ${s.messageCount} msgs | ${s.toolUseCount} tools | ${tokens} tokens | ${s.model || 'unknown'}`]
    // Active time — gap-aware computation (only intervals <15min between messages count)
    if (s.activeWindow && s.activeWindow.minutes > 0) {
      const first = formatLocalTime(s.activeWindow.first)
      const last = formatLocalTime(s.activeWindow.last)
      const activeHrs = (s.activeWindow.minutes / 60).toFixed(1)
      const wallHrs = s.activeWindow.wallClockMinutes
        ? (s.activeWindow.wallClockMinutes / 60).toFixed(1)
        : null
      lines.push(`    **Active time: ${activeHrs}h** (gap-aware: only counts intervals <15min between messages)`)
      if (wallHrs && wallHrs !== activeHrs) {
        lines.push(`    Wall clock span: ${first} – ${last} (${wallHrs}h total span, includes breaks/idle)`)
      } else {
        lines.push(`    Time span: ${first} – ${last}`)
      }
    }
    if (s.toolBreakdown && Object.keys(s.toolBreakdown).length > 0) {
      const tools = Object.entries(s.toolBreakdown)
        .sort(([, a], [, b]) => b - a)
        .map(([name, count]) => `${name}:${count}`)
        .join(', ')
      lines.push(`    Tools used: ${tools}`)
    }
    if (s.filesReferenced.length > 0) {
      const files = s.filesReferenced.slice(0, 10).map(f => f.split('/').slice(-2).join('/')).join(', ')
      const more = s.filesReferenced.length > 10 ? ` (+${s.filesReferenced.length - 10} more)` : ''
      lines.push(`    Files touched: ${files}${more}`)
    }
    // Full timestamped conversation transcript — what the developer directed and when
    if (s.userPrompts && s.userPrompts.length > 0) {
      lines.push(`    Developer conversation transcript (${s.userPrompts.length} prompts):`)
      for (const p of s.userPrompts) {
        const time = formatLocalTime(p.time)
        lines.push(`      [${time}] "${p.text}"`)
      }
    } else if (s.userPromptSamples && s.userPromptSamples.length > 0) {
      // Legacy fallback for old data without timestamps
      lines.push(`    Developer said (${s.userPromptCount ?? s.userPromptSamples.length} prompts, samples):`)
      for (const prompt of s.userPromptSamples.slice(0, 8)) {
        lines.push(`      - "${prompt}"`)
      }
    }
    return lines.join('\n')
  }).join('\n')

  const totalInsertions = ctx.commits.reduce((sum, c) => sum + c.insertions, 0)
  const totalDeletions = ctx.commits.reduce((sum, c) => sum + c.deletions, 0)
  const totalFilesChanged = ctx.commits.reduce((sum, c) => sum + c.filesChanged, 0)

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
**Totals: ${ctx.sessions.length} session(s) | ${totalMessages} messages | ${totalToolUses} tool uses | ${totalUserPrompts} human prompts | ${totalTokens} tokens**
Note: Each session below includes "Active time" (gap-aware: only counting intervals <15min between messages, excluding breaks/idle time) and a full timestamped transcript of every human prompt. Use these to reconstruct what the developer was doing, when, and how engaged they were.
${sessionList || 'No sessions'}

## Git Commits (${ctx.date})
${ctx.commits.length > 0 ? `**Totals: ${ctx.commits.length} commit(s) | +${totalInsertions}/-${totalDeletions} in ${totalFilesChanged} files**` : ''}
${commitList || 'No commits'}

${buildToolEventsSection(ctx.toolEvents ?? [], formatLocalTime)}
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
   - **The "Active time" is the PRIMARY guide.** Each session shows a gap-aware "Active time" that only counts intervals where messages are <15 minutes apart (breaks/idle excluded). This is the best estimate of how long the developer + AI were continuously engaged. Your hour estimate should be **at or below** this number.
   - **Use the conversation transcript to refine further.** The timestamped prompts show exactly when the developer was at the keyboard. Look for:
     - **Gaps** between prompts (>15 min = break already excluded from active time)
     - **Frequency** of prompts (many prompts close together = actively engaged)
     - **Content** of prompts ("continue" = passive monitoring, count as ~1 min; detailed technical instructions = active directing, count as ~5 min)
   - **AI does most of the typing.** The developer directs (writes prompts), reviews AI output, and iterates. Between prompts, the AI is working autonomously — that's not human active time. The human portion is typically 30-50% of the "Active time".
   - **Practical heuristic**: Start with the "Active time" value (already excludes breaks). Multiply by ~0.4 to estimate human-active hours (reading AI output, thinking, writing prompts). Cross-check against prompt count (each prompt cycle ≈ 3-5 min of human time) and commits.
   - **Maximum reasonable workday is 8 hours.** Most days should be 2-5 hours total across all projects.
   - **Use commits for scope validation.** Commits confirm what was actually produced. ~20-40 minutes of human time per commit of moderate complexity.
   - Be conservative — overestimating is worse than underestimating for capitalization compliance.
3. **Summary**: Write a 1-2 sentence description of what was SPECIFICALLY done based on commit messages and tool activity. Reference actual features, components, or fixes by name (e.g., "Built reporting module with monthly capitalization reports and Excel export" not "Worked on the project"). Use commit messages as the primary source of truth for what was accomplished.
4. **Phase**: Start with the project's current phase, but override based on the actual work as described in the Phase Classification Guidance above. If the work is clearly feature development (adding new features, building new systems, substantial new code), use **application_development** regardless of the project's listed phase.
5. **Capitalizable**: true only if phase is "application_development".
6. **Reasoning**: Cite the specific evidence: number of sessions used, total duration, number of user prompts, number of commits, and lines changed. Reference specific commit messages that informed your summary.

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
