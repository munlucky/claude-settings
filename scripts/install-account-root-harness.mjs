#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  access,
  copyFile,
  cp,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  rmdir,
  stat,
  writeFile,
} from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const defaultSourceRoot = path.dirname(path.dirname(scriptPath));

const manifestName = '.moonshot-relay-install-manifest.json';
const legacyManifestNames = Object.freeze(['.claude-settings-install-manifest.json']);

const commonSpec = {
  runtime: 'moonshot-relay',
  payloadPath: path.join('moonshot-relay', 'profile'),
  defaultHome: () => path.join(os.homedir(), '.moonshot-relay'),
  envName: 'MOONSHOT_RELAY_HOME',
  ownedEntries: new Set([
    'bin',
    'catalog',
    'docs',
    'rules',
    'schemas',
    'scripts',
    'skills',
    'templates',
    'tools',
    'node_modules',
    'package',
    'package.json',
    'package-lock.json',
    'skills.lock.json',
    'verification.contract.yaml',
  ]),
};

const runtimeSpecs = {
  claude: {
    payloadPath: path.join('claude', 'profile', '.claude'),
    defaultHome: () => path.join(os.homedir(), '.claude'),
    envName: 'CLAUDE_HOME',
    exposureEntries: new Set([
      'CLAUDE.md',
      'PROJECT.md',
      'README.md',
      'agents',
      'profile-contract.yaml',
      'rules',
      'skills',
      'verification.contract.yaml',
    ]),
    legacyNonExposureEntries: new Set([
      'bin',
      'docs',
      'schemas',
      'scripts',
      'templates',
      'tools',
    ]),
    protectedEntries: new Set([
      'backups',
      'cache',
      'debug',
      'downloads',
      'file-history',
      'history.jsonl',
      'ide',
      'memory.json',
      'paste-cache',
      'plans',
      'plugins',
      'projects',
      'session-env',
      'sessions',
      'settings.json',
      'shell-snapshots',
      'stats-cache.json',
      'statsig',
      'tasks',
      'telemetry',
      'todos',
      'memory-mcp-wrapper.log',
    ]),
    legacyHarnessCore: 'harness-core',
  },
  codex: {
    payloadPath: path.join('codex', 'profile', '.codex'),
    defaultHome: () => path.join(os.homedir(), '.codex'),
    envName: 'CODEX_HOME',
    exposureEntries: new Set([
      'AGENTS.md',
      'README.md',
      'agents',
      'rules',
      'skills',
      'verification.contract.yaml',
    ]),
    legacyNonExposureEntries: new Set([
      'bin',
      'docs',
      'schemas',
      'scripts',
      'templates',
      'tools',
    ]),
    protectedEntries: new Set([
      '.sandbox',
      '.sandbox-bin',
      '.sandbox-secrets',
      '.tmp',
      'ambient-suggestions',
      'automations',
      'auth.json',
      'backups',
      'bridge-runtime',
      'browser',
      'cache',
      'computer-use',
      'computer-use-turn-ended',
      'config.toml',
      'generated_images',
      'goals_1.sqlite',
      'history.jsonl',
      'installation_id',
      'log',
      'logs_2.sqlite',
      'memories',
      'models_cache.json',
      'node_repl',
      'pets',
      'plugins',
      'session_index.jsonl',
      'sessions',
      'sqlite',
      'state_5.sqlite',
      'tmp',
      'vendor_imports',
      'version.json',
    ]),
    legacyHarnessCore: 'harness-core',
  },
  qwen: {
    payloadPath: path.join('qwen', 'profile', '.qwen'),
    defaultHome: () => path.join(os.homedir(), '.qwen'),
    envName: 'QWEN_HOME',
    exposureEntries: new Set([
      'QWEN.md',
      'README.md',
      'agents',
      'rules',
      'skills',
      'verification.contract.yaml',
    ]),
    legacyNonExposureEntries: new Set([
      'bin',
      'docs',
      'schemas',
      'scripts',
      'templates',
      'tools',
    ]),
    protectedEntries: new Set([
      '.env',
      'auth.json',
      'backups',
      'cache',
      'credentials.json',
      'history.json',
      'history.jsonl',
      'logs',
      'memory',
      'memory.json',
      'mcp-oauth-tokens.json',
      'oauth_creds.json',
      'plugins',
      'settings.json',
      'shell_history',
      'startup-perf',
      'tmp',
      'todos',
    ]),
    legacyHarnessCore: 'harness-core',
  },
};

