import { completeWithFallback } from './client'

export type WorkType =
  | 'coding'
  | 'debugging'
  | 'refactoring'
  | 'research'
  | 'code_review'
  | 'testing'
  | 'documentation'
  | 'devops'

export interface ClassificationInput {
  toolBreakdown: Record<string, number> | null
  filesReferenced: string[]
  userPromptSamples: string[]
  commitMessages: string[]
  summary: string
}

export interface ClassificationResult {
  workType: WorkType
  confidence: number
}

const VALID_WORK_TYPES: WorkType[] = [
  'coding', 'debugging', 'refactoring', 'research',
  'code_review', 'testing', 'documentation', 'devops',
]

const DEVOPS_KEYWORDS = /\b(deploy|ci|cd|docker|k8s|kubernetes|terraform|pipeline|github.actions|jenkins|helm|ansible|nginx|infrastructure)\b/i
const TESTING_EXTENSIONS = /\.(test|spec)\.(ts|tsx|js|jsx|py|go|rs|java)$/
const DOC_FILES = /\.(md|mdx|rst|txt)$|README|CHANGELOG|LICENSE|CONTRIBUTING/i
const DEBUG_KEYWORDS = /\b(fix|bug|error|crash|issue|patch|hotfix|broken|fault|defect|exception|trace|stack)\b/i
const REFACTOR_KEYWORDS = /\b(refactor|rename|clean|extract|reorganize|simplify|restructure|decouple|split|merge|move)\b/i
const REVIEW_KEYWORDS = /\b(review|pr\b|pull.request|code.review|approve|feedback|comment)\b/i

/**
 * Classify the type of work performed in a daily entry.
 * Uses heuristics first (<1ms), falls back to LLM if confidence is low.
 * NEVER throws — always returns a result.
 */
export async function classifyWorkType(input: ClassificationInput): Promise<ClassificationResult> {
  const heuristic = classifyHeuristic(input)

  if (heuristic.confidence >= 0.7) {
    return heuristic
  }

  // LLM fallback for low-confidence heuristic results
  try {
    const llmResult = await classifyWithLLM(input)
    if (llmResult) {
      return llmResult
    }
  } catch {
    // LLM unavailable — return heuristic result anyway
  }

  return heuristic
}

/**
 * Pure heuristic classification — no I/O, <1ms.
 * Exported for testing.
 */
export function classifyHeuristic(input: ClassificationInput): ClassificationResult {
  const { toolBreakdown, filesReferenced, userPromptSamples, commitMessages, summary } = input

  const allText = [...commitMessages, summary].join(' ')
  const allPromptText = userPromptSamples.join(' ')

  // --- DevOps: High Bash count + commits mention deploy/CI/docker/k8s/terraform ---
  const bashCount = toolBreakdown?.['Bash'] ?? toolBreakdown?.['bash'] ?? 0
  const totalToolUses = toolBreakdown
    ? Object.values(toolBreakdown).reduce((s, v) => s + v, 0)
    : 0
  const highBash = totalToolUses > 0 && bashCount / totalToolUses > 0.4

  if (highBash && DEVOPS_KEYWORDS.test(allText)) {
    return { workType: 'devops', confidence: 0.85 }
  }
  if (DEVOPS_KEYWORDS.test(allText) && filesReferenced.some(f =>
    /dockerfile|docker-compose|\.ya?ml$|terraform|\.tf$|Jenkinsfile|\.github/i.test(f)
  )) {
    return { workType: 'devops', confidence: 0.8 }
  }

  // --- Testing: All/most files are test files ---
  if (filesReferenced.length > 0) {
    const testFiles = filesReferenced.filter(f => TESTING_EXTENSIONS.test(f))
    const testRatio = testFiles.length / filesReferenced.length
    if (testRatio >= 0.7) {
      return { workType: 'testing', confidence: 0.85 }
    }
  }

  // --- Documentation: All/most files are docs ---
  if (filesReferenced.length > 0) {
    const docFiles = filesReferenced.filter(f => DOC_FILES.test(f))
    const docRatio = docFiles.length / filesReferenced.length
    if (docRatio >= 0.7) {
      return { workType: 'documentation', confidence: 0.85 }
    }
  }

  // --- Debugging: Commits contain fix/bug/error/crash/issue ---
  if (commitMessages.length > 0) {
    const debugMatches = commitMessages.filter(m => DEBUG_KEYWORDS.test(m))
    if (debugMatches.length / commitMessages.length >= 0.5) {
      return { workType: 'debugging', confidence: 0.8 }
    }
  }

  // --- Refactoring: Commits contain refactor/rename/clean/extract ---
  if (commitMessages.length > 0) {
    const refactorMatches = commitMessages.filter(m => REFACTOR_KEYWORDS.test(m))
    if (refactorMatches.length / commitMessages.length >= 0.5) {
      return { workType: 'refactoring', confidence: 0.8 }
    }
  }

  // --- Research: High Read:Edit ratio + no/few commits ---
  const readCount = toolBreakdown?.['Read'] ?? toolBreakdown?.['read'] ?? 0
  const editCount = toolBreakdown?.['Edit'] ?? toolBreakdown?.['edit'] ?? 0
  if (readCount > 0 && editCount === 0 && commitMessages.length <= 1) {
    return { workType: 'research', confidence: 0.75 }
  }
  if (readCount > 0 && editCount > 0 && readCount / editCount > 3 && commitMessages.length === 0) {
    return { workType: 'research', confidence: 0.7 }
  }

  // --- Code Review: Prompts mention review/PR/pull request ---
  if (REVIEW_KEYWORDS.test(allPromptText) || REVIEW_KEYWORDS.test(allText)) {
    return { workType: 'code_review', confidence: 0.7 }
  }

  // --- Default: coding ---
  // Confidence depends on how much data we have
  const hasCommits = commitMessages.length > 0
  const hasSessions = totalToolUses > 0
  const confidence = hasCommits && hasSessions ? 0.6 : 0.5

  return { workType: 'coding', confidence }
}

/**
 * LLM-based classification for ambiguous cases.
 * Returns null if response cannot be parsed.
 */
async function classifyWithLLM(input: ClassificationInput): Promise<ClassificationResult | null> {
  const prompt = `Classify the following developer work into exactly ONE category.

Categories: coding, debugging, refactoring, research, code_review, testing, documentation, devops

Context:
- Summary: ${input.summary}
- Commit messages: ${input.commitMessages.slice(0, 5).join('; ') || 'none'}
- Files: ${input.filesReferenced.slice(0, 10).join(', ') || 'none'}
- Developer prompts: ${input.userPromptSamples.slice(0, 3).join('; ') || 'none'}
- Tool usage: ${input.toolBreakdown ? Object.entries(input.toolBreakdown).map(([k, v]) => `${k}:${v}`).join(', ') : 'none'}

Respond with ONLY a JSON object: {"workType": "category", "confidence": 0.0-1.0}`

  const result = await completeWithFallback(prompt, { maxTokens: 128, jsonMode: true })

  try {
    const jsonMatch = result.text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null

    const parsed = JSON.parse(jsonMatch[0]) as { workType?: string; confidence?: number }

    if (
      parsed.workType &&
      VALID_WORK_TYPES.includes(parsed.workType as WorkType) &&
      typeof parsed.confidence === 'number' &&
      parsed.confidence >= 0 &&
      parsed.confidence <= 1
    ) {
      return {
        workType: parsed.workType as WorkType,
        confidence: parsed.confidence,
      }
    }
  } catch {
    // Parse failure — return null so caller uses heuristic
  }

  return null
}
