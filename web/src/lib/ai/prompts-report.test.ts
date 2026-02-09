import { describe, it, expect } from 'vitest'
import {
  buildMonthlySummaryPrompt,
  buildProjectNarrativePrompt,
  type MonthlySummaryContext,
  type ProjectNarrativeContext,
} from './prompts-report'

// ---- Helpers ----

function makeSummaryContext(overrides: Partial<MonthlySummaryContext> = {}): MonthlySummaryContext {
  return {
    year: 2026,
    month: 1,
    monthName: 'January 2026',
    totalHours: 160,
    capHours: 120,
    expHours: 40,
    capPercentage: 75,
    projects: [],
    developers: [],
    phaseDistribution: {
      preliminary: { hours: 10, projects: 1 },
      application_development: { hours: 120, projects: 2 },
      post_implementation: { hours: 30, projects: 1 },
    },
    modelStats: {
      totalEntries: 100,
      localModelEntries: 85,
      fallbackEntries: 15,
      fallbackRate: 0.15,
      avgConfidence: 0.82,
      flaggedEntries: 3,
    },
    compliance: {
      confirmationRate: 0.95,
      manualEntryCount: 5,
      outlierCount: 2,
    },
    ...overrides,
  }
}

function makeNarrativeContext(overrides: Partial<ProjectNarrativeContext> = {}): ProjectNarrativeContext {
  return {
    project: {
      name: 'Test Project',
      description: 'A software capitalization tracking tool',
      phase: 'application_development',
      status: 'active',
      managementAuthorized: true,
      authorizationDate: '2025-11-01',
      probableToComplete: true,
      goLiveDate: '2026-06-01',
      businessJustification: 'Automate ASC 350-40 compliance',
    },
    period: {
      from: '2026-01-01',
      to: '2026-03-31',
      label: 'Q1 2026',
    },
    totalHours: 480,
    capHours: 400,
    expHours: 80,
    developers: [],
    monthlyProgression: [],
    phaseChanges: [],
    confirmationStats: {
      totalEntries: 200,
      confirmedEntries: 185,
      approvedEntries: 50,
      flaggedEntries: 5,
      avgConfidence: 0.88,
    },
    ...overrides,
  }
}

// ---- Monthly Summary Prompt Tests ----