const usage = () => `Usage: node scripts/install-account-root-harness.mjs [--runtime all|claude|codex|qwen] [--source-root <repo>] [--moonshot-home <dir>] [--codex-home <dir>] [--claude-home <dir>] [--qwen-home <dir>] [--dry-run] [--json] [--no-backup] [--remove-legacy-harness-core]`;

const parseArgs = (argv) => {
  const options = {
    runtime: 'all',
    sourceRoot: process.env.MOONSHOT_RELAY_SOURCE_ROOT || process.env.CLAUDE_SETTINGS_SOURCE_ROOT
      ? path.resolve(process.env.MOONSHOT_RELAY_SOURCE_ROOT || process.env.CLAUDE_SETTINGS_SOURCE_ROOT)
      : defaultSourceRoot,
    homes: {},
    dryRun: false,
    json: false,
    backup: true,
    removeLegacyHarnessCore: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--runtime') {
      options.runtime = argv[++index];
    } else if (arg === '--source-root') {
      options.sourceRoot = path.resolve(argv[++index]);
    } else if (arg === '--moonshot-home') {
      options.homes[commonSpec.runtime] = path.resolve(argv[++index]);
    } else if (arg === '--codex-home') {
      options.homes.codex = path.resolve(argv[++index]);
    } else if (arg === '--claude-home') {
      options.homes.claude = path.resolve(argv[++index]);
    } else if (arg === '--qwen-home') {
      options.homes.qwen = path.resolve(argv[++index]);
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--no-backup') {
      options.backup = false;
    } else if (arg === '--remove-legacy-harness-core') {
      options.removeLegacyHarnessCore = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }

  if (!['all', 'claude', 'codex', 'qwen'].includes(options.runtime)) {
    throw new Error(`Unsupported runtime: ${options.runtime}\n${usage()}`);
  }

  return options;
};

