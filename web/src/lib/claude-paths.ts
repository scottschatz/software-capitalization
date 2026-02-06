/**
 * Convert a local filesystem path to a Claude path (used in ~/.claude/projects/).
 * Example: /home/sschatz/projects/foo → -home-sschatz-projects-foo
 */
export function localPathToClaudePath(localPath: string): string {
  return localPath.replace(/\//g, '-').replace(/^-/, '-')
}

/**
 * Convert a Claude path back to a local filesystem path.
 * Example: -home-sschatz-projects-foo → /home/sschatz/projects/foo
 *
 * Claude paths always start with '-' which corresponds to the root '/'.
 */
export function claudePathToLocalPath(claudePath: string): string {
  // The first '-' represents the root '/', the rest are directory separators
  if (!claudePath.startsWith('-')) return claudePath
  return claudePath.replace(/-/g, '/')
}
