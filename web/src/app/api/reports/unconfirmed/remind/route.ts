import { NextResponse } from 'next/server'
import { getDeveloper } from '@/lib/get-developer'
import { prisma } from '@/lib/prisma'
import { getMailer } from '@/lib/email/mailer'
import { createActionToken } from '@/lib/email/tokens'

const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000'

// POST /api/reports/unconfirmed/remind — Send bulk reminder emails
export async function POST() {
  const developer = await getDeveloper()
  if (!developer || developer.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  // Find developers with pending entries
  const pendingByDev = await prisma.dailyEntry.groupBy({
    by: ['developerId'],
    where: { status: 'pending' },
    _count: { id: true },
    _min: { date: true },
  })

  if (pendingByDev.length === 0) {
    return NextResponse.json({ sent: 0, message: 'No pending entries to remind about' })
  }

  const transport = getMailer()
  let sent = 0

  for (const group of pendingByDev) {
    const dev = await prisma.developer.findUnique({
      where: { id: group.developerId },
      select: { email: true, displayName: true, id: true },
    })
    if (!dev) continue

    const oldestDate = group._min.date
      ? new Date(group._min.date).toISOString().slice(0, 10)
      : 'unknown'

    const approveToken = createActionToken({
      developerId: dev.id,
      date: oldestDate,
      action: 'approve_all',
    })

    const approveUrl = `${BASE_URL}/api/email-reply/approve?token=${approveToken}`
    const reviewUrl = `${BASE_URL}/review/${oldestDate}`

    try {
      await transport.sendMail({
        from: process.env.EMAIL_FROM || 'noreply@localhost',
        to: dev.email,
        subject: `Cap Tracker Reminder: ${group._count.id} entries pending review`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
            <h2>Reminder: Unconfirmed Time Entries</h2>
            <p>Hi ${dev.displayName},</p>
            <p>You have <strong>${group._count.id} pending entries</strong>
               starting from <strong>${oldestDate}</strong>.</p>
            <p>Please review and confirm your time entries for accurate capitalization tracking.</p>
            <div style="margin:24px 0;text-align:center;">
              <a href="${approveUrl}"
                 style="display:inline-block;padding:12px 24px;background:#16a34a;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;margin-right:8px;">
                Approve All
              </a>
              <a href="${reviewUrl}"
                 style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:bold;">
                Review & Edit
              </a>
            </div>
          </div>
        `,
      })

      await prisma.emailLog.create({
        data: {
          recipientId: dev.id,
          type: 'reminder',
          subject: `Cap Tracker Reminder: ${group._count.id} entries pending review`,
          actionToken: approveToken,
        },
      })

      sent++
    } catch {
      // Skip failed sends, continue with others
    }
  }

  return NextResponse.json({ sent, total: pendingByDev.length })
}
