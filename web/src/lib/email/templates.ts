import { createActionToken } from './tokens'

const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000'

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

interface DailyReviewEmailData {
  developerName: string
  developerId: string
  date: string
  entries: Array<{
    projectName: string
    hours: number
    phase: string
    description: string
    capitalizable: boolean
  }>
}

export function buildDailyReviewEmail(data: DailyReviewEmailData): {
  subject: string
  html: string
} {
  const totalHours = data.entries.reduce((sum, e) => sum + e.hours, 0)
  const capHours = data.entries.filter((e) => e.capitalizable).reduce((sum, e) => sum + e.hours, 0)
  const expHours = totalHours - capHours

  const approveToken = createActionToken({
    developerId: data.developerId,
    date: data.date,
    action: 'approve_all',
  })

  const approveUrl = `${BASE_URL}/api/email-reply/approve?token=${approveToken}`
  const reviewUrl = `${BASE_URL}/review/${data.date}`

  const entryRows = data.entries
    .map(
      (e) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(e.projectName)}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${e.hours}h</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">
        ${e.capitalizable ? '<span style="color:#16a34a;">Capitalized</span>' : '<span style="color:#6b7280;">Expensed</span>'}
      </td>
      <td style="padding:8px;border-bottom:1px solid #eee;">${escapeHtml(e.description)}</td>
    </tr>`
    )
    .join('')

  return {
    subject: `Cap Tracker: Review your hours for ${data.date} (${totalHours.toFixed(1)}h)`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#1a1a1a;">Daily Activity Summary</h2>
        <p>Hi ${escapeHtml(data.developerName)},</p>
        <p>Here's your development activity for <strong>${escapeHtml(data.date)}</strong>:</p>

        <div style="background:#f8f9fa;padding:12px;border-radius:8px;margin:16px 0;">
          <span style="font-size:20px;font-weight:bold;">${totalHours.toFixed(1)}h total</span>
          &nbsp;·&nbsp;
          <span style="color:#16a34a;font-weight:bold;">${capHours.toFixed(1)}h capitalizable</span>
          &nbsp;·&nbsp;
          <span style="color:#6b7280;">${expHours.toFixed(1)}h expensed</span>
        </div>

        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#f8f9fa;">
              <th style="padding:8px;text-align:left;">Project</th>
              <th style="padding:8px;text-align:center;">Hours</th>
              <th style="padding:8px;text-align:center;">Type</th>
              <th style="padding:8px;text-align:left;">Description</th>
            </tr>
          </thead>
          <tbody>
            ${entryRows}
          </tbody>
        </table>

        <div style="margin:24px 0;text-align:center;">
          <a href="${approveUrl}"
             style="display:inline-block;padding:12px 24px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-right:8px;">
            Approve All As-Is
          </a>
          <a href="${reviewUrl}"
             style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">
            Review & Edit
          </a>
        </div>

        <p style="color:#6b7280;font-size:12px;">
          These buttons expire in 72 hours. If you need to make changes after that, log in to
          the <a href="${reviewUrl}">review page</a> directly.
        </p>
      </div>
    `,
  }
}

interface PhaseChangeEmailData {
  adminName: string
  adminId: string
  projectName: string
  projectId: string
  currentPhase: string
  requestedPhase: string
  requesterId: string
  requesterName: string
  reason: string
  requestId: string
}

export function buildPhaseChangeEmail(data: PhaseChangeEmailData): {
  subject: string
  html: string
} {
  const approveToken = createActionToken({
    developerId: data.adminId,
    date: new Date().toISOString(),
    action: 'approve_phase_change',
    targetId: data.requestId,
  })
  const rejectToken = createActionToken({
    developerId: data.adminId,
    date: new Date().toISOString(),
    action: 'reject_phase_change',
    targetId: data.requestId,
  })

  const approveUrl = `${BASE_URL}/api/email-reply/approve?token=${approveToken}`
  const rejectUrl = `${BASE_URL}/api/email-reply/approve?token=${rejectToken}`
  const detailUrl = `${BASE_URL}/projects/${data.projectId}`

  const phaseLabels: Record<string, string> = {
    preliminary: 'Preliminary',
    application_development: 'Application Development',
    post_implementation: 'Post-Implementation',
  }

  return {
    subject: `Phase Change Request: ${data.projectName}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
        <h2 style="color:#1a1a1a;">Phase Change Request</h2>
        <p>Hi ${escapeHtml(data.adminName)},</p>
        <p><strong>${escapeHtml(data.requesterName)}</strong> has requested a phase change for <strong>${escapeHtml(data.projectName)}</strong>:</p>

        <div style="background:#f8f9fa;padding:16px;border-radius:8px;margin:16px 0;">
          <p style="margin:4px 0;"><strong>Current Phase:</strong> ${escapeHtml(phaseLabels[data.currentPhase] ?? data.currentPhase)}</p>
          <p style="margin:4px 0;"><strong>Requested Phase:</strong> ${escapeHtml(phaseLabels[data.requestedPhase] ?? data.requestedPhase)}</p>
          <p style="margin:4px 0;"><strong>Reason:</strong> ${escapeHtml(data.reason)}</p>
        </div>

        <div style="margin:24px 0;text-align:center;">
          <a href="${approveUrl}"
             style="display:inline-block;padding:12px 24px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-right:8px;">
            Approve
          </a>
          <a href="${rejectUrl}"
             style="display:inline-block;padding:12px 24px;background:#dc2626;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-right:8px;">
            Reject
          </a>
          <a href="${detailUrl}"
             style="display:inline-block;padding:12px 24px;background:#6b7280;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">
            Review Details
          </a>
        </div>

        <p style="color:#6b7280;font-size:12px;">
          These buttons expire in 72 hours.
        </p>
      </div>
    `,
  }
}
