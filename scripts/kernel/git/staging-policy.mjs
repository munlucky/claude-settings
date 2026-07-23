import path from 'node:path';

export const HARD_DENY_PATTERNS = [
  /\.git\//i,
  /\.moon-relay\//i,
  /\.moonshot-relay\//i,
  /\.claude\/memory/i,
  /\.codex\/state/i,
  /\.qwen\//i,
  /\.env.*/i,
  /\.sqlite(-wal|-shm)?$/i,
  /\.moon-relay-kernel\//i,
];

export function isPathStagable(filePath) {
  if (!filePath) return false;
  const normalized = filePath.replace(/\\/g, '/');
  for (const pattern of HARD_DENY_PATTERNS) {
    if (pattern.test(normalized)) {
      return false;
    }
  }
  return true;
}

export function filterStagingSelection(candidatePaths = []) {
  const selectedPaths = [];
  const excludedPaths = [];

  for (const p of candidatePaths) {
    if (isPathStagable(p)) {
      selectedPaths.push(p);
    } else {
      excludedPaths.push(p);
    }
  }

  return { selectedPaths, excludedPaths };
}

export function validateGitCloseoutPath(repoRoot, candidatePath, { changedPathsInGit = null } = {}) {
  if (typeof candidatePath !== 'string' || !candidatePath.trim()) {
    throw new Error('GIT_INVALID_PATH: Path must be a non-empty string');
  }
  if (candidatePath.includes('\0')) {
    throw new Error('GIT_PATH_CONTAINS_NUL: Path contains NUL character');
  }
  if (path.isAbsolute(candidatePath)) {
    throw new Error('GIT_PATH_IS_ABSOLUTE: Absolute paths are forbidden');
  }
  const normalized = candidatePath.replace(/\\/g, '/');
  if (normalized.startsWith('../') || normalized.includes('/../') || normalized === '..') {
    throw new Error('GIT_PATH_TRAVERSAL: Relative path traversal (..) is forbidden');
  }
  if (!isPathStagable(normalized)) {
    throw new Error(`GIT_PATH_DENIED: Path ${normalized} is denied by staging policy`);
  }

  const resolvedRoot = path.resolve(repoRoot);
  const resolvedPath = path.resolve(repoRoot, candidatePath);

  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`GIT_PATH_OUTSIDE_REPOSITORY: Path ${candidatePath} resolves outside repository ${repoRoot}`);
  }

  if (Array.isArray(changedPathsInGit) && changedPathsInGit.length > 0) {
    const isChanged = changedPathsInGit.some((p) => p === normalized || path.resolve(repoRoot, p) === resolvedPath);
    if (!isChanged) {
      throw new Error(`GIT_PATH_NOT_CHANGED: Path ${candidatePath} is not a changed file in repository`);
    }
  }

  return true;
}
