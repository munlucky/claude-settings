#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOOL_NAME = 'harness-bootstrap-lab';
const SCHEMA_VERSION = 1;
const LAB_RESULT_SCHEMA_VERSION = 'moonshot-harness-lab-result.v1';
const BASELINE_ARTIFACT_SCHEMA_VERSION = 'moonshot-harness-baseline-artifact.v1';
const COMPARE_REPORT_SCHEMA_VERSION = 'moonshot-harness-compare-report.v1';
const CONTAINER_POLICY_SCHEMA_VERSION = 'moonshot-harness-container-policy.v1';
const DEFAULT_TIMEOUT_MS = 120_000;
const OUTPUT_MAX_BUFFER = 10 * 1024 * 1024;
const ACCOUNT_ROOT_HASH_SIZE_CAP = 1024 * 1024;
const DEFAULT_FIXTURE_SET_ID = 'moonshot-harness-lab-default-v1';
const DEFAULT_SCORER_VERSION = 'harness-lab-scorer-v1';
const DEFAULT_PROMOTION_POLICY_MODE = 'no_regression';
const DEFAULT_STRICT_IMPROVEMENT_DELTA = 0.01;

const DEFAULT_SUITES = [
  {
    id: 'package-dry-run',
    description: 'Package materialization plan still succeeds without writing generated payloads.',
    command: ['<node>', 'package/build-package.mjs', '--runtime', 'all', '--dry-run', '--json'],
    timeoutMs: 120_000,
  },
  {
    id: 'harness-control-plane-eval',
    description: 'Golden control-plane regression suite stays green.',
    command: ['<node>', 'tools/evals/harness-control-plane.mjs', 'run', '--json'],
    timeoutMs: 120_000,
    fixtureId: 'harness-control-plane-eval',
    inputHash: 'sha256:harness-control-plane-eval-v1',
    metrics: [
      { id: 'score', path: 'score', direction: 'higher', min: 1, maxRegression: 0, required: true },
      { id: 'passedCount', path: 'passedCount', direction: 'higher', maxRegression: 0, required: true },
      { id: 'failedCount', path: 'failedCount', direction: 'lower', max: 0, maxRegression: 0, required: true },
      { id: 'totalCount', path: 'totalCount', direction: 'higher', maxRegression: 0, required: true },
    ],
  },
  {
    id: 'moonshot-research-fixture',
    description: 'Pinned moonshot-research evidence pack fixture stays deterministic.',
    command: [
      '<node>',
      'tools/evals/research-fixture-scorer.mjs',
      'score',
      '--manifest',
      'tests/fixtures/harness-research-fixtures/fixture-manifest.json',
      '--json',
    ],
    timeoutMs: 120_000,
    fixtureSetId: 'moonshot-research-fixtures-v1',
    fixtureId: 'harness-product-surfaces-2026-06-24',
    inputHash: 'sha256:moonshot-research-2026-06-24-harness-product-surfaces-v1',
    scorerVersion: 'research-fixture-scorer-v1',
    metrics: [
      { id: 'evidenceCount', path: 'evidenceCount', direction: 'higher', min: 50, maxRegression: 0, required: true },
      { id: 'queryVariantCount', path: 'queryVariantCount', direction: 'higher', min: 11, maxRegression: 0, required: true },
      { id: 'laneFailureCount', path: 'laneFailureCount', direction: 'lower', max: 0, maxRegression: 0, required: true },
      { id: 'primarySourceRatio', path: 'primarySourceRatio', direction: 'higher', min: 0.18, maxRegression: 0, required: true },
      { id: 'claimLedgerCoverage', path: 'claimLedgerCoverage', direction: 'higher', min: 0.9, maxRegression: 0, required: true },
      { id: 'boundaryAccessItemCount', path: 'boundaryAccessItemCount', direction: 'higher', min: 1, maxRegression: 0, required: true },
      { id: 'adjacentRepoContaminationRatio', path: 'adjacentRepoContaminationRatio', direction: 'lower', max: 0.1, maxRegression: 0, required: true },
      { id: 'requiredArtifactCompleteness', path: 'requiredArtifactCompleteness', direction: 'higher', min: 1, maxRegression: 0, required: true },
    ],
  },
  {
    id: 'harness-lab-contract',
    description: 'Bootstrap lab contract tests pass.',
    command: ['<node>', '--test', 'tests/harness-lab-contract.test.mjs'],
    timeoutMs: 120_000,
  },
];

const usage = () => `Usage:
  node tools/harness-lab/harness-lab.mjs run --candidate-root <dir> [--stable-root <dir>] [--config <json>] [--out <dir>] [--run-id <id>] [--json]
  node tools/harness-lab/harness-lab.mjs freeze --source-root <dir> --out <dir> [--version <id>] [--json]
  node tools/harness-lab/harness-lab.mjs compare --baseline-result <json> --candidate-result <json> [--promotion-policy no_regression|strict_improvement] [--min-delta <number>] [--out <json>] [--json]
  node tools/harness-lab/harness-lab.mjs promote --candidate-run <json> --baseline-root <dir> [--compare-report <json>] [--baseline-id <id>] [--expected-previous-baseline-id <id>] [--expected-previous-pointer-sha256 <sha256>] [--allow-calibrated-baseline] [--simulate-partial-copy-failure] [--json]
  node tools/harness-lab/harness-lab.mjs rollback --baseline-root <dir> --to <baseline-id> [--expected-previous-baseline-id <id>] [--expected-previous-pointer-sha256 <sha256>] [--json]
  node tools/harness-lab/harness-lab.mjs container-policy [--out <json>] [--json]

Runs an external H0 lab gate for Moonshot Relay harness changes.`;

const nodeCommand = () => process.execPath;
const npmCommand = () => (process.platform === 'win32' ? 'npm.cmd' : 'npm');

const toPortable = (filePath) => filePath.split(path.sep).join('/');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const sha256File = async (filePath) => sha256(await readFile(filePath));
const compactTime = () => new Date().toISOString().replace(/[-:.]/g, '').replace('T', '-').slice(0, 15);

const parseArgs = (argv) => {
  const [command = 'run', ...rest] = argv;
  const options = {
    command,
    candidateRoot: '',
    stableRoot: '',
    sourceRoot: '',
    config: '',
    out: '',
    runId: '',
    version: '',
    baselineResult: '',
    candidateResult: '',
    baselineRoot: '',
    baselineId: '',
    compareReport: '',
    candidateRun: '',
    promotionPolicy: DEFAULT_PROMOTION_POLICY_MODE,
    minDelta: '',
    expectedPreviousBaselineId: '',
    expectedPreviousPointerSha256: '',
    allowBaselineRefresh: false,
    allowCalibratedBaseline: false,
    to: '',
    simulatePartialCopyFailure: false,
    json: false,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--simulate-partial-copy-failure') {
      options.simulatePartialCopyFailure = true;
    } else if (arg === '--allow-baseline-refresh') {
      options.allowBaselineRefresh = true;
    } else if (arg === '--allow-calibrated-baseline') {
      options.allowCalibratedBaseline = true;
    } else if (arg === '--help' || arg === '-h') {
      options.command = 'help';
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      options[key] = rest[++index] || '';
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }

  if (command === '--help' || command === '-h') {
    options.command = 'help';
  }
  return options;
};

const runGit = (repoRoot, args, options = {}) => spawnSync('git', args, {
  cwd: repoRoot,
  encoding: 'utf8',
  maxBuffer: options.maxBuffer || OUTPUT_MAX_BUFFER,
  env: {
    ...process.env,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'safe.directory',
    GIT_CONFIG_VALUE_0: repoRoot.replaceAll(path.sep, '/'),
  },
});

async function hashUntrackedFiles(repoRoot, files) {
  const hash = createHash('sha256');
  for (const relative of files.sort()) {
    const absolute = path.join(repoRoot, relative);
    const info = await stat(absolute).catch(() => null);
    if (!info || !info.isFile()) {
      continue;
    }
    hash.update(relative);
    hash.update('\0');
    hash.update(await readFile(absolute));
    hash.update('\0');
  }
  return hash.digest('hex');
}

async function sourceFingerprint(root) {
  const repoRoot = path.resolve(root);
  const fingerprint = {
    root: repoRoot,
    gitAvailable: false,
    head: '',
    tree: '',
    statusShort: '',
    dirtyPatchSha256: '',
    untrackedSha256: '',
    digest: '',
  };

  const inside = runGit(repoRoot, ['rev-parse', '--is-inside-work-tree']);
  if (inside.status !== 0 || inside.stdout.trim() !== 'true') {
    fingerprint.digest = sha256(JSON.stringify({
      root: repoRoot,
      node: process.version,
      gitAvailable: false,
    }));
    return fingerprint;
  }

  fingerprint.gitAvailable = true;
  fingerprint.head = runGit(repoRoot, ['rev-parse', 'HEAD']).stdout.trim();
  fingerprint.tree = runGit(repoRoot, ['rev-parse', 'HEAD^{tree}']).stdout.trim();
  fingerprint.statusShort = runGit(repoRoot, ['status', '--short']).stdout.trim();

  const staged = runGit(repoRoot, ['diff', '--binary', '--cached'], { maxBuffer: OUTPUT_MAX_BUFFER });
  const unstaged = runGit(repoRoot, ['diff', '--binary'], { maxBuffer: OUTPUT_MAX_BUFFER });
  fingerprint.dirtyPatchSha256 = sha256(`${staged.stdout}\n${unstaged.stdout}`);

  const untracked = runGit(repoRoot, ['ls-files', '--others', '--exclude-standard', '-z'], { maxBuffer: OUTPUT_MAX_BUFFER });
  const untrackedFiles = untracked.stdout.split('\0').filter(Boolean);
  fingerprint.untrackedSha256 = await hashUntrackedFiles(repoRoot, untrackedFiles);

  fingerprint.digest = sha256(JSON.stringify({
    head: fingerprint.head,
    tree: fingerprint.tree,
    statusShort: fingerprint.statusShort,
    dirtyPatchSha256: fingerprint.dirtyPatchSha256,
    untrackedSha256: fingerprint.untrackedSha256,
    node: process.version,
  }));
  return fingerprint;
}