const pathExists = async (target) => {
  try {
    await access(target, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const toPortable = (filePath) => filePath.split(path.sep).join('/');

const hashFile = async (target) => {
  const content = await readFile(target);
  return createHash('sha256').update(content).digest('hex');
};

const matchesManagedHash = async (record, target) => (
  typeof record.sha256 === 'string'
  && /^[a-f0-9]{64}$/u.test(record.sha256)
  && await hashFile(target) === record.sha256
);

const listFiles = async (root, prefix = '') => {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relative = path.join(prefix, entry.name);
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(absolute, relative));
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }

  return files.sort();
};

const assertSafeChild = (root, candidate) => {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Unsafe path outside target root: ${resolvedCandidate}`);
  }
};

const resolvePackageBuilder = async (sourceRoot) => {
  const builder = path.join(sourceRoot, 'package', 'build-package.mjs');
  if (!await pathExists(builder)) {
    throw new Error(
      `Package materializer not found: ${builder}. Run this installer from the moonshot-relay source checkout or pass --source-root <repo>.`,
    );
  }
  return builder;
};

const materializePayloads = async (sourceRoot) => {
  const packageBuilder = await resolvePackageBuilder(sourceRoot);
  const tmpRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-relay-account-root-'));
  const result = spawnSync(process.execPath, [
    packageBuilder,
    '--runtime',
    'all',
    '--out',
    tmpRoot,
    '--clean',
    '--json',
  ], {
    cwd: sourceRoot,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    await rm(tmpRoot, { recursive: true, force: true });
    throw new Error(result.stderr || result.stdout || 'Package materialization failed.');
  }

  return tmpRoot;
};

const backupTarget = async (target, backupRoot) => {
  if (!await pathExists(target)) {
    return null;
  }

  await mkdir(backupRoot, { recursive: true });
  const destination = path.join(backupRoot, path.basename(target));
  await cp(target, destination, { recursive: true, force: true });
  return destination;
};

const readJsonFile = async (target) => {
  try {
    const parsed = JSON.parse(await readFile(target, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const pruneEmptyDirs = async (targetRoot, directories) => {
  const sorted = [...directories]
    .sort((a, b) => b.length - a.length);

  for (const relativeDir of sorted) {
    const absoluteDir = path.join(targetRoot, relativeDir);
    try {
      await rmdir(absoluteDir);
    } catch {
      // Directory is not empty, missing, or otherwise owned by the runtime/user.
    }
  }
};

const removePreviouslyManagedNonExposureFiles = async ({ targetRoot, exposureEntries, options }) => {
  if (options.dryRun) {
    return [];
  }

  const manifest = await readJsonFile(path.join(targetRoot, manifestName));
  if (!manifest || !Array.isArray(manifest.copied)) {
    return [];
  }

  const removed = [];
  const pruneCandidates = new Set();

  for (const record of manifest.copied) {
    if (!record || typeof record.path !== 'string') {
      continue;
    }

    const segments = record.path.split(/[\\/]/).filter(Boolean);
    const topLevel = segments[0];
    if (!topLevel || exposureEntries.has(topLevel)) {
      continue;
    }

    const target = path.join(targetRoot, ...segments);
    assertSafeChild(targetRoot, target);
    if (!await pathExists(target)) {
      continue;
    }

    const targetStat = await stat(target);
    if (targetStat.isDirectory()) {
      continue;
    }
    if (!await matchesManagedHash(record, target)) {
      continue;
    }

    await rm(target, { force: true });
    removed.push(toPortable(record.path));

    let relativeDir = path.dirname(path.join(...segments));
    while (relativeDir && relativeDir !== '.') {
      pruneCandidates.add(toPortable(relativeDir));
      relativeDir = path.dirname(relativeDir);
    }
  }

  await pruneEmptyDirs(targetRoot, pruneCandidates);
  return removed;
};

const removePreviouslyManagedSkillsAbsentFromPayload = async ({ targetRoot, sourceRoot, options }) => {
  if (options.dryRun) {
    return [];
  }

  const manifest = await readJsonFile(path.join(targetRoot, manifestName));
  if (!manifest || !Array.isArray(manifest.copied)) {
    return [];
  }

  const removed = [];
  const pruneCandidates = new Set();

  for (const record of manifest.copied) {
    if (!record || typeof record.path !== 'string') {
      continue;
    }

    const segments = record.path.split(/[\\/]/).filter(Boolean);
    if (segments[0] !== 'skills' || !segments[1]) {
      continue;
    }

    const sourceSkill = path.join(sourceRoot, 'skills', segments[1]);
    if (await pathExists(sourceSkill)) {
      continue;
    }

    const target = path.join(targetRoot, ...segments);
    assertSafeChild(targetRoot, target);
    if (!await pathExists(target)) {
      continue;
    }

    const targetStat = await stat(target);
    if (targetStat.isDirectory()) {
      continue;
    }
    if (!await matchesManagedHash(record, target)) {
      continue;
    }

    await rm(target, { force: true });
    removed.push(toPortable(record.path));

    let relativeDir = path.dirname(path.join(...segments));
    while (relativeDir && relativeDir !== '.') {
      pruneCandidates.add(toPortable(relativeDir));
      relativeDir = path.dirname(relativeDir);
    }
  }

  await pruneEmptyDirs(targetRoot, pruneCandidates);
  return removed;
};

const removeCanonicalProfileSkillsAbsentFromPayload = async ({
  targetRoot,
  sourceRepo,
  sourceRoot,
  backupRoot,
  options,
}) => {
  const targetSkillsRoot = path.join(targetRoot, 'skills');
  const sourceSkillsRoot = path.join(sourceRepo, 'skills');
  const payloadSkillsRoot = path.join(sourceRoot, 'skills');
  if (!await pathExists(targetSkillsRoot) || !await pathExists(sourceSkillsRoot)) {
    return { removed: [], backups: [] };
  }

  const sourceSkillEntries = await readdir(sourceSkillsRoot, { withFileTypes: true });
  const canonicalSkillNames = new Set(sourceSkillEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name));
  const payloadSkillEntries = await pathExists(payloadSkillsRoot)
    ? await readdir(payloadSkillsRoot, { withFileTypes: true })
    : [];
  const payloadSkillNames = new Set(payloadSkillEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name));

  const removed = [];
  const backups = [];
  const targetSkillEntries = await readdir(targetSkillsRoot, { withFileTypes: true });
  for (const entry of targetSkillEntries) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (!canonicalSkillNames.has(entry.name) || payloadSkillNames.has(entry.name)) {
      continue;
    }

    const target = path.join(targetSkillsRoot, entry.name);
    assertSafeChild(targetRoot, target);
    if (!options.dryRun && options.backup) {
      const backup = await backupTarget(target, backupRoot);
      if (backup) {
        backups.push(toPortable(path.relative(targetRoot, backup)));
      }
    }
    if (!options.dryRun) {
      await rm(target, { recursive: true, force: true });
    }
    removed.push(toPortable(path.join('skills', entry.name)));
  }

  await pruneEmptyDirs(targetRoot, ['skills']);
  return { removed, backups };
};

const removeLegacyNonExposureEntries = async ({
  targetRoot,
  backupRoot,
  exposureEntries,
  legacyEntries,
  options,
}) => {
  if (!legacyEntries || legacyEntries.size === 0) {
    return { removed: [], backups: [] };
  }

  const removed = [];
  const backups = [];

  for (const entryName of legacyEntries) {
    if (exposureEntries.has(entryName)) {
      continue;
    }

    const target = path.join(targetRoot, entryName);
    assertSafeChild(targetRoot, target);
    if (!await pathExists(target)) {
      continue;
    }

    if (!options.dryRun) {
      if (options.backup) {
        const backup = await backupTarget(target, backupRoot);
        if (backup) {
          backups.push(toPortable(path.relative(targetRoot, backup)));
        }
      }
      await rm(target, { recursive: true, force: true });
    }

    removed.push(entryName);
  }

  return { removed, backups };
};

const copyPayloadEntry = async ({ source, target, dryRun, replaceDirectories = false }) => {
  if (dryRun) {
    return;
  }

  await mkdir(path.dirname(target), { recursive: true });
  const sourceStat = await stat(source);
  if (sourceStat.isDirectory()) {
    if (replaceDirectories) {
      await rm(target, { recursive: true, force: true });
      await cp(source, target, { recursive: true, force: true });
      return;
    }

    if (await pathExists(target)) {
      const targetStat = await stat(target);
      if (!targetStat.isDirectory()) {
        await rm(target, { recursive: true, force: true });
        await cp(source, target, { recursive: true, force: true });
        return;
      }
    } else {
      await mkdir(target, { recursive: true });
    }

    const entries = await readdir(source, { withFileTypes: true });
    for (const entry of entries) {
      await copyPayloadEntry({
        source: path.join(source, entry.name),
        target: path.join(target, entry.name),
        dryRun,
        replaceDirectories,
      });
    }
  } else {
    if (await pathExists(target)) {
      const targetStat = await stat(target);
      if (targetStat.isDirectory()) {
        await rm(target, { recursive: true, force: true });
      }
    }
    await copyFile(source, target);
  }
};

const installPayloadSpec = async ({
  spec,
  runtime,
  payloadRoot,
  options,
  installId,
  sourceRepo,
  ownedEntries,
  replaceDirectories = false,
}) => {
  const targetRoot = path.resolve(
    options.homes[runtime]
      || process.env[spec.envName]
      || spec.defaultHome(),
  );
  const sourceRoot = path.join(payloadRoot, spec.payloadPath);

  if (!await pathExists(sourceRoot)) {
    throw new Error(`Missing materialized ${runtime} payload: ${sourceRoot}`);
  }

  const sourceEntries = (await readdir(sourceRoot, { withFileTypes: true }))
    .filter((entry) => !ownedEntries || ownedEntries.has(entry.name));
  const backupRoot = path.join(targetRoot, 'backups', `moonshot-relay-account-root-${installId}`);
  const copied = [];
  const skipped = [];
  const backups = [];
  const removed = [];

  if (!options.dryRun) {
    await mkdir(targetRoot, { recursive: true });
  }

  if (ownedEntries && !replaceDirectories) {
    removed.push(...await removePreviouslyManagedNonExposureFiles({
      targetRoot,
      exposureEntries: ownedEntries,
      options,
    }));

    if (ownedEntries.has('skills')) {
      removed.push(...await removePreviouslyManagedSkillsAbsentFromPayload({
        targetRoot,
        sourceRoot,
        options,
      }));

      const canonicalSkillCleanup = await removeCanonicalProfileSkillsAbsentFromPayload({
        targetRoot,
        sourceRepo,
        sourceRoot,
        backupRoot,
        options,
      });
      removed.push(...canonicalSkillCleanup.removed);
      backups.push(...canonicalSkillCleanup.backups);
    }

    const legacyCleanup = await removeLegacyNonExposureEntries({
      targetRoot,
      backupRoot,
      exposureEntries: ownedEntries,
      legacyEntries: spec.legacyNonExposureEntries,
      options,
    });
    removed.push(...legacyCleanup.removed);
    backups.push(...legacyCleanup.backups);
  }

  for (const entry of sourceEntries) {
    if (spec.protectedEntries?.has(entry.name)) {
      skipped.push({
        path: entry.name,
        reason: 'protected_runtime_entry',
      });
      continue;
    }

    const source = path.join(sourceRoot, entry.name);
    const target = path.join(targetRoot, entry.name);
    assertSafeChild(targetRoot, target);

    if (options.backup && !options.dryRun) {
      const backup = await backupTarget(target, backupRoot);
      if (backup) {
        backups.push(toPortable(path.relative(targetRoot, backup)));
      }
    }

    await copyPayloadEntry({ source, target, dryRun: options.dryRun, replaceDirectories });

    const files = entry.isDirectory()
      ? await listFiles(source, entry.name)
      : [entry.name];

    for (const relativeFile of files) {
      const targetFile = path.join(targetRoot, relativeFile);
      copied.push({
        path: toPortable(relativeFile),
        sha256: options.dryRun ? null : await hashFile(targetFile),
      });
    }
  }

  const legacyHarnessCore = spec.legacyHarnessCore
    ? path.join(targetRoot, spec.legacyHarnessCore)
    : null;
  if (legacyHarnessCore && options.removeLegacyHarnessCore && await pathExists(legacyHarnessCore)) {
    assertSafeChild(targetRoot, legacyHarnessCore);
    if (!options.dryRun) {
      if (options.backup) {
        const backup = await backupTarget(legacyHarnessCore, backupRoot);
        if (backup) {
          backups.push(toPortable(path.relative(targetRoot, backup)));
        }
      }
      await rm(legacyHarnessCore, { recursive: true, force: true });
    }
    skipped.push({
      path: spec.legacyHarnessCore,
      reason: 'removed_legacy_harness_core',
    });
  }

  const manifest = {
    schemaVersion: 1,
    installId,
    runtime,
    installMode: 'account-root-direct',
    targetRoot,
    sourceRepo,
    commonRoot: path.resolve(
      options.homes[commonSpec.runtime]
        || process.env[commonSpec.envName]
        || commonSpec.defaultHome(),
    ),
    legacyHarnessCorePresent: legacyHarnessCore ? await pathExists(legacyHarnessCore) : false,
    copied,
    skipped,
    backups,
    removed,
  };

  if (!options.dryRun) {
    await writeFile(path.join(targetRoot, manifestName), `${JSON.stringify(manifest, null, 2)}\n`);
    for (const legacyManifestName of legacyManifestNames) {
      const legacyManifestPath = path.join(targetRoot, legacyManifestName);
      if (await pathExists(legacyManifestPath)) {
        let legacyManifest;
        try {
          const parsedLegacyManifest = JSON.parse(await readFile(legacyManifestPath, 'utf8'));
          legacyManifest = parsedLegacyManifest
            && typeof parsedLegacyManifest === 'object'
            && !Array.isArray(parsedLegacyManifest)
            ? parsedLegacyManifest
            : {};
        } catch {
          legacyManifest = {};
        }
        await writeFile(legacyManifestPath, `${JSON.stringify({
          ...legacyManifest,
          legacyManifest: true,
          supersededBy: manifestName,
        }, null, 2)}\n`);
      }
    }
  }

  return manifest;
};

const installCommonRuntime = async ({ payloadRoot, options, installId, sourceRepo }) => installPayloadSpec({
  spec: commonSpec,
  runtime: commonSpec.runtime,
  payloadRoot,
  options,
  installId,
  sourceRepo,
  ownedEntries: commonSpec.ownedEntries,
  replaceDirectories: true,
});

const installRuntime = async ({ runtime, payloadRoot, options, installId, sourceRepo }) => {
  const spec = runtimeSpecs[runtime];
  return installPayloadSpec({
    spec,
    runtime,
    payloadRoot,
    options,
    installId,
    sourceRepo,
    ownedEntries: spec.exposureEntries,
    replaceDirectories: false,
  });
};

const verifyRuntimeManifest = async (manifest) => {
  const missing = [];
  const mismatch = [];

  for (const record of manifest.copied) {
    const target = path.join(manifest.targetRoot, record.path);
    if (!await pathExists(target)) {
      missing.push(record.path);
      continue;
    }
    const actualHash = await hashFile(target);
    if (actualHash !== record.sha256) {
      mismatch.push(record.path);
    }
  }

  return {
    runtime: manifest.runtime,
    targetRoot: manifest.targetRoot,
    checked: manifest.copied.length,
    missing,
    mismatch,
  };
};

const readRuntimeSurface = async (sourceRepo) => {
  const surface = await readJsonFile(path.join(sourceRepo, 'package', 'runtime-surface.json'));
  if (!surface || !Array.isArray(surface.publicRuntimeSkills)) {
    throw new Error('package/runtime-surface.json must define publicRuntimeSkills.');
  }
  return surface.publicRuntimeSkills;
};

const listDirectoryNames = async (root) => {
  if (!await pathExists(root)) {
    return [];
  }
  const entries = await readdir(root, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
};

const computeProfileSurfaceParity = async ({ manifest, sourceRepo, publicRuntimeSkills }) => {
  if (!['claude', 'codex', 'qwen'].includes(manifest.runtime)) {
    return null;
  }

  const installedSkillNames = await listDirectoryNames(path.join(manifest.targetRoot, 'skills'));
  const canonicalSkillNames = new Set(await listDirectoryNames(path.join(sourceRepo, 'skills')));
  const expected = [...publicRuntimeSkills].sort();
  const expectedSet = new Set(expected);
  const missingPublicSkills = expected.filter((skill) => !installedSkillNames.includes(skill));
  const extraPublicSkills = installedSkillNames
    .filter((skill) => expectedSet.has(skill) === false && canonicalSkillNames.has(skill) === false);
  const extraCanonicalSkills = installedSkillNames
    .filter((skill) => expectedSet.has(skill) === false && canonicalSkillNames.has(skill));

  return {
    runtime: manifest.runtime,
    targetRoot: manifest.targetRoot,
    expectedPublicSkills: expected,
    installedPublicSkills: installedSkillNames.filter((skill) => expectedSet.has(skill)).sort(),
    missingPublicSkills,
    extraPublicSkills,
    extraCanonicalSkills,
    extraCanonicalCount: extraCanonicalSkills.length,
    status: missingPublicSkills.length === 0 && extraCanonicalSkills.length === 0 ? 'pass' : 'blocked',
  };
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const sourceRepo = options.sourceRoot;
  const runtimes = options.runtime === 'all' ? ['claude', 'codex', 'qwen'] : [options.runtime];
  const installId = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
  const payloadRoot = await materializePayloads(sourceRepo);
  const publicRuntimeSkills = await readRuntimeSurface(sourceRepo);

  try {
    const manifests = [];
    manifests.push(await installCommonRuntime({ payloadRoot, options, installId, sourceRepo }));
    for (const runtime of runtimes) {
      manifests.push(await installRuntime({ runtime, payloadRoot, options, installId, sourceRepo }));
    }

    const verification = options.dryRun
      ? []
      : await Promise.all(manifests.map((manifest) => verifyRuntimeManifest(manifest)));
    const profileSurfaceParity = options.dryRun
      ? []
      : (await Promise.all(manifests.map((manifest) => computeProfileSurfaceParity({
        manifest,
        sourceRepo,
        publicRuntimeSkills,
      })))).filter(Boolean);

    const result = {
      installId,
      mode: 'account-root-direct',
      dryRun: options.dryRun,
      manifests: manifests.map((manifest) => ({
        runtime: manifest.runtime,
        targetRoot: manifest.targetRoot,
        copiedCount: manifest.copied.length,
        legacyHarnessCorePresent: manifest.legacyHarnessCorePresent,
        skipped: manifest.skipped,
        removedCount: manifest.removed.length,
        backupCount: manifest.backups.length,
      })),
      verification,
      profileSurfaceParity,
    };

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      for (const manifest of result.manifests) {
        const verb = result.dryRun ? 'would install' : 'installed';
        console.log(`${manifest.runtime}: ${verb} ${manifest.copiedCount} files into ${manifest.targetRoot}`);
      }
    }
  } finally {
    await rm(payloadRoot, { recursive: true, force: true });
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
