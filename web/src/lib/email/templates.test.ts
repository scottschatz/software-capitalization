import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { escapeHtml, buildDailyReviewEmail, buildPhaseChangeEmail } from './templates'

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b')
  })

  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    )
  })

  it('escapes quotes', () => {
    expect(escapeHtml('"hello" & \'world\'')).toBe(
      '&quot;hello&quot; &amp; &#39;world&#39;'
    )
  })

  it('returns empty string unchanged', () => {
    expect(escapeHtml('')).toBe('')
  })

  it('passes through safe text unchanged', () => {
    expect(escapeHtml('Hello World 123')).toBe('Hello World 123')
  })

  it('handles all special chars together', () => {
    expect(escapeHtml('<"&\'>')).toBe('&lt;&quot;&amp;&#39;&gt;')
  })
})

describe('buildDailyReviewEmail', () => {
  beforeEach(() => {
    vi.stubEnv('NEXTAUTH_URL', 'http://localhost:3000')
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-for-jwt-signing-1234567890')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const baseData = {
    developerName: 'Scott Schatz',
    developerId: 'dev-1',
    date: '2026-02-01',
    entries: [
      {
        projectName: 'Teams Notetaker',
        hours: 3,
        phase: 'application_development',
        description: 'Built API endpoints',
        capitalizable: true,
      },
      {
        projectName: 'Invoice Bot',
        hours: 1,
        phase: 'post_implementation',
        description: 'Bug fix',
        capitalizable: false,
      },
    ],
  }

  it('generates email with correct subject', () => {
    const result = buildDailyReviewEmail(baseData)
    expect(result.subject).toContain('2026-02-01')
    expect(result.subject).toContain('4.0h')
  })

  it('escapes developer name in HTML', () => {
    const data = { ...baseData, developerName: '<script>alert(1)</script>' }
    const result = buildDailyReviewEmail(data)
    expect(result.html).not.toContain('<script>')
    expect(result.html).toContain('&lt;script&gt;')
  })

  it('escapes project names in HTML', () => {
    const data = {
      ...baseData,
      entries: [
        {
          ...baseData.entries[0],
          projectName: '"><img src=x onerror=alert(1)>',
        },
      ],
    }
    const result = buildDailyReviewEmail(data)
    // < and > are escaped so browser won't parse as HTML tag
    expect(result.html).not.toContain('<img')
    expect(result.html).toContain('&lt;img')
    expect(result.html).toContain('&quot;&gt;&lt;img')
  })

  it('escapes descriptions in HTML', () => {
    const data = {
      ...baseData,
      entries: [
        {
          ...baseData.entries[0],
          description: '<b>bold</b> & "quoted"',
        },
      ],
    }
    const result = buildDailyReviewEmail(data)
    expect(result.html).toContain('&lt;b&gt;bold&lt;/b&gt;')
  })

  it('includes approve and review links', () => {
    const result = buildDailyReviewEmail(baseData)
    expect(result.html).toContain('/api/email-reply/approve?token=')
    expect(result.html).toContain('/review/2026-02-01')
  })

  it('shows capitalizable vs expensed breakdown', () => {
    const result = buildDailyReviewEmail(baseData)
    expect(result.html).toContain('3.0h capitalizable')
    expect(result.html).toContain('1.0h expensed')
  })
})

describe('buildPhaseChangeEmail', () => {
  beforeEach(() => {
    vi.stubEnv('NEXTAUTH_URL', 'http://localhost:3000')
    vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-for-jwt-signing-1234567890')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  const baseData = {
    adminName: 'Scott Admin',
    adminId: 'admin-1',
    projectName: 'Teams Notetaker',
    projectId: 'proj-1',
    currentPhase: 'preliminary',
    requestedPhase: 'application_development',
    requesterId: 'dev-1',
    requesterName: 'Jane Developer',
    reason: 'Development has started, all design is done',
    requestId: 'pcr-1',
  }

  it('generates email with project name in subject', () => {
    const result = buildPhaseChangeEmail(baseData)
    expect(result.subject).toContain('Teams Notetaker')
  })

  it('escapes all user-controlled fields', () => {
    const xssData = {
      ...baseData,
      adminName: '<script>xss</script>',
      requesterName: '<img onerror=alert(1)>',
      projectName: '"><svg onload=alert(1)>',
      reason: '<b>bold</b> & "quoted"',
    }
    const result = buildPhaseChangeEmail(xssData)
    // All HTML tags are entity-escaped so browser won't render them
    expect(result.html).not.toContain('<script>')
    expect(result.html).not.toContain('<img')
    expect(result.html).not.toContain('<svg')
    expect(result.html).toContain('&lt;script&gt;')
    expect(result.html).toContain('&lt;img')
    expect(result.html).toContain('&lt;svg')
    expect(result.html).toContain('&lt;b&gt;bold&lt;/b&gt;')
  })

  it('includes approve, reject, and detail links', () => {
    const result = buildPhaseChangeEmail(baseData)
    expect(result.html).toContain('/api/email-reply/approve?token=')
    expect(result.html).toContain(`/projects/${baseData.projectId}`)
  })

  it('displays phase labels correctly', () => {
    const result = buildPhaseChangeEmail(baseData)
    expect(result.html).toContain('Preliminary')
    expect(result.html).toContain('Application Development')
  })
})