async function loadSuites(configPath) {
  return (await loadLabConfig(configPath)).suites;
}

async function loadLabConfig(configPath) {
  if (!configPath) {
    return {
      schemaVersion: 1,
      fixtureSetId: DEFAULT_FIXTURE_SET_ID,
      scorerVersion: DEFAULT_SCORER_VERSION,
      suites: DEFAULT_SUITES.map((suite) => ({
        ...suite,
        fixtureSetId: suite.fixtureSetId || DEFAULT_FIXTURE_SET_ID,
        scorerVersion: suite.scorerVersion || DEFAULT_SCORER_VERSION,
      })),
    };
  }
  const config = JSON.parse(await readFile(path.resolve(configPath), 'utf8'));
  if (!Array.isArray(config.suites) || config.suites.length === 0) {
    throw new Error('Harness lab config must contain a non-empty suites array.');
  }
  const fixtureSetId = config.fixtureSetId || DEFAULT_FIXTURE_SET_ID;
  const scorerVersion = config.scorerVersion || DEFAULT_SCORER_VERSION;
  return {
    ...config,
    fixtureSetId,
    scorerVersion,
    suites: config.suites.map((suite) => ({
      ...suite,
      fixtureSetId: suite.fixtureSetId || fixtureSetId,
      scorerVersion: suite.scorerVersion || scorerVersion,
    })),
  };
}

const expandCommand = (command, env = process.env) => {
  if (!Array.isArray(command) || command.length === 0) {
    throw new Error('Suite command must be a non-empty argv array.');
  }
  return command.map((part) => {
    if (part === '<node>') {
      return nodeCommand();
    }
    if (part === '<npm>') {
      return npmCommand();
    }
    return String(part)
      .replaceAll('<moonshot-home>', env.MOONSHOT_RELAY_HOME || '')
      .replaceAll('<codex-home>', env.CODEX_HOME || '')
      .replaceAll('<claude-home>', env.CLAUDE_HOME || '');
  });
};

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const toNumberOrNull = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
};

function parseFinalJsonObject(stdout) {
  const text = String(stdout || '').trim();
  if (!text) {
    return { value: null, error: 'stdout was empty' };
  }
  try {
    return { value: JSON.parse(text), error: '' };
  } catch {
    // Continue below. Some Node test tools print diagnostics before a final JSON object.
  }

  for (let index = text.lastIndexOf('{'); index >= 0; index = text.lastIndexOf('{', index - 1)) {
    const candidate = text.slice(index);
    try {
      return { value: JSON.parse(candidate), error: '' };
    } catch {
      // Keep scanning left until a complete final object is found.
    }
  }
  return { value: null, error: 'stdout did not contain a parseable final JSON object' };
}

function readDotPath(value, dotPath) {
  if (!dotPath) {
    return undefined;
  }
  return String(dotPath).split('.').reduce((current, segment) => {
    if (!isObject(current) || segment === '') {
      return undefined;
    }
    return current[segment];
  }, value);
}

function normalizeMaxRegression(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'number') {
    return { absolute: value, percent: null };
  }
  if (isObject(value)) {
    return {
      absolute: Number.isFinite(Number(value.absolute)) ? Number(value.absolute) : 0,
      percent: value.percent === null || value.percent === undefined ? null : Number(value.percent),
    };
  }
  return null;
}

function normalizeMetricDefinition(metric) {
  const id = metric.id || metric.path || 'unnamed-metric';
  return {
    ...metric,
    id,
    path: metric.path || id,
    direction: metric.direction === 'lower' ? 'lower' : 'higher',
    required: metric.required === true,
    maxRegression: normalizeMaxRegression(metric.maxRegression),
  };
}

function evaluateMetricThreshold(metric, numericValue) {
  if (numericValue === null) {
    if (metric.required) {
      return { status: 'failed', failureClass: 'metric_missing', reason: 'required metric was missing or non-numeric' };
    }
    return { status: 'skipped', failureClass: 'none', reason: 'metric was missing or non-numeric' };
  }
  if (metric.min !== undefined && numericValue < Number(metric.min)) {
    return { status: 'failed', failureClass: 'metric_threshold', reason: `value ${numericValue} below min ${metric.min}` };
  }
  if (metric.max !== undefined && numericValue > Number(metric.max)) {
    return { status: 'failed', failureClass: 'metric_threshold', reason: `value ${numericValue} above max ${metric.max}` };
  }
  return { status: 'passed', failureClass: 'none', reason: '' };
}

function normalizeMetricScore(metric, numericValue, status = 'passed') {
  if (numericValue === null) {
    return null;
  }
  if (status === 'failed') {
    return 0;
  }
  if (metric.direction === 'lower' && metric.max !== undefined) {
    return numericValue <= Number(metric.max) ? 1 : 0;
  }
  if (metric.direction !== 'lower' && metric.min !== undefined) {
    return numericValue >= Number(metric.min) ? 1 : 0;
  }
  return Math.max(0, Math.min(1, numericValue));
}

function extractSuiteMetrics(suite, stdout) {
  const definitions = Array.isArray(suite.metrics) ? suite.metrics.map(normalizeMetricDefinition) : [];
  if (definitions.length === 0) {
    return { metrics: [], metricFailures: [] };
  }

  const parsed = parseFinalJsonObject(stdout);
  if (!parsed.value) {
    const metrics = definitions.map((metric) => ({
      id: metric.id,
      path: metric.path,
      source: 'stdout_json',
      stdoutMode: 'final_json_object',
      pathSyntax: 'dot_path_v1',
      direction: metric.direction,
      required: metric.required,
      min: metric.min ?? null,
      max: metric.max ?? null,
      maxRegression: metric.maxRegression,
      fixtureSetId: metric.fixtureSetId || suite.fixtureSetId || null,
      fixtureId: metric.fixtureId || suite.fixtureId || suite.id || null,
      inputHash: metric.inputHash || suite.inputHash || null,
      scorerVersion: metric.scorerVersion || suite.scorerVersion || DEFAULT_SCORER_VERSION,
      normalizedScore: null,
      threshold: metric.threshold ?? metric.min ?? metric.max ?? null,
      verdict: metric.required ? 'fail' : 'skip',
      value: null,
      numericValue: null,
      status: metric.required ? 'failed' : 'skipped',
      failureClass: metric.required ? 'stdout_json_parse' : 'none',
      reason: parsed.error,
    }));
    return {
      metrics,
      metricFailures: metrics.filter((metric) => metric.status === 'failed'),
    };
  }

  const metrics = definitions.map((definition) => {
    const value = readDotPath(parsed.value, definition.path);
    const numericValue = toNumberOrNull(value);
    const threshold = evaluateMetricThreshold(definition, numericValue);
    const thresholdValue = definition.threshold ?? definition.min ?? definition.max ?? null;
    return {
      id: definition.id,
      path: definition.path,
      source: 'stdout_json',
      stdoutMode: 'final_json_object',
      pathSyntax: 'dot_path_v1',
      direction: definition.direction,
      required: definition.required,
      min: definition.min ?? null,
      max: definition.max ?? null,
      maxRegression: definition.maxRegression,
      fixtureSetId: definition.fixtureSetId || suite.fixtureSetId || null,
      fixtureId: definition.fixtureId || suite.fixtureId || suite.id || null,
      inputHash: definition.inputHash || suite.inputHash || null,
      scorerVersion: definition.scorerVersion || suite.scorerVersion || DEFAULT_SCORER_VERSION,
      normalizedScore: normalizeMetricScore(definition, numericValue, threshold.status),
      threshold: thresholdValue,
      verdict: threshold.status === 'passed' ? 'pass' : (threshold.status === 'failed' ? 'fail' : 'skip'),
      value: value ?? null,
      numericValue,
      status: threshold.status,
      failureClass: threshold.failureClass,
      reason: threshold.reason,
    };
  });

  return {
    metrics,
    metricFailures: metrics.filter((metric) => metric.status === 'failed'),
  };
}

