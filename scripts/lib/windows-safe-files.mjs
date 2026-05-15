import fs from 'node:fs';
import path from 'node:path';

function normalizeForMatch(value) {
  return String(value || '').replace(/\\/g, '/');
}

function hasGlobMagic(value) {
  return /[*?]/.test(String(value || ''));
}

function globSegmentToRegExp(segment) {
  const escaped = segment.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')}$`);
}

function listFilesRecursive(root) {
  if (!fs.existsSync(root)) {
    return [];
  }
  const result = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        result.push(fullPath);
      }
    }
  }
  return result;
}

function staticPrefix(pattern) {
  const normalized = normalizeForMatch(pattern);
  const segments = normalized.split('/');
  const prefix = [];
  for (const segment of segments) {
    if (segment === '**' || hasGlobMagic(segment)) {
      break;
    }
    prefix.push(segment);
  }
  return prefix.join('/') || '.';
}

function globMatches(relativePath, pattern) {
  const pathSegments = normalizeForMatch(relativePath).split('/').filter(Boolean);
  const patternSegments = normalizeForMatch(pattern).split('/').filter(Boolean);

  function matchAt(pathIndex, patternIndex) {
    if (patternIndex === patternSegments.length) {
      return pathIndex === pathSegments.length;
    }
    const patternSegment = patternSegments[patternIndex];
    if (patternSegment === '**') {
      for (let nextPathIndex = pathIndex; nextPathIndex <= pathSegments.length; nextPathIndex += 1) {
        if (matchAt(nextPathIndex, patternIndex + 1)) {
          return true;
        }
      }
      return false;
    }
    if (pathIndex >= pathSegments.length) {
      return false;
    }
    return globSegmentToRegExp(patternSegment).test(pathSegments[pathIndex])
      && matchAt(pathIndex + 1, patternIndex + 1);
  }

  return matchAt(0, 0);
}

export function dedupePaths(paths = []) {
  const seen = new Set();
  const result = [];
  for (const rawPath of paths) {
    if (!rawPath) {
      continue;
    }
    const resolved = path.resolve(String(rawPath));
    const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(resolved);
  }
  return result;
}

export function resolveGlobFiles(patterns = [], { cwd = process.cwd() } = {}) {
  const resolvedCwd = path.resolve(cwd);
  const matches = [];
  for (const rawPattern of Array.isArray(patterns) ? patterns : [patterns]) {
    const pattern = String(rawPattern || '').trim();
    if (!pattern) {
      continue;
    }
    if (!hasGlobMagic(pattern)) {
      const resolved = path.resolve(resolvedCwd, pattern);
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        matches.push(resolved);
      }
      continue;
    }

    const prefix = staticPrefix(pattern);
    const scanRoot = path.resolve(resolvedCwd, prefix);
    const relativePattern = normalizeForMatch(path.relative(scanRoot, path.resolve(resolvedCwd, pattern)));
    for (const filePath of listFilesRecursive(scanRoot)) {
      const relative = normalizeForMatch(path.relative(scanRoot, filePath));
      if (globMatches(relative, relativePattern)) {
        matches.push(filePath);
      }
    }
  }
  return dedupePaths(matches);
}

export function safeRemove(paths = [], { mustBeInside = process.cwd(), dryRun = false } = {}) {
  const root = path.resolve(mustBeInside);
  const removed = [];
  const refused = [];
  for (const filePath of dedupePaths(paths)) {
    const relative = path.relative(root, filePath);
    const inside = relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
    if (!inside) {
      refused.push(filePath);
      continue;
    }
    if (fs.existsSync(filePath)) {
      if (!dryRun) {
        fs.rmSync(filePath, { recursive: true, force: true });
      }
      removed.push(filePath);
    }
  }
  if (refused.length > 0) {
    const error = new Error(`Refusing to remove paths outside ${root}: ${refused.join(', ')}`);
    error.code = 'unsafe_remove_outside_root';
    error.refused = refused;
    throw error;
  }
  return removed;
}
