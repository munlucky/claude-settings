import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { matchPathScope } from '../knowledge/path-scope.mjs';

const WALK_EXCLUDES = new Set(['.git', 'node_modules', 'dist', '.moonshot-relay', '.moon-relay', '.tmp', '.history']);
const WALK_ENTRY_CAP = 20000;

const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

const runGit = (args, cwd) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) return null;
  return result.stdout;
};

const hashFileContent = (absolutePath) => {
  try {
    return createHash('sha256').update(readFileSync(absolutePath)).digest('hex');
  } catch {
    return 'unreadable';
  }
};

const normalizeVerificationScopes = (scopes) => {
  if (!Array.isArray(scopes) || scopes.length === 0) return { scopes: null, reason: 'scope-not-declared' };
  const normalized = [];
  for (const raw of scopes) {
    if (typeof raw !== 'string') return { scopes: null, reason: 'scope-entry-invalid' };
    const scope = raw.trim().replaceAll('\\', '/').replace(/^\.\//u, '').replace(/\/{2,}/gu, '/');
    if (!scope || scope === '*' || scope === '**') return { scopes: null, reason: 'scope-too-broad' };
    if (/^(?:[A-Za-z]:|\/|\\\\)/u.test(scope) || scope.split('/').includes('..')) {
      return { scopes: null, reason: 'scope-path-invalid' };
    }
    normalized.push(scope);
  }
  const unique = [...new Set(normalized)].sort();
  return unique.length > 0 ? { scopes: unique, reason: null } : { scopes: null, reason: 'scope-not-declared' };
};

const nulSeparated = (value) => String(value || '').split('\0').filter(Boolean);

const safeProjectRelativePath = (projectRoot, relPath) => {
  const normalized = String(relPath || '').replaceAll('\\', '/').replace(/^\.\//u, '');
  if (!normalized || normalized.split('/').includes('..')) return null;
  const absolute = path.resolve(projectRoot, ...normalized.split('/'));
  const relative = path.relative(path.resolve(projectRoot), absolute);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
  return { normalized, absolute };
};

// A verification scope is a content snapshot, not a write-ownership hint. It
// is available only for a validated Git workspace where tracked, staged,
// modified, deleted, and untracked files can all be enumerated exactly.
const observeScopedGitWorkspace = (projectRoot, scopes) => {
  const inRepo = runGit(['rev-parse', '--is-inside-work-tree'], projectRoot);
  if (!inRepo || inRepo.trim() !== 'true') return { identity: null, method: 'unavailable', reason: 'git-worktree-unavailable' };
  const tracked = runGit(['ls-files', '-z'], projectRoot);
  const untracked = runGit(['ls-files', '--others', '--exclude-standard', '-z'], projectRoot);
  if (tracked === null || untracked === null) return { identity: null, method: 'unavailable', reason: 'file-enumeration-failed' };

  const candidates = [...new Set([...nulSeparated(tracked), ...nulSeparated(untracked)])];
  const entries = [];
  for (const candidate of candidates) {
    const safe = safeProjectRelativePath(projectRoot, candidate);
    if (!safe || !matchPathScope(safe.normalized, scopes)) continue;
    let digest;
    try {
      const stats = statSync(safe.absolute);
      if (!stats.isFile()) return { identity: null, method: 'unavailable', reason: 'non-file-observation-failed' };
      digest = createHash('sha256').update(readFileSync(safe.absolute)).digest('hex');
    } catch {
      // A tracked path that disappeared is part of the proof scope, not an
      // enumeration error: the deletion marker must change the digest.
      const exists = (() => {
        try { statSync(safe.absolute); return true; } catch { return false; }
      })();
      if (exists) return { identity: null, method: 'unavailable', reason: 'file-content-observation-failed' };
      digest = 'deleted';
    }
    entries.push([safe.normalized, digest]);
  }
  entries.sort(([left], [right]) => left.localeCompare(right));
  return {
    identity: sha256(JSON.stringify({ scopes, entries })),
    method: 'git-scoped',
    dirtyPathCount: entries.length,
    entries,
  };
};

const observeGitWorkspace = (projectRoot) => {
  const inRepo = runGit(['rev-parse', '--is-inside-work-tree'], projectRoot);
  if (!inRepo || inRepo.trim() !== 'true') return null;

  const headTree = (runGit(['rev-parse', 'HEAD^{tree}'], projectRoot) || 'no-head').trim();
  const headCommit = (runGit(['rev-parse', 'HEAD'], projectRoot) || 'no-head').trim();
  const status = runGit(['status', '--porcelain', '-z', '--untracked-files=all'], projectRoot);
  if (status === null) return null;

  const entries = [];
  for (const rawEntry of status.split('\0')) {
    if (!rawEntry || rawEntry.length < 4) continue;
    const statusCode = rawEntry.slice(0, 2);
    const relPath = rawEntry.slice(3);
    if (!relPath) continue;
    if (statusCode.includes('D')) {
      entries.push(`${relPath}::deleted`);
      continue;
    }
    entries.push(`${relPath}::${hashFileContent(path.join(projectRoot, relPath))}`);
  }
  entries.sort();

  return {
    // Include the commit as well as its tree. Two commits may point at the same
    // tree (for example an allow-empty commit), but they do not carry the same
    // provenance and must not share completion evidence.
    identity: sha256(JSON.stringify({ headCommit, headTree, entries })),
    method: 'git',
    dirtyPathCount: entries.length,
  };
};

const observeStatWalkWorkspace = (projectRoot) => {
  const entries = [];
  const walk = (dir, rel) => {
    if (entries.length >= WALK_ENTRY_CAP) return;
    let names;
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (entries.length >= WALK_ENTRY_CAP) return;
      if (WALK_EXCLUDES.has(name)) continue;
      const absolute = path.join(dir, name);
      const relative = rel ? `${rel}/${name}` : name;
      let stats;
      try {
        stats = statSync(absolute);
      } catch {
        continue;
      }
      if (stats.isDirectory()) {
        walk(absolute, relative);
      } else if (stats.isFile()) {
        entries.push(`${relative}::${stats.size}::${Math.floor(stats.mtimeMs)}`);
      }
    }
  };
  walk(projectRoot, '');
  entries.sort();
  return {
    identity: sha256(JSON.stringify({ entries })),
    method: 'stat-walk',
    dirtyPathCount: null,
  };
};

// Observes the actual workspace state including uncommitted and untracked
// changes; HEAD tree alone cannot distinguish a dirty working tree.
export const observeWorkspaceIdentity = ({ projectRoot = process.cwd() } = {}) => {
  const observation = observeGitWorkspace(projectRoot) || observeStatWalkWorkspace(projectRoot);
  return { ...observation, projectRoot, observedAt: new Date().toISOString() };
};

export const observeScopedWorkspaceIdentity = ({ projectRoot = process.cwd(), scopes = [] } = {}) => {
  const normalized = normalizeVerificationScopes(scopes);
  if (!normalized.scopes) {
    return {
      identity: null,
      method: 'unavailable',
      status: 'unavailable',
      reason: normalized.reason,
      projectRoot,
      scopes: [],
      observedAt: new Date().toISOString(),
    };
  }
  const observation = observeScopedGitWorkspace(projectRoot, normalized.scopes);
  return {
    ...observation,
    status: observation.identity ? 'observed' : 'unavailable',
    reason: observation.reason || null,
    projectRoot,
    scopes: normalized.scopes,
    observedAt: new Date().toISOString(),
  };
};