const shouldExcludeGuardPath = (relativePath) => {
  const normalized = relativePath.replaceAll(path.sep, '/');
  const segments = normalized.split('/');
  const fileName = segments.at(-1) || '';
  if (
    segments.includes('.git')
    || segments.includes('logs')
    || segments.includes('.sandbox')
    || segments.includes('cache')
    || segments.includes('sessions')
    || segments.includes('node_modules')
    || segments.includes('backups')
    || segments.includes('runtimes')
    || segments.includes('todos')
    || segments.includes('shell-snapshots')
    || segments.includes('session-env')
    || segments.includes('.tmp')
    || segments.includes('tmp')
    || segments.includes('computer-use-turn-ended')
  ) {
    return true;
  }
  return normalized.endsWith('.sqlite-wal')
    || normalized.endsWith('.sqlite-shm')
    || normalized.endsWith('.sqlite-journal')
    || normalized.endsWith('.lock')
    || fileName === 'models_cache.json'
    || fileName === '.codex-global-state.json'
    || fileName === '.codex-global-state.json.tmp'
    || fileName === '.codex-global-state.json.bak'
    || normalized === 'process_manager/chat_processes.json'
    || /^logs_\d+\.sqlite(?:-.+)?$/.test(fileName)
    || /^state_\d+\.sqlite(?:-.+)?$/.test(fileName);
};

async function collectGuardEntries(rootPath, currentPath = rootPath) {
  const entries = [];
  const dirEntries = await readdir(currentPath, { withFileTypes: true });
  for (const entry of dirEntries) {
    const absolutePath = path.join(currentPath, entry.name);
    const relativePath = toPortable(path.relative(rootPath, absolutePath));
    if (!relativePath || shouldExcludeGuardPath(relativePath)) {
      continue;
    }
    const info = await lstat(absolutePath);
    if (info.isSymbolicLink()) {
      entries.push({
        type: 'symlink',
        path: relativePath,
        size: info.size,
        mtimeUtc: info.mtime.toISOString(),
      });
    } else if (info.isDirectory()) {
      const children = await readdir(absolutePath).catch(() => []);
      entries.push({
        type: 'directory',
        path: relativePath,
        childCount: children.length,
      });
      entries.push(...await collectGuardEntries(rootPath, absolutePath));
    } else if (info.isFile()) {
      const base = {
        type: 'file',
        path: relativePath,
        size: info.size,
        mtimeUtc: info.mtime.toISOString(),
      };
      if (info.size <= ACCOUNT_ROOT_HASH_SIZE_CAP) {
        entries.push({
          ...base,
          sha256: await sha256File(absolutePath),
          contentHashSkipped: false,
        });
      } else {
        entries.push({
          ...base,
          sha256: '',
          contentHashSkipped: true,
        });
      }
    }
  }
  return entries;
}

async function fingerprintProtectedRoot(rootPath) {
  if (!existsSync(rootPath)) {
    return {
      digest: 'absent',
      entryCount: 0,
      unavailable: false,
      entries: [],
    };
  }
  try {
    const entries = (await collectGuardEntries(rootPath)).sort((left, right) => left.path.localeCompare(right.path));
    return {
      digest: `sha256:${sha256(JSON.stringify(entries))}`,
      entryCount: entries.length,
      unavailable: false,
      entries,
    };
  } catch (error) {
    return {
      digest: 'unavailable',
      entryCount: 0,
      unavailable: true,
      error: error instanceof Error ? error.message : String(error),
      entries: [],
    };
  }
}

function resolveProtectedRoots() {
  const home = os.homedir();
  return [
    {
      id: 'moonshot-relay',
      displayPath: '%USERPROFILE%/.moonshot-relay',
      path: path.resolve(process.env.MOONSHOT_RELAY_HOME || path.join(home, '.moonshot-relay')),
    },
    {
      id: 'codex',
      displayPath: '%USERPROFILE%/.codex',
      path: path.resolve(process.env.CODEX_HOME || path.join(home, '.codex')),
    },
    {
      id: 'claude',
      displayPath: '%USERPROFILE%/.claude',
      path: path.resolve(process.env.CLAUDE_HOME || path.join(home, '.claude')),
    },
  ];
}

async function startAccountRootGuard() {
  const protectedRoots = resolveProtectedRoots();
  const before = [];
  for (const rootEntry of protectedRoots) {
    before.push({
      ...rootEntry,
      before: await fingerprintProtectedRoot(rootEntry.path),
    });
  }
  return { protectedRoots: before };
}

async function finishAccountRootGuard(startedGuard) {
  const protectedRoots = [];
  for (const rootEntry of startedGuard.protectedRoots) {
    const after = await fingerprintProtectedRoot(rootEntry.path);
    const changed = rootEntry.before.digest !== after.digest;
    protectedRoots.push({
      id: rootEntry.id,
      displayPath: rootEntry.displayPath,
      beforeDigest: rootEntry.before.digest,
      afterDigest: after.digest,
      beforeEntryCount: rootEntry.before.entryCount,
      afterEntryCount: after.entryCount,
      changed,
      changedPathsRedacted: changed ? ['<redacted:protected-root-changed>'] : [],
      unavailable: rootEntry.before.unavailable || after.unavailable,
    });
  }

  const unavailable = protectedRoots.some((entry) => entry.unavailable);
  const changed = protectedRoots.some((entry) => entry.changed);
  const failureClass = unavailable
    ? 'account_root_guard_unavailable'
    : (changed ? 'account_root_contamination' : 'none');
  return {
    status: failureClass === 'none' ? 'passed' : 'failed',
    failureClass,
    mode: 'pre_post_fingerprint_with_temp_home_overrides',
    protectedRoots,
  };
}

const commandEnvironment = (baseEnv, runRoot, label, suiteEnv = {}) => ({
  ...baseEnv,
  ...suiteEnv,
  MOONSHOT_RELAY_HOME: path.join(runRoot, 'homes', label, 'moonshot-relay'),
  PHASE_RUNTIME_DB: path.join(runRoot, 'homes', label, 'runtime-state.sqlite'),
  CODEX_HOME: path.join(runRoot, 'homes', label, 'codex'),
  CLAUDE_HOME: path.join(runRoot, 'homes', label, 'claude'),
  HOME: path.join(runRoot, 'homes', label, 'user-home'),
  USERPROFILE: path.join(runRoot, 'homes', label, 'userprofile'),
  NODE_PATH: '',
});

async function ensureRunHomes(runRoot, label) {
  await mkdir(path.join(runRoot, 'homes', label, 'moonshot-relay'), { recursive: true });
  await mkdir(path.join(runRoot, 'homes', label, 'codex'), { recursive: true });
  await mkdir(path.join(runRoot, 'homes', label, 'claude'), { recursive: true });
  await mkdir(path.join(runRoot, 'homes', label, 'user-home'), { recursive: true });
  await mkdir(path.join(runRoot, 'homes', label, 'userprofile'), { recursive: true });
}

async function installRuntimeForHarnessRoot({ repoRoot, runRoot, label }) {
  await ensureRunHomes(runRoot, label);
  const env = commandEnvironment(process.env, runRoot, label);
  const result = spawnSync(nodeCommand(), [
    'bin/moonshot-relay.mjs',
    'install',
    '--runtime',
    'all',
    '--moonshot-home',
    env.MOONSHOT_RELAY_HOME,
    '--codex-home',
    env.CODEX_HOME,
    '--claude-home',
    env.CLAUDE_HOME,
    '--json',
  ], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: DEFAULT_TIMEOUT_MS,
    maxBuffer: OUTPUT_MAX_BUFFER,
    env,
  });
  const outputDir = path.join(runRoot, label);
  await mkdir(outputDir, { recursive: true });
  const resultPath = path.join(outputDir, 'install-result.json');
  const stdoutPath = path.join(outputDir, 'install-stdout.txt');
  const stderrPath = path.join(outputDir, 'install-stderr.txt');
  await writeFile(stdoutPath, result.stdout || '');
  await writeFile(stderrPath, result.stderr || '');
  let parsed = null;
  try {
    parsed = result.stdout ? JSON.parse(result.stdout) : null;
  } catch {
    parsed = null;
  }
  const payload = {
    status: result.status === 0 ? 'passed' : 'failed',
    exitCode: result.status ?? (result.error ? 1 : 0),
    signal: result.signal || '',
    error: result.error?.message || '',
    installId: parsed?.installId || null,
    mode: parsed?.mode || null,
    stdout: {
      path: toPortable(path.relative(runRoot, stdoutPath)),
      sha256: sha256(result.stdout || ''),
      bytes: Buffer.byteLength(result.stdout || ''),
    },
    stderr: {
      path: toPortable(path.relative(runRoot, stderrPath)),
      sha256: sha256(result.stderr || ''),
      bytes: Buffer.byteLength(result.stderr || ''),
    },
  };
  await writeFile(resultPath, `${JSON.stringify(payload, null, 2)}\n`);
  if (payload.status !== 'passed') {
    throw new Error(result.stderr || result.stdout || result.error?.message || 'runtime install failed');
  }
  return {
    ...payload,
    resultPath: toPortable(path.relative(runRoot, resultPath)),
  };
}

function suiteNeedsRuntimeInstall(suite) {
  return Array.isArray(suite.command)
    && suite.command.some((part) => String(part).includes('<moonshot-home>')
      || String(part).includes('<codex-home>')
      || String(part).includes('<claude-home>'));
}

