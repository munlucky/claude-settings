#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const manifestName = '.moonshot-relay-install-manifest.json';
const runtimes = ['moonshot-relay', 'claude', 'codex', 'qwen'];

const parseArgs = (argv) => {
  const options = { homes: {}, json: false, keepTemp: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--candidate-root') options.candidateRoot = path.resolve(argv[++index]);
    else if (arg === '--moonshot-home') options.homes['moonshot-relay'] = path.resolve(argv[++index]);
    else if (arg === '--claude-home') options.homes.claude = path.resolve(argv[++index]);
    else if (arg === '--codex-home') options.homes.codex = path.resolve(argv[++index]);
    else if (arg === '--qwen-home') options.homes.qwen = path.resolve(argv[++index]);
    else if (arg === '--json') options.json = true;
    else if (arg === '--keep-temp') options.keepTemp = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.candidateRoot) throw new Error('--candidate-root is required');
  const defaults = {
    'moonshot-relay': path.join(os.homedir(), '.moonshot-relay'),
    claude: path.join(os.homedir(), '.claude'),
    codex: path.join(os.homedir(), '.codex'),
    qwen: path.join(os.homedir(), '.qwen'),
  };
  options.homes = { ...defaults, ...options.homes };
  return options;
};

const readManifest = async (home) => JSON.parse(await readFile(path.join(home, manifestName), 'utf8'));

export const manifestHashMap = (manifest) => {
  const result = new Map();
  for (const entry of manifest.copied || []) {
    if (result.has(entry.path)) throw new Error(`duplicate managed path in install manifest: ${entry.path}`);
    result.set(entry.path, entry.sha256);
  }
  return result;
};

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export const verifyInstalledManifest = async (home, manifest) => {
  const declared = manifestHashMap(manifest);
  const canonicalHome = await realpath(home);
  const missing = [];
  const mismatch = [];
  for (const [relativePath, expectedSha256] of declared) {
    const target = path.resolve(home, relativePath);
    const relative = path.relative(path.resolve(home), target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      mismatch.push({ path: relativePath, expectedSha256, actualSha256: null, reason: 'managed_path_escape' });
      continue;
    }
    try {
      const targetStat = await lstat(target);
      if (targetStat.isSymbolicLink()) {
        mismatch.push({ path: relativePath, expectedSha256, actualSha256: null, reason: 'managed_path_symlink' });
        continue;
      }
      const canonicalTarget = await realpath(target);
      const canonicalRelative = path.relative(canonicalHome, canonicalTarget);
      if (canonicalRelative.startsWith('..') || path.isAbsolute(canonicalRelative)) {
        mismatch.push({ path: relativePath, expectedSha256, actualSha256: null, reason: 'managed_realpath_escape' });
        continue;
      }
      const actualSha256 = sha256(await readFile(target));
      if (actualSha256 !== expectedSha256) mismatch.push({ path: relativePath, expectedSha256, actualSha256, reason: 'content_hash_mismatch' });
    } catch (error) {
      if (error.code === 'ENOENT') missing.push(relativePath);
      else mismatch.push({ path: relativePath, expectedSha256, actualSha256: null, reason: error.code || error.message });
    }
  }
  missing.sort();
  mismatch.sort((left, right) => left.path.localeCompare(right.path));
  return {
    status: missing.length === 0 && mismatch.length === 0 ? 'match' : 'mismatch',
    declaredCount: declared.size,
    missing,
    mismatch,
  };
};

export const compareInstallManifests = (installed, reproduced) => {
  const expected = manifestHashMap(installed);
  const actual = manifestHashMap(reproduced);
  const missing = [...expected.keys()].filter((key) => !actual.has(key)).sort();
  const extra = [...actual.keys()].filter((key) => !expected.has(key)).sort();
  const mismatch = [...expected.entries()]
    .filter(([key, hash]) => actual.has(key) && actual.get(key) !== hash)
    .map(([key, hash]) => ({ path: key, expectedSha256: hash, actualSha256: actual.get(key) }))
    .sort((left, right) => left.path.localeCompare(right.path));
  return {
    status: missing.length === 0 && extra.length === 0 && mismatch.length === 0 ? 'match' : 'mismatch',
    expectedCount: expected.size,
    actualCount: actual.size,
    missing,
    extra,
    mismatch,
  };
};

const git = (cwd, args) => {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `git ${args.join(' ')} failed`);
  return result.stdout.trim();
};

export const resolveInstalledRelease = async (options) => {
  const candidateSha = git(options.candidateRoot, ['rev-parse', 'HEAD']);
  const candidateStatus = git(options.candidateRoot, ['status', '--porcelain']);
  const materializationOnlyEntries = candidateStatus.split('\n').filter(Boolean)
    .filter((entry) => entry !== '?? node_modules');
  if (materializationOnlyEntries.length > 0) {
    throw new Error('candidate root must be clean except for an untracked node_modules dependency link so its materialization is bound to candidateSha');
  }

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-installed-release-'));
  const reproducedHomes = {
    'moonshot-relay': path.join(tempRoot, 'moonshot-relay'),
    claude: path.join(tempRoot, 'claude'),
    codex: path.join(tempRoot, 'codex'),
    qwen: path.join(tempRoot, 'qwen'),
  };
  try {
    const installer = path.join(options.candidateRoot, 'bin', 'moonshot-relay.mjs');
    const result = spawnSync(process.execPath, [
      installer, 'install', '--runtime', 'all',
      '--moonshot-home', reproducedHomes['moonshot-relay'],
      '--claude-home', reproducedHomes.claude,
      '--codex-home', reproducedHomes.codex,
      '--qwen-home', reproducedHomes.qwen,
      '--json',
    ], { cwd: options.candidateRoot, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'candidate install failed');

    const comparisons = [];
    for (const runtime of runtimes) {
      const installed = await readManifest(options.homes[runtime]);
      const reproduced = await readManifest(reproducedHomes[runtime]);
      const installedFiles = await verifyInstalledManifest(options.homes[runtime], installed);
      comparisons.push({ runtime, installedFiles, ...compareInstallManifests(installed, reproduced) });
    }
    const matched = comparisons.every((entry) => entry.status === 'match' && entry.installedFiles.status === 'match');
    return {
      schemaVersion: 'moonshot-installed-release-resolution.v1',
      status: matched ? 'resolved' : 'unresolved',
      liveAdoptionBlocked: !matched,
      previousReleaseSha: matched ? candidateSha : null,
      candidateSha,
      candidateRoot: options.candidateRoot,
      installedHomes: options.homes,
      comparisons,
      reproduction: {
        command: `node ${installer} install --runtime all --moonshot-home <temp>/moonshot-relay --claude-home <temp>/claude --codex-home <temp>/codex --qwen-home <temp>/qwen --json`,
        tempRoot: options.keepTemp ? tempRoot : null,
      },
    };
  } finally {
    if (!options.keepTemp) await rm(tempRoot, { recursive: true, force: true });
  }
};

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const payload = await resolveInstalledRelease(options);
    process.stdout.write(`${JSON.stringify(payload, null, options.json ? 2 : 0)}\n`);
    process.exitCode = payload.status === 'resolved' ? 0 : 2;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ status: 'error', message: error.message })}\n`);
    process.exitCode = 1;
  }
}
