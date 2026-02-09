'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronDown, ChevronRight, HelpCircle } from 'lucide-react'

export function ProjectsGuide() {
  const [open, setOpen] = useState(false)

  return (
    <Card className="border-dashed">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-6 py-4 text-left text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <HelpCircle className="h-4 w-4 shrink-0" />
        <span>How to manage projects</span>
        {open ? (
          <ChevronDown className="h-4 w-4 ml-auto shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 ml-auto shrink-0" />
        )}
      </button>

      {open && (
        <CardContent className="pt-0 pb-6 text-sm space-y-5 text-muted-foreground">
          {/* Overview */}
          <section>
            <h3 className="font-semibold text-foreground mb-1">Overview</h3>
            <p>
              Each row represents a software project whose developer time may be capitalized under
              ASC 350-40. The agent collects Claude Code sessions and git commits, matches them to
              projects, and generates daily time entries for review. Only <strong>monitored</strong>{' '}
              projects generate daily entries.
            </p>
          </section>

          {/* Creating projects */}
          <section>
            <h3 className="font-semibold text-foreground mb-1">Creating a project</h3>
            <p className="mb-2">
              Projects can be created two ways:
            </p>
            <ul className="list-disc ml-5 space-y-1">
              <li>
                <strong>Auto-discovered</strong> &mdash; When the agent runs{' '}
                <code className="bg-muted px-1 rounded text-xs">cap sync</code>, it scans your
                Claude Code data directory for project directories and registers them automatically.
                These show an &ldquo;auto&rdquo; badge in the Source column.
              </li>
              <li>
                <strong>Manually</strong> &mdash; Click <strong>New Project</strong> and fill in the
                details. You must add at least one git repository path or Claude Code path so the
                agent can match activity data.
              </li>
            </ul>
          </section>

          {/* Monitoring toggle */}
          <section>
            <h3 className="font-semibold text-foreground mb-1">Monitoring toggle</h3>
            <p>
              The toggle in the <strong>Monitored</strong> column controls whether the agent syncs
              data and generates daily entries for this project. Turn it off for personal projects,
              experiments, or anything you don&rsquo;t want tracked for capitalization. Turning monitoring
              off does <em>not</em> delete existing entries&mdash;it only stops new ones from being
              generated.
            </p>
          </section>

          {/* Phases */}
          <section>
            <h3 className="font-semibold text-foreground mb-1">Phases (ASC 350-40)</h3>
            <p className="mb-2">
              Every project moves through three phases. Only hours logged during{' '}
              <strong>Application Development</strong> are capitalizable:
            </p>
            <ul className="list-disc ml-5 space-y-1">
              <li>
                <strong>Preliminary</strong> &mdash; Conceptual design, evaluating alternatives,
                feasibility studies. Hours are <em>expensed</em>.
              </li>
              <li>
                <strong>Application Development</strong> &mdash; Active coding, testing, data
                conversion, installation. Hours are <em>capitalized</em>.
              </li>
              <li>
                <strong>Post-Implementation</strong> &mdash; Maintenance, bug fixes, training,
                ongoing operations. Hours are <em>expensed</em>.
              </li>
            </ul>
          </section>

          {/* Phase changes */}
          <section>
            <h3 className="font-semibold text-foreground mb-1">Changing phases</h3>
            <p className="mb-2">
              Phase changes are controlled, not automatic, because they have financial impact:
            </p>
            <ul className="list-disc ml-5 space-y-1">
              <li>
                <strong>Admins/managers</strong> can change phases directly from the project detail
                page using the &ldquo;Change Phase&rdquo; button. They set an effective date and
                reason. The change is logged in the project&rsquo;s History tab.
              </li>
              <li>
                <strong>Developers</strong> click &ldquo;Request Phase Change&rdquo; instead. This
                creates a pending request visible in the Phase Changes tab, which an admin/manager
                must approve.
              </li>
              <li>
                When moving to <strong>Post-Implementation</strong>, you&rsquo;ll be prompted for a
                go-live date. This marks when depreciation/amortization begins.
              </li>
            </ul>
            <p className="mt-2">
              Phase transitions are <em>never automatic</em>. The system records daily entries
              against whichever phase the project is in at the time. Retroactive phase changes
              affect how existing hours are classified in reports.
            </p>
          </section>

          {/* Enhancements */}
          <section>
            <h3 className="font-semibold text-foreground mb-1">Enhancement projects</h3>
            <p>
              When a project is in <strong>Post-Implementation</strong> and you begin significant
              new development work (not routine maintenance), create an{' '}
              <strong>Enhancement</strong> from the Enhancements tab on the project detail page.
              Each enhancement is tracked as its own capitalizable asset under ASC 350-40, with its
              own phase lifecycle starting at Application Development. This keeps ongoing maintenance
              (expensed) separate from new feature work (capitalizable).
            </p>
          </section>

          {/* Editing effects */}
          <section>
            <h3 className="font-semibold text-foreground mb-1">What happens when you edit a project</h3>
            <ul className="list-disc ml-5 space-y-1">
              <li>
                <strong>Name / description</strong> &mdash; Display-only changes. No impact on
                existing entries or reports.
              </li>
              <li>
                <strong>Status</strong> &mdash; Setting a project to <em>Paused</em> or{' '}
                <em>Completed</em> does not stop monitoring. To stop generating entries, toggle
                monitoring off.
              </li>
              <li>
                <strong>Management Authorized / Probable to Complete</strong> &mdash; These are
                accounting compliance flags (ASU 2025-06), not developer workflow gates. Developers
                confirm entries normally regardless of authorization status. In reports, only hours
                on or after the recorded authorization date are classified as capitalizable &mdash;
                hours before that date remain expensed. Once an admin records authorization with a
                date and evidence, reports reflect this automatically. Accounting makes the final
                capitalization determination using exported reports.
              </li>
              <li>
                <strong>Repos / Claude Paths</strong> &mdash; Adding or removing paths changes how
                the agent matches sessions and commits to this project. Existing entries are
                unaffected; only future syncs use the updated paths.
              </li>
              <li>
                <strong>Business Justification</strong> &mdash; Auditor-facing text used in the
                project narrative report. Keep it factual and current.
              </li>
            </ul>
          </section>

          {/* Column reference */}
          <section>
            <h3 className="font-semibold text-foreground mb-1">Column reference</h3>
            <ul className="list-disc ml-5 space-y-1">
              <li><strong>Phase</strong> &mdash; Current ASC 350-40 phase.</li>
              <li><strong>Status</strong> &mdash; Active, Paused, Completed, or Abandoned.</li>
              <li>
                <strong>Source</strong> &mdash; Data sources linked to this project (git repos,
                Claude paths). &ldquo;auto&rdquo; means the project was discovered by the agent.
              </li>
              <li>
                <strong>Monitored</strong> &mdash; Whether the agent generates daily entries for
                this project.
              </li>
              <li>
                <strong>Pending</strong> &mdash; Number of pending phase change requests awaiting
                admin/manager review.
              </li>
            </ul>
          </section>
        </CardContent>
      )}
    </Card>
  )
}