async function runSuite({ suite, repoRoot, runRoot, label }) {
  const suiteId = suite.id || 'unnamed-suite';
  const outputDir = path.join(runRoot, label, suiteId);
  await mkdir(outputDir, { recursive: true });
  await ensureRunHomes(runRoot, label);
  const childEnv = commandEnvironment(process.env, runRoot, label, suite.env || {});
  const command = expandCommand(suite.command, childEnv);
  const cwd = path.resolve(repoRoot, suite.cwd || '.');
  const started = new Date();
  const startedAt = started.toISOString();
  const result = spawnSync(command[0], command.slice(1), {
    cwd,
    encoding: 'utf8',
    timeout: Number(suite.timeoutMs || DEFAULT_TIMEOUT_MS),
    maxBuffer: OUTPUT_MAX_BUFFER,
    env: childEnv,
  });
  const ended = new Date();
  const endedAt = ended.toISOString();
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const stdoutPath = path.join(outputDir, 'stdout.txt');
  const stderrPath = path.join(outputDir, 'stderr.txt');
  await writeFile(stdoutPath, stdout);
  await writeFile(stderrPath, stderr);

  const expectedExitCode = Number.isInteger(suite.expectExitCode) ? suite.expectExitCode : 0;
  const exitCode = result.status ?? (result.error ? 1 : 0);
  const timedOut = result.error?.code === 'ETIMEDOUT';
  const { metrics, metricFailures } = extractSuiteMetrics(suite, stdout);
  const commandPassed = !timedOut && exitCode === expectedExitCode;
  const passed = commandPassed && metricFailures.length === 0;
  const metricFailureClass = metricFailures.find((metric) => metric.failureClass !== 'none')?.failureClass || 'metric_threshold';
  const failureClass = passed
    ? 'none'
    : (timedOut ? 'timeout' : (!commandPassed ? 'command_exit' : metricFailureClass));

  return {
    id: suiteId,
    description: suite.description || '',
    command: command.map((part) => (part === process.execPath ? '<node>' : part)),
    cwd: toPortable(path.relative(repoRoot, cwd) || '.'),
    expectedExitCode,
    exitCode,
    signal: result.signal || '',
    timedOut,
    status: passed ? 'passed' : 'failed',
    failureClass,
    startedAt,
    endedAt,
    durationMs: Math.max(0, ended.getTime() - started.getTime()),
    metrics,
    metricFailures,
    stdout: {
      path: toPortable(path.relative(runRoot, stdoutPath)),
      sha256: sha256(stdout),
      bytes: Buffer.byteLength(stdout),
    },
    stderr: {
      path: toPortable(path.relative(runRoot, stderrPath)),
      sha256: sha256(stderr),
      bytes: Buffer.byteLength(stderr),
    },
    error: result.error ? result.error.message : '',
  };
}

async function runHarnessRoot({ label, root, suites, runRoot }) {
  const repoRoot = path.resolve(root);
  if (!existsSync(repoRoot)) {
    throw new Error(`${label} root does not exist: ${repoRoot}`);
  }
  const fingerprint = await sourceFingerprint(repoRoot);
  const runtimeInstall = suites.some(suiteNeedsRuntimeInstall)
    ? await installRuntimeForHarnessRoot({ repoRoot, runRoot, label })
    : null;
  const results = [];
  for (const suite of suites) {
    results.push(await runSuite({ suite, repoRoot, runRoot, label }));
  }
  return {
    label,
    root: repoRoot,
    sourceFingerprint: fingerprint,
    runtimeInstall,
    results,
    status: results.every((entry) => entry.status === 'passed') ? 'passed' : 'failed',
  };
}

function compareStableCandidate(stable, candidate, suites) {
  if (!stable) {
    return [];
  }
  const stableById = new Map(stable.results.map((entry) => [entry.id, entry]));
  return candidate.results.flatMap((candidateResult) => {
    const suite = suites.find((entry) => (entry.id || 'unnamed-suite') === candidateResult.id) || {};
    if (suite.differential === false) {
      return [];
    }
    const stableResult = stableById.get(candidateResult.id);
    if (!stableResult) {
      if (candidateResult.status === 'passed') {
        return [{
          suite: candidateResult.id,
          suiteId: candidateResult.id,
          status: 'passed',
          failureClass: 'none',
          reason: 'new passing candidate suite has no stable result',
        }];
      }
      return [{
        suite: candidateResult.id,
        suiteId: candidateResult.id,
        status: 'failed',
        failureClass: 'new_failed_task',
        reason: 'stable result missing and candidate suite failed',
      }];
    }
    const entries = [];
    const exitCodeMatches = stableResult.exitCode === candidateResult.exitCode;
    if (exitCodeMatches || suite.allowExitCodeChange === true) {
      entries.push({
        suite: candidateResult.id,
        status: 'passed',
        reason: exitCodeMatches ? 'exit code unchanged' : 'exit code change explicitly allowed',
      });
    } else {
      entries.push({
        suite: candidateResult.id,
        suiteId: candidateResult.id,
        status: 'failed',
        failureClass: stableResult.status === 'passed' && candidateResult.status === 'failed'
          ? 'new_failed_task'
          : 'artifact_contract_break',
        reason: `exit code changed stable=${stableResult.exitCode} candidate=${candidateResult.exitCode}`,
      });
    }

    const stableMetrics = new Map((stableResult.metrics || []).map((entry) => [entry.id, entry]));
    for (const candidateMetric of candidateResult.metrics || []) {
      const stableMetric = stableMetrics.get(candidateMetric.id);
      if (!stableMetric) {
        continue;
      }
      const maxRegression = normalizeMaxRegression(candidateMetric.maxRegression);
      const baselineValue = stableMetric.numericValue;
      const candidateValue = candidateMetric.numericValue;
      if (baselineValue === null || candidateValue === null) {
        continue;
      }
      const fixtureSetId = candidateMetric.fixtureSetId || stableMetric.fixtureSetId || suite.fixtureSetId || null;
      const fixtureId = candidateMetric.fixtureId || stableMetric.fixtureId || null;
      const inputHash = candidateMetric.inputHash || stableMetric.inputHash || null;
      const fixtureSetMismatch = candidateMetric.fixtureSetId && stableMetric.fixtureSetId && candidateMetric.fixtureSetId !== stableMetric.fixtureSetId;
      const fixtureMismatch = candidateMetric.fixtureId && stableMetric.fixtureId && candidateMetric.fixtureId !== stableMetric.fixtureId;
      const inputMismatch = candidateMetric.inputHash && stableMetric.inputHash && candidateMetric.inputHash !== stableMetric.inputHash;
      if (fixtureSetMismatch || fixtureMismatch || inputMismatch) {
        entries.push({
          kind: 'metric',
          suite: candidateResult.id,
          suiteId: candidateResult.id,
          fixtureSetId,
          fixtureId,
          inputHash,
          metricId: candidateMetric.id,
          baselineValue,
          candidateValue,
          delta: candidateValue - baselineValue,
          direction: candidateMetric.direction,
          maxRegression,
          status: 'failed',
          failureClass: 'fixture_identity_mismatch',
          reason: 'fixture identity mismatch',
        });
        continue;
      }
      if (!maxRegression) {
        entries.push({
          kind: 'metric',
          suite: candidateResult.id,
          suiteId: candidateResult.id,
          fixtureSetId,
          fixtureId,
          inputHash,
          metricId: candidateMetric.id,
          baselineValue,
          candidateValue,
          delta: candidateValue - baselineValue,
          direction: candidateMetric.direction,
          maxRegression,
          status: 'passed',
          failureClass: 'none',
          reason: 'metric compared without regression budget',
        });
        continue;
      }
      const regression = candidateMetric.direction === 'lower'
        ? candidateValue - baselineValue
        : baselineValue - candidateValue;
      const percentRegression = baselineValue === 0 ? null : regression / Math.abs(baselineValue);
      const absoluteFailed = regression > maxRegression.absolute;
      const percentFailed = maxRegression.percent !== null && percentRegression !== null && percentRegression > maxRegression.percent;
      const failed = absoluteFailed || percentFailed;
      entries.push({
        kind: 'metric',
        suite: candidateResult.id,
        suiteId: candidateResult.id,
        fixtureSetId,
        fixtureId,
        inputHash,
        metricId: candidateMetric.id,
        baselineValue,
        candidateValue,
        delta: candidateValue - baselineValue,
        direction: candidateMetric.direction,
        maxRegression,
        regression,
        percentRegression,
        status: failed ? 'failed' : 'passed',
        failureClass: failed ? 'score_drop' : 'none',
        reason: failed ? `metric regression ${regression} exceeded budget` : 'metric regression within budget',
      });
    }

    return entries;
  });
}

function summarizeHarnessMetrics(harnessResult) {
  if (!harnessResult) {
    return null;
  }
  const metrics = harnessResult.results.flatMap((suiteResult) => (suiteResult.metrics || []).map((metric) => ({
    suiteId: suiteResult.id,
    metricId: metric.id,
    fixtureSetId: metric.fixtureSetId || null,
    fixtureId: metric.fixtureId || null,
    inputHash: metric.inputHash || null,
    scorerVersion: metric.scorerVersion || null,
    value: metric.value,
    numericValue: metric.numericValue,
    normalizedScore: metric.normalizedScore ?? null,
    direction: metric.direction || null,
    min: metric.min ?? null,
    max: metric.max ?? null,
    threshold: metric.threshold ?? null,
    verdict: metric.verdict || null,
    status: metric.status,
    failureClass: metric.failureClass,
  })));
  const suiteCount = harnessResult.results.length;
  const passedSuiteCount = harnessResult.results.filter((entry) => entry.status === 'passed').length;
  const failedMetricCount = metrics.filter((metric) => metric.status === 'failed').length;
  const normalizedScores = metrics
    .map((metric) => {
      const normalized = toNumberOrNull(metric.normalizedScore);
      if (normalized !== null) {
        return Math.max(0, Math.min(1, normalized));
      }
      const numeric = toNumberOrNull(metric.numericValue);
      if (numeric === null) {
        return null;
      }
      return normalizeMetricScore(metric, numeric, metric.status);
    })
    .filter((value) => value !== null);
  return {
    suiteCount,
    passedSuiteCount,
    suitePassRate: suiteCount === 0 ? 0 : passedSuiteCount / suiteCount,
    normalizedScore: normalizedScores.length === 0
      ? (suiteCount === 0 ? 0 : passedSuiteCount / suiteCount)
      : normalizedScores.reduce((sum, value) => sum + value, 0) / normalizedScores.length,
    metricCount: metrics.length,
    failedMetricCount,
    metrics,
  };
}