describe('buildMonthlySummaryPrompt', () => {
  it('produces a non-empty string', () => {
    const prompt = buildMonthlySummaryPrompt(makeSummaryContext())
    expect(prompt).toBeTruthy()
    expect(prompt.length).toBeGreaterThan(100)
  })

  it('includes ASC 350-40 reference', () => {
    const prompt = buildMonthlySummaryPrompt(makeSummaryContext())
    expect(prompt).toContain('ASC 350-40')
  })

  it('includes month and year', () => {
    const prompt = buildMonthlySummaryPrompt(makeSummaryContext())
    expect(prompt).toContain('January 2026')
    expect(prompt).toContain('2026-01')
  })

  it('includes overall hour totals', () => {
    const prompt = buildMonthlySummaryPrompt(makeSummaryContext())
    expect(prompt).toContain('160.0')
    expect(prompt).toContain('120.0')
    expect(prompt).toContain('40.0')
    expect(prompt).toContain('75.0%')
  })

  it('includes phase distribution', () => {
    const prompt = buildMonthlySummaryPrompt(makeSummaryContext())
    expect(prompt).toContain('Preliminary')
    expect(prompt).toContain('Application Development')
    expect(prompt).toContain('Post-Implementation')
  })

  it('includes model reliability stats', () => {
    const prompt = buildMonthlySummaryPrompt(makeSummaryContext())
    expect(prompt).toContain('Fallback rate: 15.0%')
    expect(prompt).toContain('Average confidence: 82.0%')
    expect(prompt).toContain('Flagged entries')
  })

  it('includes compliance metrics', () => {
    const prompt = buildMonthlySummaryPrompt(makeSummaryContext())
    expect(prompt).toContain('Confirmation rate: 95.0%')
    expect(prompt).toContain('Manual entries: 5')
    expect(prompt).toContain('Outlier-flagged entries: 2')
  })

  it('requests JSON response format with expected fields', () => {
    const prompt = buildMonthlySummaryPrompt(makeSummaryContext())
    expect(prompt).toContain('"executiveSummary"')
    expect(prompt).toContain('"projectHighlights"')
    expect(prompt).toContain('"phaseDistributionNarrative"')
    expect(prompt).toContain('"complianceNotes"')
    expect(prompt).toContain('"modelReliabilityNarrative"')
    expect(prompt).toContain('"recommendations"')
    expect(prompt).toContain('"monthOverMonthChanges"')
  })

  it('includes project details when provided', () => {
    const ctx = makeSummaryContext({
      projects: [
        {
          name: 'Cap Tracker',
          phase: 'application_development',
          totalHours: 80,
          capHours: 70,
          expHours: 10,
          developerCount: 3,
          entries: 45,
        },
      ],
    })
    const prompt = buildMonthlySummaryPrompt(ctx)
    expect(prompt).toContain('Cap Tracker')
    expect(prompt).toContain('80.0')
    expect(prompt).toContain('3 developer(s)')
    expect(prompt).toContain('45 entries')
  })

  it('includes developer details when provided', () => {
    const ctx = makeSummaryContext({
      developers: [
        { name: 'Alice Smith', totalHours: 40, capHours: 35 },
      ],
    })
    const prompt = buildMonthlySummaryPrompt(ctx)
    expect(prompt).toContain('Alice Smith')
    expect(prompt).toContain('40.0')
    expect(prompt).toContain('35.0')
  })

  it('includes previous month comparison when available', () => {
    const ctx = makeSummaryContext({
      previousMonth: { totalHours: 140, capHours: 100, expHours: 40 },
    })
    const prompt = buildMonthlySummaryPrompt(ctx)
    expect(prompt).toContain('Previous Month Comparison')
    expect(prompt).toContain('140.0')
  })

  it('includes work type distribution when available', () => {
    const ctx = makeSummaryContext({
      workTypeDistribution: { coding: 80, debugging: 30, testing: 20 },
    })
    const prompt = buildMonthlySummaryPrompt(ctx)
    expect(prompt).toContain('Work Type Distribution')
    expect(prompt).toContain('coding')
    expect(prompt).toContain('debugging')
    expect(prompt).toContain('testing')
  })

  it('handles empty data gracefully', () => {
    const ctx = makeSummaryContext({
      totalHours: 0,
      capHours: 0,
      expHours: 0,
      capPercentage: 0,
      projects: [],
      developers: [],
      modelStats: {
        totalEntries: 0,
        localModelEntries: 0,
        fallbackEntries: 0,
        fallbackRate: 0,
        avgConfidence: 0,
        flaggedEntries: 0,
      },
      compliance: {
        confirmationRate: 0,
        manualEntryCount: 0,
        outlierCount: 0,
      },
    })
    const prompt = buildMonthlySummaryPrompt(ctx)
    expect(prompt).toBeTruthy()
    expect(prompt).toContain('No project activity this month')
    expect(prompt).toContain('No developer activity this month')
  })
})

// ---- Project Narrative Prompt Tests ----

