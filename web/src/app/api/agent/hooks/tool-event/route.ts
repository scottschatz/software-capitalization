import { NextRequest, NextResponse } from 'next/server'
import { authenticateAgent } from '@/lib/agent-auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'
import { z } from 'zod'

const toolEventSchema = z.object({
  sessionId: z.string().min(1),
  toolName: z.string().min(1),
  toolInput: z.record(z.string(), z.unknown()).optional().nullable(),
  toolResponse: z.record(z.string(), z.unknown()).optional().nullable(),
  durationMs: z.number().int().optional().nullable(),
  projectPath: z.string().optional().nullable(),
  timestamp: z.string().optional(), // ISO datetime
})

// POST /api/agent/hooks/tool-event — Receive real-time tool events from Claude Code hooks
export async function POST(request: NextRequest) {
  const auth = await authenticateAgent(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { developer } = auth

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = toolEventSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const data = parsed.data

  // Sanitize toolInput — strip large values, keep file paths and short commands
  const sanitizedInput = data.toolInput
    ? (sanitizeToolInput(data.toolInput) as Prisma.InputJsonValue)
    : Prisma.JsonNull

  try {
    const event = await prisma.rawToolEvent.create({
      data: {
        developerId: developer.id,
        sessionId: data.sessionId,
        toolName: data.toolName,
        toolInput: sanitizedInput,
        toolResponse: data.toolResponse
          ? (sanitizeToolResponse(data.toolResponse) as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        durationMs: data.durationMs ?? null,
        projectPath: data.projectPath ?? null,
        timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
      },
    })

    return NextResponse.json({ id: event.id }, { status: 201 })
  } catch (err) {
    console.error('Failed to store tool event:', err)
    return NextResponse.json(
      { error: 'Failed to store event' },
      { status: 500 }
    )
  }
}

function sanitizeToolInput(input: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  // Keep file path fields
  for (const key of ['file_path', 'path', 'notebook_path', 'pattern', 'glob']) {
    if (typeof input[key] === 'string') {
      result[key] = input[key]
    }
  }
  // Keep command but truncate to 500 chars
  if (typeof input.command === 'string') {
    result.command = (input.command as string).slice(0, 500)
  }
  // Keep description if short
  if (typeof input.description === 'string') {
    result.description = (input.description as string).slice(0, 200)
  }
  return result
}

function sanitizeToolResponse(response: Record<string, unknown>): Record<string, unknown> {
  // Only keep a brief summary — tool responses can be huge
  const result: Record<string, unknown> = {}
  if (typeof response.output === 'string') {
    result.output_preview = (response.output as string).slice(0, 200)
  }
  if (typeof response.exit_code === 'number') {
    result.exit_code = response.exit_code
  }
  return result
}
