import { describe, it, expect } from 'vitest'
import { classifyHeuristic, type ClassificationInput } from './classify-work-type'

function makeInput(overrides: Partial<ClassificationInput> = {}): ClassificationInput {
  return {
    toolBreakdown: null,
    filesReferenced: [],
    userPromptSamples: [],
    commitMessages: [],
    summary: '',
    ...overrides,
  }
}

describe('classifyHeuristic', () => {
  describe('devops detection', () => {
    it('detects devops with high Bash count and deploy keywords', () => {
      const result = classifyHeuristic(makeInput({
        toolBreakdown: { Bash: 15, Read: 3, Edit: 2 },
        commitMessages: ['Update docker-compose and deploy script'],
      }))
      expect(result.workType).toBe('devops')
      expect(result.confidence).toBeGreaterThanOrEqual(0.8)
    })

    it('detects devops with CI/CD keywords and infra files', () => {
      const result = classifyHeuristic(makeInput({
        toolBreakdown: { Read: 5, Edit: 3 },
        commitMessages: ['Update CI pipeline configuration'],
        filesReferenced: ['.github/workflows/deploy.yml', 'Dockerfile'],
      }))
      expect(result.workType).toBe('devops')
      expect(result.confidence).toBeGreaterThanOrEqual(0.8)
    })

    it('detects devops with terraform keywords', () => {
      const result = classifyHeuristic(makeInput({
        toolBreakdown: { Bash: 10, Read: 2 },
        commitMessages: ['Add terraform module for VPC'],
      }))
      expect(result.workType).toBe('devops')
      expect(result.confidence).toBeGreaterThanOrEqual(0.8)
    })

    it('detects devops with kubernetes keywords', () => {
      const result = classifyHeuristic(makeInput({
        toolBreakdown: { Bash: 8, Read: 1, Edit: 1 },
        commitMessages: ['Configure k8s deployment manifests'],
      }))
      expect(result.workType).toBe('devops')
      expect(result.confidence).toBeGreaterThanOrEqual(0.8)
    })
  })

  describe('testing detection', () => {
    it('detects testing when most files are test files', () => {
      const result = classifyHeuristic(makeInput({
        filesReferenced: [
          'src/utils.test.ts',
          'src/auth.test.ts',
          'src/helpers.spec.ts',
          'src/utils.ts',
        ],
      }))
      expect(result.workType).toBe('testing')
      expect(result.confidence).toBeGreaterThanOrEqual(0.8)
    })

    it('detects testing with spec files', () => {
      const result = classifyHeuristic(makeInput({
        filesReferenced: [
          'tests/login.spec.ts',
          'tests/signup.spec.ts',
          'tests/helpers.spec.js',
        ],
      }))
      expect(result.workType).toBe('testing')
      expect(result.confidence).toBeGreaterThanOrEqual(0.8)
    })

    it('does not classify as testing with mixed files', () => {
      const result = classifyHeuristic(makeInput({
        filesReferenced: [
          'src/app.ts',
          'src/utils.ts',
          'src/utils.test.ts',
          'src/api.ts',
          'src/db.ts',
        ],
      }))
      expect(result.workType).not.toBe('testing')
    })
  })

  describe('documentation detection', () => {
    it('detects documentation when most files are docs', () => {
      const result = classifyHeuristic(makeInput({
        filesReferenced: [
          'README.md',
          'docs/setup.md',
          'CHANGELOG.md',
        ],
      }))
      expect(result.workType).toBe('documentation')
      expect(result.confidence).toBeGreaterThanOrEqual(0.8)
    })

    it('detects documentation with various doc formats', () => {
      const result = classifyHeuristic(makeInput({
        filesReferenced: [
          'docs/api.rst',
          'docs/guide.md',
          'CONTRIBUTING.md',
          'LICENSE',
        ],
      }))
      expect(result.workType).toBe('documentation')
      expect(result.confidence).toBeGreaterThanOrEqual(0.8)
    })
  })

  describe('debugging detection', () => {
    it('detects debugging from fix commits', () => {
      const result = classifyHeuristic(makeInput({
        commitMessages: [
          'Fix login redirect bug',
          'Fix null pointer in user service',
        ],
      }))
      expect(result.workType).toBe('debugging')
      expect(result.confidence).toBeGreaterThanOrEqual(0.8)
    })

    it('detects debugging from error/crash commits', () => {
      const result = classifyHeuristic(makeInput({
        commitMessages: [
          'Handle crash on empty input',
          'Fix error handling in API route',
        ],
      }))
      expect(result.workType).toBe('debugging')
      expect(result.confidence).toBeGreaterThanOrEqual(0.8)
    })

    it('does not flag as debugging when only minority are fix commits', () => {
      const result = classifyHeuristic(makeInput({
        commitMessages: [
          'Add new auth module',
          'Implement user dashboard',
          'Fix typo in readme',
        ],
      }))
      expect(result.workType).not.toBe('debugging')
    })
  })

  describe('refactoring detection', () => {
    it('detects refactoring from refactor commits', () => {
      const result = classifyHeuristic(makeInput({
        commitMessages: [
          'Refactor auth module into separate service',
          'Rename getUserById to findUserById',
        ],
      }))
      expect(result.workType).toBe('refactoring')
      expect(result.confidence).toBeGreaterThanOrEqual(0.8)
    })

    it('detects refactoring from cleanup commits', () => {
      const result = classifyHeuristic(makeInput({
        commitMessages: [
          'Clean up unused imports',
          'Extract helper functions',
          'Reorganize project structure',
        ],
      }))
      expect(result.workType).toBe('refactoring')
      expect(result.confidence).toBeGreaterThanOrEqual(0.8)
    })
  })

  describe('research detection', () => {
    it('detects research with high Read and no Edit', () => {
      const result = classifyHeuristic(makeInput({
        toolBreakdown: { Read: 20, Bash: 2 },
        commitMessages: [],
      }))
      expect(result.workType).toBe('research')
      expect(result.confidence).toBeGreaterThanOrEqual(0.7)
    })

    it('detects research with high Read:Edit ratio and no commits', () => {
      const result = classifyHeuristic(makeInput({
        toolBreakdown: { Read: 30, Edit: 5, Bash: 2 },
        commitMessages: [],
      }))
      expect(result.workType).toBe('research')
      expect(result.confidence).toBeGreaterThanOrEqual(0.7)
    })

    it('does not flag as research with normal Read:Edit ratio', () => {
      const result = classifyHeuristic(makeInput({
        toolBreakdown: { Read: 10, Edit: 8 },
        commitMessages: [],
      }))
      expect(result.workType).not.toBe('research')
    })
  })

  describe('code review detection', () => {
    it('detects code review from prompt text', () => {
      const result = classifyHeuristic(makeInput({
        userPromptSamples: ['Please review this PR', 'Check the pull request'],
      }))
      expect(result.workType).toBe('code_review')
      expect(result.confidence).toBeGreaterThanOrEqual(0.7)
    })

    it('detects code review from commit messages', () => {
      const result = classifyHeuristic(makeInput({
        commitMessages: ['Address code review feedback on auth module'],
      }))
      expect(result.workType).toBe('code_review')
      expect(result.confidence).toBeGreaterThanOrEqual(0.7)
    })
  })

  describe('coding fallback', () => {
    it('defaults to coding with no signals', () => {
      const result = classifyHeuristic(makeInput({
        summary: 'Worked on the application',
      }))
      expect(result.workType).toBe('coding')
    })

    it('defaults to coding with generic activity', () => {
      const result = classifyHeuristic(makeInput({
        toolBreakdown: { Read: 5, Edit: 5, Bash: 3 },
        commitMessages: ['Add user profile page', 'Implement settings'],
        filesReferenced: ['src/profile.ts', 'src/settings.ts'],
      }))
      expect(result.workType).toBe('coding')
    })

    it('has higher confidence with both commits and sessions', () => {
      const withBoth = classifyHeuristic(makeInput({
        toolBreakdown: { Read: 3, Edit: 3 },
        commitMessages: ['Add feature'],
      }))
      const withoutSessions = classifyHeuristic(makeInput({
        commitMessages: ['Add feature'],
      }))
      expect(withBoth.confidence).toBeGreaterThan(withoutSessions.confidence)
    })
  })

  describe('priority ordering', () => {
    it('devops takes priority over debugging when both match', () => {
      const result = classifyHeuristic(makeInput({
        toolBreakdown: { Bash: 10, Read: 2, Edit: 1 },
        commitMessages: ['Fix docker deploy pipeline bug'],
      }))
      expect(result.workType).toBe('devops')
    })

    it('testing takes priority over debugging when files are tests', () => {
      const result = classifyHeuristic(makeInput({
        filesReferenced: [
          'src/auth.test.ts',
          'src/api.test.ts',
          'src/utils.spec.ts',
        ],
        commitMessages: ['Fix failing test assertions'],
      }))
      expect(result.workType).toBe('testing')
    })
  })
})
