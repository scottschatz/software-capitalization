import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const sections = [
  {
    title: 'Overview',
    content: `This system tracks developer time for software capitalization under ASC 350-40 (Internal-Use Software)
and ASU 2025-06 (updated guidance on capitalization thresholds). It collects activity data from Claude Code
sessions, git repositories, and optional VS Code hooks, then uses AI to estimate active development hours
per project per day. Developers review and confirm estimates before they are included in reports.

The accounting department uses the confirmed hours data to determine dollar amounts, amortization schedules,
and general ledger entries. This system provides the defensible, auditable time tracking foundation.`,
  },
  {
    title: 'Data Collection',
    content: `Activity data is collected from three sources:

1. **Claude Code Sessions** — JSONL transcript files containing timestamped messages, tool invocations,
   and token usage. Each session is tied to a project directory path.

2. **Git Commits** — Commit metadata (hash, timestamp, message, file counts, insertions/deletions)
   collected via the agent CLI from monitored repositories.

3. **VS Code Hook Events** (optional) — Real-time tool-use events captured by Claude Code hooks,
   providing granular timestamps for gap-aware active time calculation.

All raw data is immutable — INSERT-only tables enforced by database triggers and Prisma middleware.
This ensures the original evidence cannot be altered after collection.`,
  },
  {
    title: 'Active Time Calculation',
    content: `Active development time is calculated using a gap-aware algorithm:

1. **Timestamped Events** — When sessions have per-day timestamp data (from dailyBreakdown), the system
   identifies periods of continuous activity by examining gaps between consecutive events.

2. **15-Minute Idle Threshold** — Gaps exceeding 15 minutes between events are treated as idle time and
   excluded from the active time calculation. This threshold was chosen to balance between:
   - Capturing legitimate thinking/reading time (shorter gaps)
   - Excluding breaks, meetings, and context switches (longer gaps)

3. **Wall Clock vs. Active Time** — The system tracks both total wall-clock duration and calculated
   active minutes, allowing auditors to assess the ratio.

4. **60% Fallback Heuristic** — For sessions without granular timestamp data (e.g., older sessions
   or those without hook events), a 60% active-time-to-wall-clock ratio is applied. This can be
   validated empirically using the analysis script: \`npx tsx scripts/analyze-active-time.ts\`

5. **Rounding** — Final hours are rounded to two decimal places. Net rounding bias across all entries
   can be measured with the active time analysis script.`,
  },
  {
    title: 'AI Hour Estimation',
    content: `An AI model analyzes each developer's daily activity to produce hour estimates per project:

1. **Input Context** — The AI receives: session metadata (duration, message counts, tool usage,
   user prompt samples), commit data (files changed, insertions/deletions), project mappings,
   and available active time calculations.

2. **Project Matching** — Sessions are matched to projects via Claude Code directory paths;
   commits are matched via repository paths. Unmatched activity is flagged for manual categorization.

3. **Model Selection** — A primary model is used by default, with automatic fallback to an
   alternative model if the primary fails. The model used is recorded on each entry for auditability.

4. **Adjustment Factor** — A per-developer multiplier (0.0–1.5) is applied to the AI's raw estimate
   to produce the final estimated hours. Factors above 1.25 require admin/manager authorization.
   Both the raw estimate and adjustment factor are preserved for audit review.

5. **Phase Classification** — The project's phase (Preliminary, Application Development,
   Post-Implementation) is determined from the project record, not the AI. The AI may suggest
   phase discrepancies (e.g., new feature work on a post-implementation project), which are flagged
   for human review.`,
  },
  {
    title: 'Confirmation & Approval',
    content: `Entries go through a confirmation workflow before inclusion in reports:

1. **Developer Confirmation** — Each developer reviews their daily entries, can adjust hours,
   override the phase classification, and edit the description. All changes from AI estimates
   are logged as revisions with field-level tracking.

2. **Confirmation Methods** — The system tracks how each entry was confirmed:
   - \`individual\` — Developer reviewed and confirmed a single entry
   - \`bulk\` — Developer confirmed all entries for a single day
   - \`bulk_range\` — Developer confirmed entries across multiple days
   This allows auditors to identify potential rubber-stamping patterns.

3. **Manager Approval** (optional) — Projects can require manager approval after developer
   confirmation. Managers cannot approve their own entries (segregation of duties).

4. **Conflict of Interest** — Phase change approvals enforce that the approver does not have
   entries on the affected project, preventing self-approval of capitalization decisions.`,
  },
  {
    title: 'Capitalization Criteria (ASC 350-40)',
    content: `Hours are classified as capitalizable only when ALL of the following conditions are met:

1. **Application Development Phase** — The project must be in the Application Development phase.
   Preliminary phase (research, feasibility, vendor evaluation) and Post-Implementation phase
   (maintenance, bug fixes, training) hours are expensed in the period incurred
   (ASC 350-40-25-2).

2. **Management Authorization** — Management must have authorized and committed to funding the
   project (ASU 2025-06). This is tracked as a boolean flag on each project record.

3. **Probable to Complete** — There must be an ongoing assessment that the project is probable
   to be completed and used as intended (ASU 2025-06). This is also tracked per project.

4. **Project Active** — The project must not be in a suspended or abandoned state. Suspended
   projects halt new entry generation; abandoned projects are permanently excluded.

If any condition is not met, hours are classified as expensed regardless of the work performed.`,
  },
  {
    title: 'Enhancement Projects',
    content: `When significant new functionality is added to a post-implementation project, it should be
tracked as a separate Enhancement Project under ASC 350-40:

- **Capitalizable Enhancement** — Adds functionality the software previously could not perform
- **Maintenance (Expensed)** — Fixes existing functionality or improves performance without new features

The AI flags potential enhancement work when it detects application-development-type activity on a
post-implementation project. Developers and managers decide whether to create a formal Enhancement
Project for separate capitalization tracking.`,
  },
  {
    title: 'Audit Trail',
    content: `The system maintains a comprehensive audit trail:

- **Entry Revisions** — Every change to a daily entry (hours, phase, description) is logged with
  the old value, new value, who made the change, when, and the authentication method used.

- **Project History** — All project field changes (phase, authorization status, etc.) are logged
  with timestamps and the responsible user.

- **Phase Change Requests** — Phase transitions require admin/manager approval and maintain a
  complete record of request, review, and approval/rejection with reasons.

- **Immutable Raw Data** — Original session transcripts, commit data, and hook events cannot
  be modified after ingestion.

- **Export Audit Fields** — CSV and Excel exports include: raw hours, adjustment factor,
  estimated hours, confirmed hours, AI model used, confirmation method, confirmer identity,
  confirmation timestamp, and revision count.`,
  },
  {
    title: 'Controls Summary',
    content: `| Control | Implementation |
|---|---|
| Segregation of duties | Developers confirm, managers approve; self-approval blocked |
| Role-based access | Phase changes and high adjustment factors require admin/manager |
| Reasonableness checks | Manual entries capped at 10h/entry and 12h/day total |
| Adjustment factor limits | Max 1.5x; >1.25x requires admin/manager authorization |
| Authorization gate | Capitalization requires documented management authorization |
| Bulk confirm tracking | Confirmation method recorded for audit pattern analysis |
| Immutable source data | Raw tables are INSERT-only with database triggers |
| Complete revision history | Field-level change tracking on all entries |
| Model transparency | AI model identity and fallback status recorded per entry |`,
  },
  {
    title: 'Validation Scripts',
    content: `Three analysis scripts are provided for empirical methodology validation:

1. **\`npx tsx scripts/analyze-active-time.ts\`** — Validates the 60% fallback heuristic by
   comparing actual active-time-to-wall-clock ratios across all sessions with timestamp data.
   Reports mean, median, standard deviation, and histogram distribution. Also measures net
   rounding bias.

2. **\`npx tsx scripts/analyze-idle-threshold.ts\`** — Documents the 15-minute idle threshold
   choice and shows the baseline active time data at that threshold. Notes that alternative
   thresholds would require re-processing raw JSONL files.

3. **\`npx tsx scripts/analyze-model-variance.ts\`** — Compares AI model performance by analyzing
   average raw hour estimates between primary and fallback models. Flags variance exceeding 10%.

These scripts should be run periodically (e.g., quarterly) to validate that methodology
assumptions remain appropriate as the dataset grows.`,
  },
]