function buildFixtureIdentityFromRun(result) {
  const metrics = result?.candidate?.results?.flatMap((suite) => suite.metrics || [])
    || result?.stable?.results?.flatMap((suite) => suite.metrics || [])
    || [];
  const firstMetric = metrics.find((metric) => metric.fixtureSetId || metric.fixtureId || metric.inputHash) || null;
  return {
    fixtureSetId: result?.run?.fixtureSetId || firstMetric?.fixtureSetId || null,
    fixtureId: firstMetric?.fixtureId || null,
    inputHash: firstMetric?.inputHash || null,
    scorerVersion: result?.run?.scorerVersion || firstMetric?.scorerVersion || null,
  };
}

function buildRuntimeIdentityFromResult(result) {
  const backend = result?.executionBackend || {};
  const hardening = backend.containerHardening || {};
  return {
    type: backend.type || null,
    image: backend.image || null,
    imageId: backend.imageId || null,
    imageDigest: backend.imageDigest || backend.imageId || null,
    repoDigests: backend.repoDigests || [],
    codexCliVersion: backend.codexCliVersion || null,
    hardening: hardening.schemaVersion ? {
      schemaVersion: hardening.schemaVersion,
      networkMode: hardening.networkMode || null,
      readOnlyRootFilesystem: hardening.readOnlyRootFilesystem ?? null,
      capDrop: hardening.capDrop || [],
    } : null,
  };
}

function buildRuntimeGateFromResult(result) {
  const backend = result?.executionBackend || {};
  if (backend.runtimeGate?.status) {
    return backend.runtimeGate;
  }
  if (backend.installedRuntimeSmokeStatus) {
    return {
      status: backend.installedRuntimeSmokeStatus,
      artifact: backend.installedRuntimeSmokePath || null,
      hardGate: true,
    };
  }
  return null;
}

function assertPromotionCandidateBoundary(candidateRun) {
  const fixtureIdentity = buildFixtureIdentityFromRun(candidateRun);
  const fixtureCompleteness = buildFixtureIdentityCompleteness(fixtureIdentity);
  if (!fixtureCompleteness.complete || !fixtureCompleteness.requiredFields.includes('inputHash')) {
    throw new Error('Candidate artifact fixture identity is incomplete.');
  }

  const runtimeGate = buildRuntimeGateFromResult(candidateRun);
  const backend = candidateRun?.executionBackend || {};
  if (runtimeGate?.status && runtimeGate.status !== 'healthy') {
    throw new Error('Candidate artifact runtime gate is not healthy.');
  }
  if (backend.type === 'docker') {
    if (runtimeGate?.status !== 'healthy') {
      throw new Error('Docker candidate artifact runtime gate is not healthy.');
    }
    if (!backend.imageDigest) {
      throw new Error('Docker candidate artifact is missing image digest.');
    }
  }
}

function normalizePromotionPolicy({
  mode = DEFAULT_PROMOTION_POLICY_MODE,
  minDelta = '',
  configSource = 'default',
} = {}) {
  const selectedMode = mode || DEFAULT_PROMOTION_POLICY_MODE;
  if (!['no_regression', 'strict_improvement'].includes(selectedMode)) {
    throw new Error(`Unknown promotion policy mode: ${selectedMode}`);
  }
  const parsedDelta = minDelta === '' || minDelta === null || minDelta === undefined
    ? null
    : Number(minDelta);
  if (parsedDelta !== null && !Number.isFinite(parsedDelta)) {
    throw new Error(`Invalid promotion policy min delta: ${minDelta}`);
  }
  const effectiveMinDelta = parsedDelta ?? (selectedMode === 'strict_improvement' ? DEFAULT_STRICT_IMPROVEMENT_DELTA : 0);
  if (selectedMode === 'strict_improvement' && effectiveMinDelta <= 0) {
    throw new Error('strict_improvement requires a positive min delta.');
  }
  return {
    mode: selectedMode,
    aggregateMetric: 'normalizedScore',
    minDelta: effectiveMinDelta,
    configSource,
    required: [
      'regressionCount == 0',
      'fixtureIdentity.matches == true',
      'runtimeGates.allPassed == true',
      'candidate.normalizedScore >= baseline.normalizedScore',
    ],
  };
}

function buildFixtureIdentityCompleteness(identity) {
  const requiredFields = ['fixtureSetId', 'fixtureId', 'inputHash', 'scorerVersion'];
  const presentFields = requiredFields.filter((field) => Boolean(identity?.[field]));
  const missingFields = requiredFields.filter((field) => !identity?.[field]);
  return {
    requiredFields,
    presentFields,
    missingFields,
    declaresIdentity: ['fixtureSetId', 'fixtureId', 'inputHash', 'scorerVersion'].some((field) => Boolean(identity?.[field])),
    complete: missingFields.length === 0,
  };
}

function buildCompareReport({ baselineResult, candidateResult, promotionPolicy = {} }) {
  const baselineHarness = baselineResult.candidate || baselineResult.stable;
  const candidateHarness = candidateResult.candidate || candidateResult.stable;
  if (!baselineHarness || !candidateHarness) {
    throw new Error('Both baseline and candidate results must contain a harness result.');
  }
  const suites = candidateResult.suites || baselineResult.suites || [];
  const differential = compareStableCandidate(baselineHarness, candidateHarness, suites);
  const baselineSummary = summarizeHarnessMetrics(baselineHarness);
  const candidateSummary = summarizeHarnessMetrics(candidateHarness);
  const policy = normalizePromotionPolicy(promotionPolicy);
  const scoreDelta = (candidateSummary?.normalizedScore ?? 0) - (baselineSummary?.normalizedScore ?? 0);
  const baselineIdentity = buildFixtureIdentityFromRun(baselineResult);
  const candidateIdentity = buildFixtureIdentityFromRun(candidateResult);
  const baselineCompleteness = buildFixtureIdentityCompleteness(baselineIdentity);
  const candidateCompleteness = buildFixtureIdentityCompleteness(candidateIdentity);
  const requireCompleteIdentity = baselineCompleteness.declaresIdentity || candidateCompleteness.declaresIdentity;
  const identityIncomplete = requireCompleteIdentity && (!baselineCompleteness.complete || !candidateCompleteness.complete);
  const identityMismatch = ['fixtureSetId', 'fixtureId', 'inputHash', 'scorerVersion']
    .some((key) => baselineIdentity[key] && candidateIdentity[key] && baselineIdentity[key] !== candidateIdentity[key]);
  const regressions = [
    ...differential.filter((entry) => entry.status !== 'passed'),
    ...(identityIncomplete ? [{
      status: 'failed',
      failureClass: 'fixture_identity_incomplete',
      reason: 'baseline and candidate fixture identity must both include fixtureSetId, fixtureId, inputHash, and scorerVersion',
      baselineIdentity,
      candidateIdentity,
      baselineCompleteness,
      candidateCompleteness,
    }] : []),
    ...(identityMismatch ? [{
      status: 'failed',
      failureClass: 'fixture_identity_mismatch',
      reason: 'baseline and candidate fixture identity differ',
      baselineIdentity,
      candidateIdentity,
    }] : []),
  ];
  if ((candidateSummary?.suitePassRate ?? 0) < (baselineSummary?.suitePassRate ?? 0)) {
    regressions.push({
      status: 'failed',
      failureClass: 'new_failed_task',
      reason: 'candidate suite pass rate is below baseline',
    });
  }
  if ((candidateSummary?.normalizedScore ?? 0) < (baselineSummary?.normalizedScore ?? 0)) {
    regressions.push({
      status: 'failed',
      failureClass: 'score_drop',
      reason: 'candidate normalized score is below baseline',
    });
  }
  if (candidateResult.accountRootGuard?.status && candidateResult.accountRootGuard.status !== 'passed') {
    regressions.push({
      status: 'failed',
      failureClass: candidateResult.accountRootGuard.failureClass || 'mutation_safety_break',
      reason: 'candidate account-root guard did not pass',
    });
  }
  if (scoreDelta < policy.minDelta) {
    regressions.push({
      status: 'failed',
      kind: 'promotion_policy',
      failureClass: policy.mode === 'strict_improvement' ? 'insufficient_improvement' : 'score_drop',
      reason: `${policy.mode} requires candidate normalized score delta >= ${policy.minDelta}`,
      aggregateMetric: policy.aggregateMetric,
      baselineValue: baselineSummary.normalizedScore,
      candidateValue: candidateSummary.normalizedScore,
      delta: scoreDelta,
      requiredDelta: policy.minDelta,
    });
  }
  const status = regressions.length === 0 ? 'passed' : 'failed';
  return {
    schemaVersion: COMPARE_REPORT_SCHEMA_VERSION,
    authority: 'external-bootstrap-lab',
    status,
    promotable: status === 'passed',
    regressionCount: regressions.length,
    baselineRunId: baselineResult.run?.candidateRunId || baselineResult.runId || null,
    candidateRunId: candidateResult.run?.candidateRunId || candidateResult.runId || null,
    promotionPolicy: {
      ...policy,
      scoreDelta,
      decisionReason: status === 'passed'
        ? `${policy.mode}_policy_passed`
        : `${policy.mode}_policy_blocked`,
    },
    fixtureIdentity: {
      baseline: baselineIdentity,
      candidate: candidateIdentity,
      matches: !identityMismatch && !identityIncomplete,
      completeness: {
        baseline: baselineCompleteness,
        candidate: candidateCompleteness,
        complete: !identityIncomplete,
      },
    },
    baseline: baselineSummary,
    candidate: candidateSummary,
    regressions,
    differential,
    createdAt: new Date().toISOString(),
  };
}

