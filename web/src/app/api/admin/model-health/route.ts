import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getDeveloper } from '@/lib/get-developer'

export async function GET() {
  const developer = await getDeveloper()
  if (!developer || developer.role !== 'admin') {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  // Recent events (last 100)
  const recentEvents = await prisma.modelEvent.findMany({
    orderBy: { timestamp: 'desc' },
    take: 100,
  })

  // Summary stats (last 7 days)
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const allRecent = await prisma.modelEvent.findMany({
    where: { timestamp: { gte: sevenDaysAgo } },
    select: {
      eventType: true,
      modelAttempted: true,
      modelUsed: true,
      latencyMs: true,
      targetDate: true,
      prompt: true,
    },
  })

  const totalCalls = allRecent.filter(e => e.eventType === 'success' || e.eventType === 'fallback').length
  const successCount = allRecent.filter(e => e.eventType === 'success').length
  const fallbackCount = allRecent.filter(e => e.eventType === 'fallback').length
  const retryCount = allRecent.filter(e => e.eventType === 'retry').length

  // Average latency for successful calls
  const successLatencies = allRecent
    .filter(e => e.eventType === 'success' && e.latencyMs != null)
    .map(e => e.latencyMs!)
  const avgLatencyMs = successLatencies.length > 0
    ? Math.round(successLatencies.reduce((s, l) => s + l, 0) / successLatencies.length)
    : null

  // Fallback dates
  const fallbackDates = [...new Set(
    allRecent
      .filter(e => e.eventType === 'fallback' && e.targetDate)
      .map(e => e.targetDate!)
  )].sort()

  // Consecutive fallback streak (from most recent)
  let consecutiveFallbacks = 0
  for (const e of recentEvents) {
    if (e.eventType === 'fallback') consecutiveFallbacks++
    else if (e.eventType === 'success') break
  }

  // Per-date model usage from daily_entries
  const entryModelStats = await prisma.dailyEntry.groupBy({
    by: ['modelUsed', 'modelFallback'],
    _count: { id: true },
  })

  // Current local model config
  const localModel = process.env.AI_LOCAL_MODEL ?? 'qwen/qwen3-32b'
  const localUrl = process.env.AI_LOCAL_URL ?? 'http://10.12.112.8:11434'
  const localEnabled = process.env.AI_LOCAL_ENABLED !== 'false'
  const fallbackModel = process.env.AI_FALLBACK_MODEL ?? 'claude-haiku-4-5-20251001'

  // Check local model reachability
  let localReachable = false
  try {
    const resp = await fetch(`${localUrl}/v1/models`, { signal: AbortSignal.timeout(5000) })
    localReachable = resp.ok
  } catch {
    localReachable = false
  }

  return NextResponse.json({
    config: {
      localModel,
      localUrl,
      localEnabled,
      fallbackModel,
      localReachable,
    },
    stats: {
      period: '7d',
      totalCalls,
      successCount,
      fallbackCount,
      retryCount,
      successRate: totalCalls > 0 ? Math.round((successCount / totalCalls) * 100) : null,
      avgLatencyMs,
      consecutiveFallbacks,
      fallbackDates,
    },
    entryModelStats: entryModelStats.map(s => ({
      model: s.modelUsed,
      fallback: s.modelFallback,
      count: s._count.id,
    })),
    recentEvents: recentEvents.map(e => ({
      id: e.id,
      timestamp: e.timestamp.toISOString(),
      eventType: e.eventType,
      modelAttempted: e.modelAttempted,
      modelUsed: e.modelUsed,
      targetDate: e.targetDate,
      errorMessage: e.errorMessage,
      attempt: e.attempt,
      latencyMs: e.latencyMs,
      prompt: e.prompt,
    })),
  })
}
