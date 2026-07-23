import path from 'node:path';

export const HARD_DENY_PATTERNS = [
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