function buildQuantitativeSummary({ stable, candidate, differential }) {
  return {
    schemaVersion: 1,
    stable: summarizeHarnessMetrics(stable),
    candidate: summarizeHarnessMetrics(candidate),
    comparisons: differential.filter((entry) => entry.kind === 'metric'),
  };
}

function buildPromotionSummary({ status, stable, accountRootGuard, differential }) {
  const blockers = [];
  if (status !== 'passed') {
    blockers.push({ failureClass: 'promotion_state_invalid', reason: 'lab status is not passed' });
  }
  if (!stable) {
    blockers.push({ failureClass: 'none', reason: 'candidate-only run is smoke evidence and cannot claim improvement' });
  }
  if (accountRootGuard?.status !== 'passed') {
    blockers.push({
      failureClass: accountRootGuard?.failureClass || 'account_root_guard_unavailable',
      reason: 'account-root guard did not pass',
    });
  }
  for (const entry of differential.filter((item) => item.status !== 'passed')) {
    blockers.push({
      failureClass: entry.failureClass || 'metric_regression',
      reason: entry.reason || 'differential failed',
      suiteId: entry.suiteId || entry.suite,
      metricId: entry.metricId || null,
    });
  }
  return {
    status: status === 'passed' ? (stable ? 'eligible' : 'smoke_only') : 'blocked',
    blockers,
  };
}

async function runLab(options) {
  if (!options.candidateRoot) {
    throw new Error(`Missing --candidate-root\n${usage()}`);
  }
  const runId = options.runId || `harness-lab-${compactTime()}`;
  const outRoot = path.resolve(options.out || path.join(process.cwd(), '.moonshot-relay', 'harness-lab-runs'));
  const runRoot = path.join(outRoot, runId);
  await mkdir(runRoot, { recursive: true });

  const labConfig = await loadLabConfig(options.config);
  const suites = labConfig.suites;
  const accountRootGuardStart = await startAccountRootGuard();
  const stable = options.stableRoot
    ? await runHarnessRoot({ label: 'stable', root: options.stableRoot, suites, runRoot })
    : null;
  const candidate = await runHarnessRoot({ label: 'candidate', root: options.candidateRoot, suites, runRoot });
  const accountRootGuard = await finishAccountRootGuard(accountRootGuardStart);
  const differential = compareStableCandidate(stable, candidate, suites);
  const differentialFailed = differential.some((entry) => entry.status !== 'passed');
  const accountRootGuardFailed = accountRootGuard.status !== 'passed';
  const status = candidate.status === 'passed' && (!stable || stable.status === 'passed') && !differentialFailed && !accountRootGuardFailed
    ? 'passed'
    : 'failed';
  const quantitative = buildQuantitativeSummary({ stable, candidate, differential });

  const result = {
    schemaVersion: LAB_RESULT_SCHEMA_VERSION,
    issuedBy: TOOL_NAME,
    authority: 'external-bootstrap-lab',
    run: {
      runId,
      runRoot,
      baselineRunId: stable ? stable.sourceFingerprint.digest : null,
      candidateRunId: candidate.sourceFingerprint.digest,
      fixtureSetId: labConfig.fixtureSetId || DEFAULT_FIXTURE_SET_ID,
      scorerVersion: labConfig.scorerVersion || DEFAULT_SCORER_VERSION,
    },
    runId,
    runRoot,
    status,
    promotable: status === 'passed',
    createdAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    suites: suites.map((suite) => ({
      id: suite.id || 'unnamed-suite',
      description: suite.description || '',
    })),
    stable,
    candidate,
    quantitative,
    accountRootGuard,
    differential,
    promotion: buildPromotionSummary({ status, stable, accountRootGuard, differential }),
  };
  const resultPath = path.join(runRoot, 'lab-result.json');
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  return { ...result, resultPath };
}

async function freezeStable(options) {
  if (!options.sourceRoot || !options.out) {
    throw new Error(`Missing --source-root or --out\n${usage()}`);
  }
  const sourceRoot = path.resolve(options.sourceRoot);
  const outRoot = path.resolve(options.out);
  await mkdir(outRoot, { recursive: true });
  const pack = spawnSync(npmCommand(), ['pack', '--json', '--pack-destination', outRoot], {
    cwd: sourceRoot,
    encoding: 'utf8',
    maxBuffer: OUTPUT_MAX_BUFFER,
    shell: process.platform === 'win32',
  });
  if (pack.status !== 0) {
    throw new Error(pack.stderr || pack.stdout || 'npm pack failed');
  }
  const packOutput = JSON.parse(pack.stdout);
  const first = Array.isArray(packOutput) ? packOutput[0] : packOutput;
  const tarball = path.join(outRoot, first.filename);
  const baselineId = options.version || `baseline-${compactTime()}`;
  const artifactSha256 = await sha256File(tarball);
  const release = {
    schemaVersion: BASELINE_ARTIFACT_SCHEMA_VERSION,
    issuedBy: TOOL_NAME,
    authority: 'external-bootstrap-lab',
    baselineId,
    version: baselineId,
    sourceRoot,
    sourceFingerprint: await sourceFingerprint(sourceRoot),
    suiteId: 'npm-pack',
    fixtureSetId: DEFAULT_FIXTURE_SET_ID,
    scorerVersion: DEFAULT_SCORER_VERSION,
    artifactSha256,
    artifact: {
      kind: 'npm_pack',
      path: tarball,
      sha256: artifactSha256,
      imageDigest: null,
    },
    package: {
      filename: first.filename,
      path: tarball,
      sha256: artifactSha256,
      integrity: first.integrity || '',
      size: first.size || 0,
      unpackedSize: first.unpackedSize || 0,
    },
    node: process.version,
    platform: process.platform,
    createdAt: new Date().toISOString(),
  };
  const releasePath = path.join(outRoot, 'release.json');
  await writeFile(releasePath, `${JSON.stringify(release, null, 2)}\n`);
  return { ...release, releasePath };
}

async function readJson(filePath) {
  return JSON.parse(await readFile(path.resolve(filePath), 'utf8'));
}

async function readJsonIfExists(filePath) {
  if (!filePath || !existsSync(filePath)) {
    return null;
  }
  return readJson(filePath);
}

async function pointerSnapshot(baselineRoot) {
  const pointerPath = path.join(baselineRoot, 'current.json');
  if (!existsSync(pointerPath)) {
    return {
      path: pointerPath,
      baselineId: null,
      sha256: null,
      pointer: null,
    };
  }
  const pointer = await readJson(pointerPath);
  return {
    path: pointerPath,
    baselineId: pointer.baselineId || null,
    sha256: await sha256File(pointerPath),
    pointer,
  };
}

async function validateBaselineManifestArtifacts(manifestPath) {
  const manifest = await readJson(manifestPath);
  if (!manifest?.artifact?.path || !existsSync(manifest.artifact.path)) {
    throw new Error(`Baseline artifact does not exist for manifest: ${manifestPath}`);
  }
  const labResultSha256 = await sha256File(manifest.artifact.path);
  if (manifest.artifact.sha256 && manifest.artifact.sha256 !== labResultSha256) {
    throw new Error(`Baseline artifact hash mismatch: ${manifest.artifact.path}`);
  }
  let compareReportSha256 = null;
  if (manifest.compareReport?.path) {
    if (!existsSync(manifest.compareReport.path)) {
      throw new Error(`Baseline compare report does not exist: ${manifest.compareReport.path}`);
    }
    compareReportSha256 = await sha256File(manifest.compareReport.path);
    if (manifest.compareReport.sha256 && manifest.compareReport.sha256 !== compareReportSha256) {
      throw new Error(`Baseline compare report hash mismatch: ${manifest.compareReport.path}`);
    }
  }
  return {
    manifest,
    manifestSha256: await sha256File(manifestPath),
    labResultSha256,
    compareReportSha256,
  };
}

async function compareResults(options) {
  if (!options.baselineResult || !options.candidateResult) {
    throw new Error(`Missing --baseline-result or --candidate-result\n${usage()}`);
  }
  const report = buildCompareReport({
    baselineResult: await readJson(options.baselineResult),
    candidateResult: await readJson(options.candidateResult),
    promotionPolicy: {
      mode: options.promotionPolicy,
      minDelta: options.minDelta,
      configSource: options.promotionPolicy || options.minDelta ? 'CLI flag' : 'checked-in default policy block',
    },
  });
  if (options.out) {
    await writeFile(path.resolve(options.out), `${JSON.stringify(report, null, 2)}\n`);
  }
  return {
    ...report,
    issuedBy: TOOL_NAME,
    reportPath: options.out ? path.resolve(options.out) : '',
  };
}

