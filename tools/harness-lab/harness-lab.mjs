#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  lstat,
  mkdir,
  readdir,
  readFile,
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
const DEFAULT_TIMEOUT_MS = 120_000;
const OUTPUT_MAX_BUFFER = 10 * 1024 * 1024;
const ACCOUNT_ROOT_HASH_SIZE_CAP = 1024 * 1024;

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
    metrics: [
      { id: 'score', path: 'score', direction: 'higher', min: 1, maxRegression: 0, required: true },
      { id: 'passedCount', path: 'passedCount', direction: 'higher', maxRegression: 0, required: true },
      { id: 'failedCount', path: 'failedCount', direction: 'lower', max: 0, maxRegression: 0, required: true },
      { id: 'totalCount', path: 'totalCount', direction: 'higher', maxRegression: 0, required: true },
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
    json: false,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--json') {
      options.json = true;
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
  if (!configPath) {
    return DEFAULT_SUITES;
  }
  const config = JSON.parse(await readFile(path.resolve(configPath), 'utf8'));
  if (!Array.isArray(config.suites) || config.suites.length === 0) {
    throw new Error('Harness lab config must contain a non-empty suites array.');
  }
  return config.suites;
}

const expandCommand = (command) => {
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
    return part;
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
    || segments.includes('cache')
    || segments.includes('sessions')
    || segments.includes('node_modules')
    || segments.includes('plugins')
    || segments.includes('backups')
    || segments.includes('runtimes')
    || segments.includes('state')
    || segments.includes('projects')
    || segments.includes('todos')
    || segments.includes('shell-snapshots')
    || segments.includes('tasks')
    || segments.includes('teams')
    || segments.includes('session-env')
    || segments.includes('.tmp')
    || segments.includes('tmp')
    || segments.includes('vendor_imports')
    || segments.includes('computer-use-turn-ended')
    || segments.includes('generated_images')
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

async function runSuite({ suite, repoRoot, runRoot, label }) {
  const suiteId = suite.id || 'unnamed-suite';
  const outputDir = path.join(runRoot, label, suiteId);
  await mkdir(outputDir, { recursive: true });
  await mkdir(path.join(runRoot, 'homes', label, 'moonshot-relay'), { recursive: true });
  await mkdir(path.join(runRoot, 'homes', label, 'codex'), { recursive: true });
  await mkdir(path.join(runRoot, 'homes', label, 'claude'), { recursive: true });
  await mkdir(path.join(runRoot, 'homes', label, 'user-home'), { recursive: true });
  await mkdir(path.join(runRoot, 'homes', label, 'userprofile'), { recursive: true });
  const command = expandCommand(suite.command);
  const cwd = path.resolve(repoRoot, suite.cwd || '.');
  const started = new Date();
  const startedAt = started.toISOString();
  const result = spawnSync(command[0], command.slice(1), {
    cwd,
    encoding: 'utf8',
    timeout: Number(suite.timeoutMs || DEFAULT_TIMEOUT_MS),
    maxBuffer: OUTPUT_MAX_BUFFER,
    env: commandEnvironment(process.env, runRoot, label, suite.env || {}),
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
  const results = [];
  for (const suite of suites) {
    results.push(await runSuite({ suite, repoRoot, runRoot, label }));
  }
  return {
    label,
    root: repoRoot,
    sourceFingerprint: fingerprint,
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
      return [{
        suite: candidateResult.id,
        status: 'failed',
        reason: 'stable result missing',
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
        status: 'failed',
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
      const fixtureId = candidateMetric.fixtureId || stableMetric.fixtureId || null;
      const inputHash = candidateMetric.inputHash || stableMetric.inputHash || null;
      const fixtureMismatch = candidateMetric.fixtureId && stableMetric.fixtureId && candidateMetric.fixtureId !== stableMetric.fixtureId;
      const inputMismatch = candidateMetric.inputHash && stableMetric.inputHash && candidateMetric.inputHash !== stableMetric.inputHash;
      if (fixtureMismatch || inputMismatch) {
        entries.push({
          kind: 'metric',
          suite: candidateResult.id,
          suiteId: candidateResult.id,
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
        failureClass: failed ? 'metric_regression' : 'none',
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
    value: metric.value,
    numericValue: metric.numericValue,
    status: metric.status,
    failureClass: metric.failureClass,
  })));
  const suiteCount = harnessResult.results.length;
  const passedSuiteCount = harnessResult.results.filter((entry) => entry.status === 'passed').length;
  const failedMetricCount = metrics.filter((metric) => metric.status === 'failed').length;
  return {
    suiteCount,
    passedSuiteCount,
    suitePassRate: suiteCount === 0 ? 0 : passedSuiteCount / suiteCount,
    metricCount: metrics.length,
    failedMetricCount,
    metrics,
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

  const suites = await loadSuites(options.config);
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
      fixtureSetId: null,
      scorerVersion: null,
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
  });
  if (pack.status !== 0) {
    throw new Error(pack.stderr || pack.stdout || 'npm pack failed');
  }
  const packOutput = JSON.parse(pack.stdout);
  const first = Array.isArray(packOutput) ? packOutput[0] : packOutput;
  const tarball = path.join(outRoot, first.filename);
  const release = {
    schemaVersion: SCHEMA_VERSION,
    issuedBy: TOOL_NAME,
    version: options.version || first.version || compactTime(),
    sourceRoot,
    sourceFingerprint: await sourceFingerprint(sourceRoot),
    package: {
      filename: first.filename,
      path: tarball,
      sha256: await sha256File(tarball),
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

const printResult = (payload, json) => {
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (payload.resultPath) {
    console.log(`${payload.issuedBy}: ${payload.status} promotable=${payload.promotable}`);
    console.log(`result: ${payload.resultPath}`);
  } else {
    console.log(`${payload.issuedBy}: frozen ${payload.version}`);
    console.log(`release: ${payload.releasePath}`);
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
  throw new Error(`Unknown command: ${options.command}\n${usage()}`);
};

export {
  DEFAULT_SUITES,
  compareStableCandidate,
  freezeStable,
  loadSuites,
  runLab,
  shouldExcludeGuardPath,
  sourceFingerprint,
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
