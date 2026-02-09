import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'
import { assertPeriodOpen, PeriodLockedError } from '@/lib/period-lock'

function sanitizeEmailBody(body: string): string {
  // Strip HTML tags
  let clean = body.replace(/<[^>]*>/g, '')
  // Truncate to prevent abuse
  clean = clean.slice(0, 5000)
  // Remove potential prompt injection patterns
  clean = clean.replace(/^(SYSTEM|IGNORE PREVIOUS|ASSISTANT|HUMAN):.*/gmi, '[removed]')
  return clean.trim()
}

// POST /api/email-reply/inbound — Process inbound email replies via AI
// Protected by webhook secret — only the email provider should call this
export async function POST(request: NextRequest) {
  const webhookSecret = process.env.EMAIL_WEBHOOK_SECRET
  if (!webhookSecret) {
    return NextResponse.json(
      { error: 'Email webhook not configured' },
      { status: 503 }
    )
  }

  const authHeader = request.headers.get('x-webhook-secret') || request.headers.get('authorization')
  if (authHeader !== `Bearer ${webhookSecret}` && authHeader !== webhookSecret) {
    return NextResponse.json({ error: 'Invalid webhook secret' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { emailLogId, rawBody, senderEmail } = body

    if (!rawBody || !senderEmail) {
      return NextResponse.json({ error: 'Missing rawBody or senderEmail' }, { status: 400 })
    }

    // Sanitize email body to mitigate prompt injection and abuse
    const sanitizedBody = sanitizeEmailBody(rawBody)

    // Find the developer
    const developer = await prisma.developer.findUnique({
      where: { email: senderEmail },
    })
    if (!developer) {
      return NextResponse.json({ error: 'Unknown sender' }, { status: 404 })
    }

    // Call AI to interpret the reply (uses Anthropic directly — different from entry generation)
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const interpretation = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `You are an assistant that interprets email replies about daily time entries for software capitalization tracking.

The user received an email about their daily development hours and replied with:
"${sanitizedBody}"

Interpret their intent. Possible actions:
- "confirm_all": They approve all entries as-is (e.g., "looks good", "approved", "ok", "👍")
- "adjust": They want to change something (extract project name, hours, description changes)
- "unclear": You can't determine their intent

Respond with JSON:
{
  "action": "confirm_all" | "adjust" | "unclear",
  "interpretation": "Human-readable summary of what you understood",
  "adjustments": [{"projectName": "...", "field": "hours|description|phase", "newValue": "..."}]
}`,
        },
      ],
    })

    const textBlock = interpretation.content.find((b) => b.type === 'text')
    const aiText = textBlock && textBlock.type === 'text' ? textBlock.text : ''

    let parsed: { action: string; interpretation: string; adjustments?: unknown[] } = {
      action: 'unclear',
      interpretation: 'Could not parse AI response',
    }

    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0])
      }
    } catch {
      // Keep default
    }

    // Log the reply (store sanitized body)
    const reply = await prisma.emailReply.create({
      data: {
        emailLogId: emailLogId || undefined,
        rawBody: sanitizedBody,
        aiInterpretation: parsed.interpretation,
        actionTaken: parsed.action,
      },
    })

    // Auto-apply if clear intent
    if (parsed.action === 'confirm_all') {
      // Find pending entries from the last 7 days (not all-time)
      const since = new Date()
      since.setDate(since.getDate() - 7)
      since.setHours(0, 0, 0, 0)

      const entries = await prisma.dailyEntry.findMany({
        where: {
          developerId: developer.id,
          status: 'pending',
          date: { gte: since },
        },
        include: { project: { select: { phase: true } } },
      })

      let confirmedCount = 0
      let lockedCount = 0
      for (const entry of entries) {
        // Period lock check — skip entries in locked periods
        try {
          await assertPeriodOpen(entry.date)
        } catch (err) {
          if (err instanceof PeriodLockedError) {
            lockedCount++
            continue
          }
          throw err
        }

        const newStatus = 'confirmed'
        const newHours = entry.hoursEstimated
        const newPhase = entry.phaseAuto ?? entry.project?.phase ?? 'application_development'
        const newDescription =
          entry.descriptionAuto?.split('\n---\n')[0] ?? 'Confirmed via email reply'

        // Create revision records for field changes
        const revisionCount = await prisma.dailyEntryRevision.count({
          where: { entryId: entry.id },
        })

        let revNum = revisionCount
        const comparisons: Array<{ field: string; oldVal: string | null; newVal: string }> = [
          { field: 'status', oldVal: entry.status, newVal: newStatus },
          { field: 'hoursConfirmed', oldVal: entry.hoursEstimated == null ? null : String(entry.hoursEstimated), newVal: String(newHours) },
          { field: 'phaseConfirmed', oldVal: entry.phaseAuto, newVal: newPhase },
          { field: 'descriptionConfirmed', oldVal: entry.descriptionAuto?.split('\n---\n')[0]?.trim() ?? null, newVal: newDescription },
        ]

        for (const { field, oldVal, newVal } of comparisons) {
          if (String(oldVal ?? '') !== String(newVal)) {
            revNum++
            await prisma.dailyEntryRevision.create({
              data: {
                entryId: entry.id,
                revision: revNum,
                changedById: developer.id,
                field,
                oldValue: oldVal,
                newValue: newVal,
                reason: 'Email reply confirmation',
                authMethod: 'email_reply',
              },
            })
          }
        }

        await prisma.dailyEntry.update({
          where: { id: entry.id },
          data: {
            hoursConfirmed: newHours,
            phaseConfirmed: newPhase,
            descriptionConfirmed: newDescription,
            confirmedAt: new Date(),
            confirmedById: developer.id,
            confirmationMethod: 'email',
            status: newStatus,
          },
        })
        confirmedCount++
      }

      const actionSummary = lockedCount > 0
        ? `confirm_all: ${confirmedCount} entries confirmed, ${lockedCount} skipped (period locked)`
        : `confirm_all: ${confirmedCount} entries confirmed`
      await prisma.emailReply.update({
        where: { id: reply.id },
        data: { actionTaken: actionSummary },
      })
    }

    return NextResponse.json({
      action: parsed.action,
      interpretation: parsed.interpretation,
      replyId: reply.id,
    })
  } catch (err) {
    console.error('Error in processing inbound email reply:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
