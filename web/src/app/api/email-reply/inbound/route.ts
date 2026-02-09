import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import Anthropic from '@anthropic-ai/sdk'

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
"${rawBody}"

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

    // Log the reply
    const reply = await prisma.emailReply.create({
      data: {
        emailLogId: emailLogId || undefined,
        rawBody,
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

      for (const entry of entries) {
        await prisma.dailyEntry.update({
          where: { id: entry.id },
          data: {
            hoursConfirmed: entry.hoursEstimated,
            phaseConfirmed: entry.phaseAuto ?? entry.project?.phase ?? 'application_development',
            descriptionConfirmed:
              entry.descriptionAuto?.split('\n---\n')[0] ?? 'Confirmed via email reply',
            confirmedAt: new Date(),
            confirmedById: developer.id,
            status: 'confirmed',
          },
        })
      }

      await prisma.emailReply.update({
        where: { id: reply.id },
        data: { actionTaken: `confirm_all: ${entries.length} entries confirmed` },
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
