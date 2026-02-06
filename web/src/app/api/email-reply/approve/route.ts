import { NextRequest, NextResponse } from 'next/server'
import { verifyActionToken } from '@/lib/email/tokens'
import { prisma } from '@/lib/prisma'

const APPROVAL_EMAIL = 'scott.schatz@townsquaremedia.com'

// GET /api/email-reply/approve?token=<jwt> — Handle email quick-action buttons
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) {
    return new NextResponse(renderResult('Missing token', false), {
      headers: { 'Content-Type': 'text/html' },
      status: 400,
    })
  }

  const payload = verifyActionToken(token)
  if (!payload) {
    return new NextResponse(renderResult('Token expired or invalid', false), {
      headers: { 'Content-Type': 'text/html' },
      status: 400,
    })
  }

  try {
    if (payload.action === 'approve_all') {
      // Approve all pending entries for this developer on this date
      const dateObj = new Date(`${payload.date}T00:00:00.000Z`)
      const entries = await prisma.dailyEntry.findMany({
        where: {
          developerId: payload.developerId,
          date: dateObj,
          status: 'pending',
        },
        include: { project: { select: { phase: true } } },
      })

      let confirmed = 0
      for (const entry of entries) {
        await prisma.dailyEntry.update({
          where: { id: entry.id },
          data: {
            hoursConfirmed: entry.hoursEstimated,
            phaseConfirmed: entry.phaseAuto ?? entry.project?.phase ?? 'application_development',
            descriptionConfirmed: entry.descriptionAuto?.split('\n---\n')[0] ?? 'Confirmed via email',
            confirmedAt: new Date(),
            confirmedById: payload.developerId,
            status: 'confirmed',
          },
        })
        confirmed++
      }

      return new NextResponse(
        renderResult(`${confirmed} entries confirmed for ${payload.date}`, true),
        { headers: { 'Content-Type': 'text/html' } }
      )
    }

    if (payload.action === 'approve_phase_change' && payload.targetId) {
      const developer = await prisma.developer.findUniqueOrThrow({
        where: { id: payload.developerId },
      })

      if (developer.role !== 'admin' || developer.email !== APPROVAL_EMAIL) {
        return new NextResponse(renderResult('Not authorized', false), {
          headers: { 'Content-Type': 'text/html' },
          status: 403,
        })
      }

      const pcr = await prisma.phaseChangeRequest.findUniqueOrThrow({
        where: { id: payload.targetId },
      })

      if (pcr.status !== 'pending') {
        return new NextResponse(
          renderResult(`Request already ${pcr.status}`, false),
          { headers: { 'Content-Type': 'text/html' } }
        )
      }

      await prisma.$transaction(async (tx) => {
        await tx.phaseChangeRequest.update({
          where: { id: payload.targetId },
          data: {
            status: 'approved',
            reviewedById: payload.developerId,
            reviewedAt: new Date(),
            reviewNote: 'Approved via email',
          },
        })
        await tx.project.update({
          where: { id: pcr.projectId },
          data: { phase: pcr.requestedPhase },
        })
        await tx.projectHistory.create({
          data: {
            projectId: pcr.projectId,
            changedById: payload.developerId,
            field: 'phase',
            oldValue: pcr.currentPhase,
            newValue: pcr.requestedPhase,
          },
        })
      })

      return new NextResponse(renderResult('Phase change approved', true), {
        headers: { 'Content-Type': 'text/html' },
      })
    }

    if (payload.action === 'reject_phase_change' && payload.targetId) {
      const developer = await prisma.developer.findUniqueOrThrow({
        where: { id: payload.developerId },
      })

      if (developer.role !== 'admin' || developer.email !== APPROVAL_EMAIL) {
        return new NextResponse(renderResult('Not authorized', false), {
          headers: { 'Content-Type': 'text/html' },
          status: 403,
        })
      }

      await prisma.phaseChangeRequest.update({
        where: { id: payload.targetId },
        data: {
          status: 'rejected',
          reviewedById: payload.developerId,
          reviewedAt: new Date(),
          reviewNote: 'Rejected via email',
        },
      })

      return new NextResponse(renderResult('Phase change rejected', true), {
        headers: { 'Content-Type': 'text/html' },
      })
    }

    return new NextResponse(renderResult('Unknown action', false), {
      headers: { 'Content-Type': 'text/html' },
      status: 400,
    })
  } catch (err) {
    return new NextResponse(
      renderResult(err instanceof Error ? err.message : 'Error', false),
      { headers: { 'Content-Type': 'text/html' }, status: 500 }
    )
  }
}

function renderResult(message: string, success: boolean): string {
  const color = success ? '#16a34a' : '#dc2626'
  const icon = success ? '&#10003;' : '&#10007;'
  return `<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f8f9fa;">
  <div style="text-align:center;padding:32px;">
    <div style="font-size:48px;color:${color};">${icon}</div>
    <h2 style="color:#1a1a1a;">${message}</h2>
    <a href="${process.env.NEXTAUTH_URL || 'http://localhost:3000'}" style="color:#2563eb;">Go to Cap Tracker</a>
  </div>
</body></html>`
}
