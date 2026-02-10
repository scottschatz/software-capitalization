import { execSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'
import { AGENT_VERSION } from '../api-client.js'

function findRepoRoot(startDir: string): string | null {
  let dir = startDir
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, '.git'))) return dir
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  return null
}

export async function updateCommand(): Promise<void> {
  console.log(`\n  Cap Agent Update`)
  console.log(`  Current version: ${AGENT_VERSION}`)

  // 1. Find repo root
  const __agentDir = dirname(fileURLToPath(import.meta.url))
  const agentRoot = resolve(__agentDir, '..')
  const repoRoot = findRepoRoot(agentRoot)

  if (!repoRoot) {
    console.error('  Error: Could not find git repository root.')
    console.error('  Make sure the agent is installed from the git repo.')
    process.exitCode = 1
    return
  }

  console.log(`  Repo root: ${repoRoot}`)

  // 2. Git pull
  console.log('\n  Pulling latest changes...')
  try {
    const pullOutput = execSync('git pull origin main', {
      cwd: repoRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    console.log(`  ${pullOutput.trim()}`)
  } catch (err) {
    console.error(`  Git pull failed: ${err instanceof Error ? err.message : err}`)
    process.exitCode = 1
    return
  }

  // 3. Rebuild agent
  const agentDir = join(repoRoot, 'agent')
  console.log('\n  Installing dependencies...')
  try {
    execSync('npm install', {
      cwd: agentDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    console.log('  Dependencies installed.')
  } catch (err) {
    console.error(`  npm install failed: ${err instanceof Error ? err.message : err}`)
    process.exitCode = 1
    return
  }

  console.log('  Building...')
  try {
    execSync('npm run build', {
      cwd: agentDir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    console.log('  Build complete.')
  } catch (err) {
    console.error(`  Build failed: ${err instanceof Error ? err.message : err}`)
    process.exitCode = 1
    return
  }

  // 4. Report new version
  try {
    const newPkg = JSON.parse(readFileSync(join(agentDir, 'package.json'), 'utf-8'))
    console.log(`\n  Updated: ${AGENT_VERSION} -> ${newPkg.version}`)
  } catch {
    console.log('\n  Update complete.')
  }

  console.log("  Run 'cap status' to verify.\n")
}
