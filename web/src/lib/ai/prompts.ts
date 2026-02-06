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
    return `- Session ${s.sessionId.slice(0, 8)} | project: ${s.projectPath} | ${dur} | ${s.messageCount} msgs | ${s.toolUseCount} tools | ${tokens} tokens | ${s.model || 'unknown'}`
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
- **Application Development**: Active coding, testing, installation, data conversion. Hours are CAPITALIZED.
- **Post-Implementation**: Training, maintenance, bug fixes, minor enhancements. Hours are EXPENSED.

Only hours in the "Application Development" phase are capitalizable. The phase is determined by the PROJECT's current phase, not the nature of the individual task.

## Instructions
Analyze the sessions and commits for ${ctx.date}. Group activity by project and generate one entry per project the developer worked on.

For each entry estimate:
1. **Project match**: Match sessions (by claude path) and commits (by repo path) to the correct project. If a session/commit doesn't match any project, use "Unmatched" as the project name.
2. **Hours**: Estimate active development hours. Session duration is wall-clock time; actual active time is typically 60-80% of that. A session with many messages and tool uses suggests higher engagement. Multiple short sessions may overlap or indicate context switching. Be conservative — overestimating is worse than underestimating.
3. **Summary**: Write a 1-2 sentence description of what was done, based on commit messages and session context.
4. **Phase**: Use the project's current phase.
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