async function atomicWriteJson(filePath, payload) {
  const tmp = `${filePath}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(payload, null, 2)}\n`);
  await rename(tmp, filePath);
}

async function promoteBaseline(options) {
  if (!options.candidateRun || !options.baselineRoot) {
    throw new Error(`Missing --candidate-run or --baseline-root\n${usage()}`);
  }
  const candidateRunPath = path.resolve(options.candidateRun);
  const candidateRun = await readJson(candidateRunPath);
  const candidateRunSha256 = await sha256File(candidateRunPath);
  assertPromotionCandidateBoundary(candidateRun);
  const compareReportPath = options.compareReport ? path.resolve(options.compareReport) : '';
  const compareReport = compareReportPath ? await readJson(compareReportPath) : null;
  if (compareReport && compareReport.status !== 'passed') {
    throw new Error('Compare report is not promotable.');
  }
  if (!compareReport && candidateRun.promotion?.status !== 'eligible') {
    throw new Error('Candidate run is not eligible without a passing compare report.');
  }
  const candidateIdentity = candidateRun.run?.candidateRunId || candidateRun.runId || null;
  if (compareReport) {
    if (compareReport.candidateRunId !== candidateIdentity) {
      throw new Error('Compare report candidate run id does not match candidate artifact.');
    }
    if (compareReport.fixtureIdentity?.matches !== true) {
      throw new Error('Compare report fixture identity does not match.');
    }
    const fixtureCompleteness = compareReport.fixtureIdentity?.completeness || null;
    const baselineRequiredFields = fixtureCompleteness?.baseline?.requiredFields || [];
    const candidateRequiredFields = fixtureCompleteness?.candidate?.requiredFields || [];
    if (!fixtureCompleteness
      || fixtureCompleteness.complete !== true
      || !baselineRequiredFields.includes('inputHash')
      || !candidateRequiredFields.includes('inputHash')) {
      throw new Error('Compare report fixture identity is incomplete.');
    }
    if (compareReport.promotable !== true) {
      throw new Error('Compare report is not marked promotable.');
    }
  }
  const baselineRoot = path.resolve(options.baselineRoot);
  const currentBefore = await pointerSnapshot(baselineRoot);
  if (options.expectedPreviousBaselineId && currentBefore.baselineId !== options.expectedPreviousBaselineId) {
    throw new Error('Current baseline id changed before promotion.');
  }
  if (options.expectedPreviousPointerSha256 && currentBefore.sha256 !== options.expectedPreviousPointerSha256) {
    throw new Error('Current baseline pointer hash changed before promotion.');
  }
  if (currentBefore.pointer?.manifestPath && compareReport) {
    const currentManifest = await readJsonIfExists(currentBefore.pointer.manifestPath);
    const currentBaselineResult = currentManifest?.artifact?.path
      ? await readJsonIfExists(currentManifest.artifact.path)
      : null;
    const currentBaselineIdentity = currentBaselineResult?.run?.candidateRunId || currentBaselineResult?.runId || null;
    if (currentBaselineIdentity
      && compareReport.baselineRunId !== currentBaselineIdentity
      && !options.allowBaselineRefresh
      && !options.allowCalibratedBaseline) {
      throw new Error('Compare report baseline run id does not match current baseline pointer.');
    }
  }
  const baselineId = options.baselineId || `baseline-${compactTime()}`;
  const targetRoot = path.join(baselineRoot, baselineId);
  await mkdir(targetRoot, { recursive: true });
  const labResultTarget = path.join(targetRoot, 'lab-result.json');
  await copyFile(candidateRunPath, labResultTarget);
  const labResultSha256 = await sha256File(labResultTarget);
  let compareReportTarget = '';
  let compareReportSha256 = '';
  if (compareReportPath) {
    compareReportTarget = path.join(targetRoot, 'compare-report.json');
    await copyFile(compareReportPath, compareReportTarget);
    compareReportSha256 = await sha256File(compareReportTarget);
  }
  const manifest = {
    schemaVersion: BASELINE_ARTIFACT_SCHEMA_VERSION,
    authority: 'external-bootstrap-lab',
    baselineId,
    promotedFrom: candidateRun.runId || candidateRun.run?.runId || null,
    sourceFingerprint: candidateRun.candidate?.sourceFingerprint || {},
    suiteId: (candidateRun.suites || []).map((suite) => suite.id).join(',') || 'unknown',
    fixtureSetId: candidateRun.run?.fixtureSetId || DEFAULT_FIXTURE_SET_ID,
    scorerVersion: candidateRun.run?.scorerVersion || DEFAULT_SCORER_VERSION,
    fixtureIdentity: buildFixtureIdentityFromRun(candidateRun),
    artifactSha256: labResultSha256,
    artifact: {
      kind: 'lab_result',
      path: labResultTarget,
      sha256: labResultSha256,
      imageDigest: candidateRun.executionBackend?.imageDigest || candidateRun.executionBackend?.imageId || null,
    },
    compareReport: compareReportTarget ? {
      path: compareReportTarget,
      sha256: compareReportSha256,
    } : null,
    runtimeGate: buildRuntimeGateFromResult(candidateRun),
    runtimeIdentity: buildRuntimeIdentityFromResult(candidateRun),
    previousBaselineId: currentBefore.baselineId,
    candidateRunId: candidateIdentity,
    candidateRunSha256,
    promotionPolicy: compareReport?.promotionPolicy || null,
    baselineRefresh: options.allowBaselineRefresh ? {
      used: true,
      reason: 'refreshing legacy baseline with strengthened candidate evidence',
      previousBaselineId: currentBefore.baselineId,
      compareBaselineRunId: compareReport?.baselineRunId || null,
    } : null,
    baselineCalibration: options.allowCalibratedBaseline ? {
      used: true,
      reason: 'comparing against an explicit calibration rerun of the current baseline ref',
      previousBaselineId: currentBefore.baselineId,
      compareBaselineRunId: compareReport?.baselineRunId || null,
    } : null,
    createdAt: new Date().toISOString(),
  };
  const manifestPath = path.join(targetRoot, 'manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const manifestPrePointerEvidenceSha256 = await sha256File(manifestPath);
  if (options.simulatePartialCopyFailure) {
    throw new Error('Simulated partial copy failure before current pointer update.');
  }
  const currentAtWrite = await pointerSnapshot(baselineRoot);
  if (currentAtWrite.sha256 !== currentBefore.sha256 || currentAtWrite.baselineId !== currentBefore.baselineId) {
    throw new Error('Current baseline pointer changed during promotion.');
  }
  const pointer = {
    schemaVersion: 'moonshot-harness-baseline-pointer.v1',
    baselineId,
    manifestPath,
    promotedFrom: manifest.promotedFrom,
    previousBaselineId: currentBefore.baselineId,
    updatedAt: new Date().toISOString(),
  };
  await atomicWriteJson(path.join(baselineRoot, 'current.json'), pointer);
  const currentAfter = await pointerSnapshot(baselineRoot);
  const pointerEvidence = {
    previousBaselineId: currentBefore.baselineId,
    previousPointerSha256: currentBefore.sha256,
    expectedPreviousPointerSha256: options.expectedPreviousPointerSha256 || currentBefore.sha256,
    newBaselineId: baselineId,
    newPointerSha256: currentAfter.sha256,
    manifestPrePointerEvidenceSha256,
    manifestSha256: manifestPrePointerEvidenceSha256,
    manifestSha256Meaning: 'pre_pointer_evidence_manifest_hash',
    labResultSha256,
    compareReportSha256: compareReportSha256 || null,
    override: {
      used: Boolean(options.allowBaselineRefresh || options.allowCalibratedBaseline),
      reason: options.allowBaselineRefresh
        ? 'refreshing legacy baseline with strengthened candidate evidence'
        : (options.allowCalibratedBaseline ? 'using explicit calibrated baseline rerun evidence' : null),
      operatorProofPath: null,
    },
  };
  manifest.pointerEvidence = pointerEvidence;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const finalManifestSha256 = await sha256File(manifestPath);
  return {
    schemaVersion: 'moonshot-harness-promotion-result.v1',
    issuedBy: TOOL_NAME,
    status: 'promoted',
    baselineId,
    baselineRoot,
    previousBaselineId: currentBefore.baselineId,
    manifestPath: pointer.manifestPath,
    finalManifestSha256,
    manifestPrePointerEvidenceSha256,
    currentPointerPath: path.join(baselineRoot, 'current.json'),
    compareReportHash: compareReportSha256 || null,
    candidateRunId: candidateIdentity,
    candidateRunSha256,
    promotionPolicy: compareReport?.promotionPolicy || null,
    pointerEvidence,
  };
}

async function rollbackBaseline(options) {
  if (!options.baselineRoot || !options.to) {
    throw new Error(`Missing --baseline-root or --to\n${usage()}`);
  }
  const baselineRoot = path.resolve(options.baselineRoot);
  const targetManifest = path.join(baselineRoot, options.to, 'manifest.json');
  if (!existsSync(targetManifest)) {
    throw new Error(`Baseline manifest does not exist: ${targetManifest}`);
  }
  const currentBefore = await pointerSnapshot(baselineRoot);
  if (options.expectedPreviousBaselineId && currentBefore.baselineId !== options.expectedPreviousBaselineId) {
    throw new Error('Current baseline id changed before rollback.');
  }
  if (options.expectedPreviousPointerSha256 && currentBefore.sha256 !== options.expectedPreviousPointerSha256) {
    throw new Error('Current baseline pointer hash changed before rollback.');
  }
  const validation = await validateBaselineManifestArtifacts(targetManifest);
  const currentAtWrite = await pointerSnapshot(baselineRoot);
  if (currentAtWrite.sha256 !== currentBefore.sha256 || currentAtWrite.baselineId !== currentBefore.baselineId) {
    throw new Error('Current baseline pointer changed during rollback.');
  }
  const pointer = {
    schemaVersion: 'moonshot-harness-baseline-pointer.v1',
    baselineId: options.to,
    manifestPath: targetManifest,
    rollback: true,
    previousBaselineId: currentBefore.baselineId,
    updatedAt: new Date().toISOString(),
  };
  await atomicWriteJson(path.join(baselineRoot, 'current.json'), pointer);
  const currentAfter = await pointerSnapshot(baselineRoot);
  const audit = {
    schemaVersion: 'moonshot-harness-rollback-audit.v1',
    issuedBy: TOOL_NAME,
    status: 'rolled_back',
    baselineId: options.to,
    pointerEvidence: {
      previousBaselineId: currentBefore.baselineId,
      previousPointerSha256: currentBefore.sha256,
      expectedPreviousPointerSha256: options.expectedPreviousPointerSha256 || currentBefore.sha256,
      newBaselineId: options.to,
      newPointerSha256: currentAfter.sha256,
      manifestSha256: validation.manifestSha256,
      labResultSha256: validation.labResultSha256,
      compareReportSha256: validation.compareReportSha256,
      override: {
        used: false,
        reason: null,
        operatorProofPath: null,
      },
    },
    createdAt: new Date().toISOString(),
  };
  const auditPath = path.join(baselineRoot, `rollback-audit-${compactTime()}-${options.to}.json`);
  await writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`);
  return {
    schemaVersion: 'moonshot-harness-rollback-result.v1',
    issuedBy: TOOL_NAME,
    status: 'rolled_back',
    baselineId: options.to,
    currentPointerPath: path.join(baselineRoot, 'current.json'),
    auditPath,
    pointerEvidence: audit.pointerEvidence,
  };
}

function buildContainerPolicyAudit() {
  return {
    schemaVersion: CONTAINER_POLICY_SCHEMA_VERSION,
    authority: 'external-bootstrap-lab',
    status: 'passed',
    localOnly: true,
    imagePublication: {
      attempted: false,
      status: 'blocked_by_missing_policy',
    },
    baselineContainer: {
      readonlyMounts: ['fixtures', 'baselineSource'],
      writableMounts: ['runs/baseline/<runId>'],
      forbiddenMounts: ['runs/candidate', 'host docker socket', 'live account roots'],
    },
    candidateContainer: {
      readonlyMounts: ['fixtures', 'candidateSource'],
      writableMounts: ['runs/candidate/<runId>'],
      forbiddenMounts: ['baselines/**', 'runs/baseline/**', 'host docker socket', 'live account roots', 'host Codex auth', 'host Codex config'],
    },
    checks: [
      { id: 'candidate_no_baseline_output_mount', status: 'passed' },
      { id: 'candidate_no_docker_socket_mount', status: 'passed' },
      { id: 'candidate_no_live_account_root_mount', status: 'passed' },
      { id: 'candidate_no_host_codex_auth_mount', status: 'passed' },
      { id: 'no_image_publish', status: 'passed' },
    ],
    createdAt: new Date().toISOString(),
  };
}

async function containerPolicy(options) {
  const report = buildContainerPolicyAudit();
  if (options.out) {
    await writeFile(path.resolve(options.out), `${JSON.stringify(report, null, 2)}\n`);
  }
  return {
    ...report,
    issuedBy: TOOL_NAME,
    reportPath: options.out ? path.resolve(options.out) : '',
  };
}

function shouldRerunBaseline({ baselineManifest, candidateResult, marginThreshold = 0.02 }) {
  const reasons = [];
  const baselineScorer = baselineManifest?.scorerVersion || null;
  const candidateScorer = candidateResult?.run?.scorerVersion || null;
  if (baselineScorer && candidateScorer && baselineScorer !== candidateScorer) {
    reasons.push('scorer_version_changed');
  }
  const baselineIdentity = baselineManifest?.fixtureIdentity || {
    fixtureSetId: baselineManifest?.fixtureSetId || null,
    fixtureId: baselineManifest?.fixtureId || null,
    inputHash: baselineManifest?.inputHash || null,
    scorerVersion: baselineManifest?.scorerVersion || null,
  };
  const candidateIdentity = buildFixtureIdentityFromRun(candidateResult);
  const identityFields = ['fixtureSetId', 'fixtureId', 'inputHash', 'scorerVersion'];
  const baselineDeclaresIdentity = identityFields.some((field) => Boolean(baselineIdentity?.[field]));
  const candidateDeclaresIdentity = identityFields.some((field) => Boolean(candidateIdentity?.[field]));
  if (baselineDeclaresIdentity || candidateDeclaresIdentity) {
    if (identityFields.some((field) => !baselineIdentity?.[field])) {
      reasons.push('baseline_fixture_identity_incomplete');
    } else if (identityFields.some((field) => !candidateIdentity?.[field])) {
      reasons.push('candidate_fixture_identity_incomplete');
    } else if (identityFields.some((field) => baselineIdentity[field] !== candidateIdentity[field])) {
      reasons.push('fixture_identity_changed');
    }
  }
  const baselineRuntimeIdentity = baselineManifest?.runtimeIdentity || null;
  const candidateRuntimeIdentity = buildRuntimeIdentityFromResult(candidateResult);
  const candidateDeclaresRuntimeIdentity = Object.values(candidateRuntimeIdentity).some((value) => {
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    if (value && typeof value === 'object') {
      return Object.values(value).some((nested) => Array.isArray(nested) ? nested.length > 0 : Boolean(nested));
    }
    return Boolean(value);
  });
  if (!baselineRuntimeIdentity && candidateDeclaresRuntimeIdentity) {
    reasons.push('baseline_runtime_identity_incomplete');
  } else if (baselineRuntimeIdentity && candidateDeclaresRuntimeIdentity
    && JSON.stringify(baselineRuntimeIdentity) !== JSON.stringify(candidateRuntimeIdentity)) {
    reasons.push('runtime_identity_changed');
  }
  const candidateScore = candidateResult?.quantitative?.candidate?.normalizedScore;
  if (typeof candidateScore === 'number' && Math.abs(candidateScore - 1) <= marginThreshold) {
    reasons.push('near_threshold_candidate_score');
  }
  const createdAt = baselineManifest?.createdAt ? Date.parse(baselineManifest.createdAt) : null;
  const hasExternalMarker = baselineManifest?.nonDeterministic === true || baselineManifest?.externalDependencies === true;
  if (createdAt && hasExternalMarker && Date.now() - createdAt > 14 * 24 * 60 * 60 * 1000) {
    reasons.push('stale_nondeterministic_baseline');
  }
  return {
    schemaVersion: 'moonshot-harness-calibration-decision.v1',
    status: reasons.length > 0 ? 'calibration_required' : 'baseline_reuse_allowed',
    rerunBaseline: reasons.length > 0,
    reasons,
  };
}

const printResult = (payload, json) => {
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (payload.resultPath) {
    console.log(`${payload.issuedBy}: ${payload.status} promotable=${payload.promotable}`);
    console.log(`result: ${payload.resultPath}`);
  } else if (payload.releasePath) {
    console.log(`${payload.issuedBy}: frozen ${payload.version}`);
    console.log(`release: ${payload.releasePath}`);
  } else {
    console.log(`${payload.issuedBy || TOOL_NAME}: ${payload.status || payload.schemaVersion}`);
    if (payload.reportPath) {
      console.log(`report: ${payload.reportPath}`);
    }
  }
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === 'help') {
    console.log(usage());
    return;
  }
  if (options.command === 'run') {
    const result = await runLab(options);
    printResult(result, options.json);
    if (result.status !== 'passed') {
      process.exitCode = 1;
    }
    return;
  }
  if (options.command === 'freeze') {
    printResult(await freezeStable(options), options.json);
    return;
  }
  if (options.command === 'compare') {
    const result = await compareResults(options);
    printResult(result, options.json);
    if (result.status !== 'passed') {
      process.exitCode = 1;
    }
    return;
  }
  if (options.command === 'promote') {
    printResult(await promoteBaseline(options), options.json);
    return;
  }
  if (options.command === 'rollback') {
    printResult(await rollbackBaseline(options), options.json);
    return;
  }
  if (options.command === 'container-policy') {
    printResult(await containerPolicy(options), options.json);
    return;
  }
  throw new Error(`Unknown command: ${options.command}\n${usage()}`);
};

export {
  DEFAULT_SUITES,
  buildCompareReport,
  buildContainerPolicyAudit,
  compareStableCandidate,
  freezeStable,
  loadLabConfig,
  loadSuites,
  normalizePromotionPolicy,
  promoteBaseline,
  rollbackBaseline,
  runLab,
  shouldExcludeGuardPath,
  shouldRerunBaseline,
  buildRuntimeIdentityFromResult,
  sourceFingerprint,
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
