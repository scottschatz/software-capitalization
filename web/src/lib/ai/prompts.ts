import type { Project, RawSession, RawCommit } from '@/generated/prisma/client'

export interface DailyActivityContext {
  developer: { displayName: string; email: string }
  date: string
  projects: Array<{
    id: string
    name: string
    phase: string
    description: string | null
    goLiveDate?: Date | null
    parentProjectId?: string | null
    enhancementLabel?: string | null
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
  confidence: number // 0-1
  reasoning: string
  // AI's suggestion only — server uses the project's configured phase for actual
  // phase/capitalizability determination. Kept for enhancement detection: if AI
  // suggests "application_development" but project is post_implementation, that
  // signals potential enhancement work.
  phaseSuggestion?: string
  enhancementSuggested?: boolean  // true if post-impl project has new feature work
  enhancementReason?: string      // why enhancement was suggested
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

export function buildDailyEntryPrompt(ctx: DailyActivityContext, historicalStats?: {
  avgHoursPerDay: number
  avgProjectsPerDay: number
  confirmedDays: number
  periodDays: number
}): string {
  const projectList = ctx.projects.map((p) => {
    const repos = p.repos.map((r) => r.repoPath).join(', ')
    const paths = p.claudePaths.map((c) => `${c.claudePath} → ${c.localPath}`).join(', ')
    const goLive = p.goLiveDate ? `\n    Go-live date: ${new Date(p.goLiveDate).toISOString().split('T')[0]}` : ''
    const enhancement = p.parentProjectId ? `\n    Enhancement project (parent ID: ${p.parentProjectId})` : ''
    return `- ${p.name} (ID: ${p.id}, phase: ${p.phase})${p.description ? `\n    Description: ${p.description}` : ''}${goLive}${enhancement}\n    Repos: ${repos || 'none'}\n    Claude paths: ${paths || 'none'}`
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

  // Track remaining character budget for user prompt content across all sessions
  const PROMPT_CHAR_BUDGET = 8000
  let promptCharsRemaining = PROMPT_CHAR_BUDGET

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
    // Truncated if cumulative prompt text exceeds the character budget
    if (s.userPrompts && s.userPrompts.length > 0) {
      if (promptCharsRemaining <= 0) {
        lines.push(`    Developer conversation transcript (${s.userPrompts.length} prompts): (truncated — ${s.userPrompts.length} prompts omitted, prompt budget exhausted)`)
      } else {
        lines.push(`    Developer conversation transcript (${s.userPrompts.length} prompts):`)
        let promptsIncluded = 0
        for (const p of s.userPrompts) {
          const promptText = p.text
          if (promptCharsRemaining <= 0) {
            const omitted = s.userPrompts.length - promptsIncluded
            lines.push(`      (truncated — ${omitted} more prompts omitted)`)
            break
          }
          const time = formatLocalTime(p.time)
          if (promptText.length > promptCharsRemaining) {
            // Include a truncated version of this prompt
            lines.push(`      [${time}] "${promptText.slice(0, promptCharsRemaining)}..." (truncated)`)
            promptCharsRemaining = 0
            promptsIncluded++
            const omitted = s.userPrompts.length - promptsIncluded
            if (omitted > 0) {
              lines.push(`      (truncated — ${omitted} more prompts omitted)`)
            }
            break
          }
          lines.push(`      [${time}] "${promptText}"`)
          promptCharsRemaining -= promptText.length
          promptsIncluded++
        }
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

  // Pre-group commits by matched project so models don't have to cross-reference repo paths
  const commitsByProject = new Map<string, { projectName: string; projectId: string | null; commits: typeof ctx.commits }>()
  for (const c of ctx.commits) {
    const matchedProject = ctx.projects.find((p) => p.repos.some((r) => c.repoPath === r.repoPath))
    const key = matchedProject ? matchedProject.id : `unmatched:${c.repoPath}`
    if (!commitsByProject.has(key)) {
      commitsByProject.set(key, {
        projectName: matchedProject ? matchedProject.name : `Unmatched: ${c.repoPath.split('/').pop() ?? c.repoPath}`,
        projectId: matchedProject ? matchedProject.id : null,
        commits: [],
      })
    }
    commitsByProject.get(key)!.commits.push(c)
  }

  const commitList = Array.from(commitsByProject.entries()).map(([, group]) => {
    const ins = group.commits.reduce((s, c) => s + c.insertions, 0)
    const del = group.commits.reduce((s, c) => s + c.deletions, 0)
    const files = group.commits.reduce((s, c) => s + c.filesChanged, 0)
    const lines = [`### ${group.projectName}${group.projectId ? ` (ID: ${group.projectId})` : ''} — ${group.commits.length} commit(s), +${ins}/-${del} in ${files} files`]
    for (const c of group.commits) {
      lines.push(`- ${c.commitHash.slice(0, 8)} | ${c.message} | +${c.insertions}/-${c.deletions} in ${c.filesChanged} files`)
    }
    return lines.join('\n')
  }).join('\n\n')

  // Build historical context section if stats are available
  const historicalSection = historicalStats && historicalStats.confirmedDays > 0
    ? `## Historical Context (last ${historicalStats.periodDays} days)
This developer typically works ${historicalStats.avgHoursPerDay.toFixed(1)} hours/day across ${historicalStats.avgProjectsPerDay.toFixed(1)} projects/day.
${historicalStats.confirmedDays} of the last ${historicalStats.periodDays} days had confirmed activity.
Use this as a baseline — significant deviations should be noted in the confidence score.

`
    : ''

  return `You are an AI assistant helping with software capitalization tracking under ASC 350-40.

${historicalSection}## Context
Developer: ${ctx.developer.displayName} (${ctx.developer.email})
Date: ${ctx.date}

## Active Projects
${projectList || 'No projects configured'}

## Claude Code Sessions (${ctx.date})
**Totals: ${ctx.sessions.length} session(s) | ${totalMessages} messages | ${totalToolUses} tool uses | ${totalUserPrompts} human prompts | ${totalTokens} tokens**
Note: Each session below includes "Active time" (gap-aware: only counting intervals <15min between messages, excluding breaks/idle time) and a full timestamped transcript of every human prompt. Use these to reconstruct what the developer was doing, when, and how engaged they were.
${sessionList || 'No sessions'}

## Git Commits by Project (${ctx.date})
${ctx.commits.length > 0 ? `**Totals: ${ctx.commits.length} commit(s) | +${totalInsertions}/-${totalDeletions} in ${totalFilesChanged} files across ${commitsByProject.size} project(s)**\nIMPORTANT: Commits below are already grouped by project. Create a SEPARATE entry for EACH project group that has commits.` : ''}
${commitList || 'No commits'}

${buildToolEventsSection(ctx.toolEvents ?? [], formatLocalTime)}
## Instructions
Analyze the sessions and commits for ${ctx.date}. Generate **one entry per project** that has activity. The commits section above is already grouped by project — create an entry for EACH project group (do NOT merge different projects into one entry).

**Your job**: Match activity to projects, estimate hours, summarize work, provide reasoning.
**NOT your job**: Phase classification and capitalizability are determined by the server from project configuration. You do NOT need to decide these.

For each entry:
1. **Project match**: Match sessions (by claude path) and commits (by repo path) to the correct project. For unmatched repos, set projectId to null and use the repo name as projectName.
2. **Hours**: Estimate active HUMAN development hours — the time the developer was actively engaged (reading output, writing prompts, reviewing code, testing). Do NOT apply any multiplier or discount factor; the server applies an attention ratio separately.
   - **"Active time" is the PRIMARY input.** Each session shows gap-aware active time (only intervals <15min between messages). Use this as your starting point.
   - **Conversation transcript refines further.** Frequent, detailed prompts = fully engaged for the session duration. Sparse "continue" prompts = less active engagement — reduce proportionally.
   - **Cross-check against commits**: Use commit count and complexity as a sanity check on the session-based estimate.
   - **Automated/scheduled commits = 0 hours.** If a commit has a formulaic message (e.g., "Update rankings YYYY-MM-DD HH:MM"), was committed at an unusual hour (e.g., 6:15 AM), and has symmetrical or trivial changes (e.g., +8/-8), it's an automated job — assign **0 hours**.
   - **Commit-only projects** (no matching Claude session): Be CONSERVATIVE. Large line counts do NOT equal long hours — generated code, migrations, schema dumps, boilerplate scaffolding, and vendor files can add thousands of lines in minutes. For commit-only projects, rarely exceed 1h unless multiple complex, hand-crafted commits across many files demonstrate sustained manual effort. If a matching session exists but shows very low active time (< 5 min) despite large commits, trust the session data — the commits were likely quick pushes.
3. **Summary**: 1-2 sentences of what was SPECIFICALLY done. Reference actual features, components, or fixes by name. Use commit messages as the primary source.
4. **Reasoning**: Cite evidence: sessions, active time, prompt count, commits, lines changed. Reference specific commit messages.
5. **Enhancement detection** (only for post_implementation projects with a go-live date): If the work looks like **significant new feature development** rather than maintenance, set \`enhancementSuggested: true\` and explain in \`enhancementReason\`.

Respond with a JSON array of entries:
\`\`\`json
[
  {
    "projectId": "uuid-or-null",
    "projectName": "Project Name",
    "summary": "Brief description of work done",
    "hoursEstimate": 2.5,
    "confidence": 0.85,  // see calibration rubric below
    "reasoning": "Why this estimate",
    "enhancementSuggested": false,
    "enhancementReason": null
  }
]
\`\`\`

Confidence calibration:
- 0.90-1.0: Active time data available with matching commits and clear project mapping
- 0.75-0.89: Sessions present but missing commits, or commits without matching sessions
- 0.60-0.74: Ambiguous project mapping or limited activity signals
- Below 0.60: Very uncertain — minimal data, possible misattribution

If there is no meaningful activity for the date, return an empty array: []`
}
