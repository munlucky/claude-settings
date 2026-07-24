import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

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

const observeGitWorkspace = (projectRoot) => {
  const inRepo = runGit(['rev-parse', '--is-inside-work-tree'], projectRoot);
  if (!inRepo || inRepo.trim() !== 'true') return null;

  const headTree = (runGit(['rev-parse', 'HEAD^{tree}'], projectRoot) || 'no-head').trim();
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
    identity: sha256(JSON.stringify({ headTree, entries })),
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