export default function MethodologyPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Methodology</h1>
        <p className="text-muted-foreground">
          How developer hours are tracked, estimated, and classified for ASC 350-40 software capitalization.
        </p>
      </div>

      {sections.map((section) => (
        <Card key={section.title}>
          <CardHeader>
            <CardTitle>{section.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-line">
              {section.content.includes('|---|') ? (
                <MethodologyTable content={section.content} />
              ) : (
                section.content.split('\n\n').map((paragraph, i) => (
                  <p key={i} className="text-sm leading-relaxed text-muted-foreground">
                    {renderInlineFormatting(paragraph)}
                  </p>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">
            This methodology documentation is provided as a reference for auditors and accounting personnel.
            For questions about the capitalization treatment of specific hours, contact the accounting department.
            For questions about the time tracking system, contact the development team.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function renderInlineFormatting(text: string): React.ReactNode {
  // Split on **bold** and `code` patterns
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="text-foreground font-medium">{part.slice(2, -2)}</strong>
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-xs">{part.slice(1, -1)}</code>
    }
    return part
  })
}

function MethodologyTable({ content }: { content: string }) {
  const lines = content.trim().split('\n').filter((l) => !l.startsWith('|---'))
  const headers = lines[0]?.split('|').filter(Boolean).map((h) => h.trim()) ?? []
  const rows = lines.slice(1).map((line) => line.split('|').filter(Boolean).map((c) => c.trim()))

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            {headers.map((h, i) => (
              <th key={i} className="py-2 pr-4 text-left font-medium text-foreground">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="py-2 pr-4 text-muted-foreground">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
