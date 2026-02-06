import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email/mailer'
import { buildDailyReviewEmail } from '@/lib/email/templates'
import { format, subDays } from 'date-fns'

/**
 * Send daily review emails to all developers who have pending entries.
 * Designed to run via systemd timer at 8 AM ET.
 */
export async function sendDailyEmails(targetDate?: Date): Promise<{
  date: string
  emailsSent: number
  errors: string[]
}> {
  const date = targetDate ?? subDays(new Date(), 1)
  const dateStr = format(date, 'yyyy-MM-dd')
  const startOfDay = new Date(`${dateStr}T00:00:00.000Z`)

  const errors: string[] = []
  let emailsSent = 0

  // Find developers with pending entries for this date
  const developers = await prisma.developer.findMany({
    where: {
      active: true,
      dailyEntries: {
        some: {
          date: startOfDay,
          status: 'pending',
        },
      },
    },
    select: { id: true, email: true, displayName: true },
  })

  for (const developer of developers) {
    const entries = await prisma.dailyEntry.findMany({
      where: {
        developerId: developer.id,
        date: startOfDay,
        status: 'pending',
      },
      include: {
        project: { select: { name: true, phase: true } },
      },
    })

    if (entries.length === 0) continue

    const emailData = {
      developerName: developer.displayName,
      developerId: developer.id,
      date: dateStr,
      entries: entries.map((e) => ({
        projectName: e.project?.name ?? 'Unmatched',
        hours: e.hoursEstimated ?? 0,
        phase: e.phaseAuto ?? e.project?.phase ?? 'unknown',
        description: e.descriptionAuto?.split('\n---\n')[0] ?? '',
        capitalizable: (e.phaseAuto ?? e.project?.phase) === 'application_development',
      })),
    }

    const { subject, html } = buildDailyReviewEmail(emailData)

    try {
      await sendEmail({ to: developer.email, subject, html })

      // Log the email
      await prisma.emailLog.create({
        data: {
          recipientId: developer.id,
          type: 'daily_review',
          subject,
        },
      })

      emailsSent++
    } catch (err) {
      const msg = `Failed to send email to ${developer.email}: ${err instanceof Error ? err.message : err}`
      errors.push(msg)
      console.error(msg)
    }
  }

  return { date: dateStr, emailsSent, errors }
}