describe('buildProjectNarrativePrompt', () => {
  it('produces a non-empty string', () => {
    const prompt = buildProjectNarrativePrompt(makeNarrativeContext())
    expect(prompt).toBeTruthy()
    expect(prompt.length).toBeGreaterThan(100)
  })

  it('includes ASC 350-40 reference', () => {
    const prompt = buildProjectNarrativePrompt(makeNarrativeContext())
    expect(prompt).toContain('ASC 350-40')
  })

  it('includes project details', () => {
    const prompt = buildProjectNarrativePrompt(makeNarrativeContext())
    expect(prompt).toContain('Test Project')
    expect(prompt).toContain('Application Development')
    expect(prompt).toContain('active')
    expect(prompt).toContain('Management Authorized: Yes')
    expect(prompt).toContain('2025-11-01')
    expect(prompt).toContain('Probable to Complete: Yes')
    expect(prompt).toContain('2026-06-01')
    expect(prompt).toContain('Automate ASC 350-40 compliance')
  })

  it('includes period information', () => {
    const prompt = buildProjectNarrativePrompt(makeNarrativeContext())
    expect(prompt).toContain('Q1 2026')
    expect(prompt).toContain('2026-01-01')
    expect(prompt).toContain('2026-03-31')
  })

  it('includes hours summary', () => {
    const prompt = buildProjectNarrativePrompt(makeNarrativeContext())
    expect(prompt).toContain('480.0')
    expect(prompt).toContain('400.0')
    expect(prompt).toContain('80.0')
  })

  it('includes confirmation stats', () => {
    const prompt = buildProjectNarrativePrompt(makeNarrativeContext())
    expect(prompt).toContain('Total entries: 200')
    expect(prompt).toContain('Confirmed entries: 185')
    expect(prompt).toContain('Approved entries: 50')
    expect(prompt).toContain('Flagged entries: 5')
    expect(prompt).toContain('88.0%')
  })

  it('requests JSON response format with expected fields', () => {
    const prompt = buildProjectNarrativePrompt(makeNarrativeContext())
    expect(prompt).toContain('"narrativeSummary"')
    expect(prompt).toContain('"phaseJustification"')
    expect(prompt).toContain('"developerAllocation"')
    expect(prompt).toContain('"methodologyCompliance"')
    expect(prompt).toContain('"riskFactors"')
  })

  it('includes developer allocation when provided', () => {
    const ctx = makeNarrativeContext({
      developers: [
        { name: 'Bob Jones', hours: 120, capHours: 100 },
        { name: 'Carol White', hours: 80, capHours: 70 },
      ],
    })
    const prompt = buildProjectNarrativePrompt(ctx)
    expect(prompt).toContain('Bob Jones')
    expect(prompt).toContain('120.0')
    expect(prompt).toContain('Carol White')
    expect(prompt).toContain('80.0')
  })

  it('includes monthly progression when provided', () => {
    const ctx = makeNarrativeContext({
      monthlyProgression: [
        { month: '2026-01', totalHours: 160, capHours: 130, developerCount: 3 },
        { month: '2026-02', totalHours: 170, capHours: 140, developerCount: 3 },
      ],
    })
    const prompt = buildProjectNarrativePrompt(ctx)
    expect(prompt).toContain('2026-01')
    expect(prompt).toContain('160.0')
    expect(prompt).toContain('2026-02')
    expect(prompt).toContain('170.0')
  })

  it('includes phase changes when provided', () => {
    const ctx = makeNarrativeContext({
      phaseChanges: [
        {
          fromPhase: 'preliminary',
          toPhase: 'application_development',
          date: '2025-12-15',
          reason: 'Management authorized, design complete',
        },
      ],
    })
    const prompt = buildProjectNarrativePrompt(ctx)
    expect(prompt).toContain('2025-12-15')
    expect(prompt).toContain('Preliminary')
    expect(prompt).toContain('Application Development')
    expect(prompt).toContain('Management authorized, design complete')
  })

  it('includes work type distribution when provided', () => {
    const ctx = makeNarrativeContext({
      workTypeDistribution: { coding: 200, testing: 100, documentation: 50 },
    })
    const prompt = buildProjectNarrativePrompt(ctx)
    expect(prompt).toContain('Work Type Distribution')
    expect(prompt).toContain('coding')
    expect(prompt).toContain('testing')
    expect(prompt).toContain('documentation')
  })

  it('handles minimal/empty data gracefully', () => {
    const ctx = makeNarrativeContext({
      project: {
        name: 'Empty Project',
        description: null,
        phase: 'preliminary',
        status: 'active',
        managementAuthorized: false,
        authorizationDate: null,
        probableToComplete: true,
        goLiveDate: null,
        businessJustification: null,
      },
      totalHours: 0,
      capHours: 0,
      expHours: 0,
      developers: [],
      monthlyProgression: [],
      phaseChanges: [],
      confirmationStats: {
        totalEntries: 0,
        confirmedEntries: 0,
        approvedEntries: 0,
        flaggedEntries: 0,
        avgConfidence: 0,
      },
    })
    const prompt = buildProjectNarrativePrompt(ctx)
    expect(prompt).toBeTruthy()
    expect(prompt).toContain('Empty Project')
    expect(prompt).toContain('No developer activity in this period')
    expect(prompt).toContain('No monthly progression data available')
    expect(prompt).toContain('No phase changes during this period')
  })

  it('mentions auditor audience', () => {
    const prompt = buildProjectNarrativePrompt(makeNarrativeContext())
    expect(prompt).toContain('auditor')
  })
})
