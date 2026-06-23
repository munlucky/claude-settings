#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  mkdir,
  readFile,
  stat,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TOOL_NAME = 'harness-bootstrap-lab';
const SCHEMA_VERSION = 1;
const DEFAULT_TIMEOUT_MS = 120_000;
const OUTPUT_MAX_BUFFER = 10 * 1024 * 1024;

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

const commandEnvironment = (baseEnv, runRoot, label, suiteEnv = {}) => ({
  ...baseEnv,
  ...suiteEnv,
  MOONSHOT_RELAY_HOME: path.join(runRoot, 'homes', label, 'moonshot-relay'),
  PHASE_RUNTIME_DB: path.join(runRoot, 'homes', label, 'runtime-state.sqlite'),
  NODE_PATH: '',
});

async function runSuite({ suite, repoRoot, runRoot, label }) {
  const suiteId = suite.id || 'unnamed-suite';
  const outputDir = path.join(runRoot, label, suiteId);
  await mkdir(outputDir, { recursive: true });
  const command = expandCommand(suite.command);
  const cwd = path.resolve(repoRoot, suite.cwd || '.');
  const startedAt = new Date().toISOString();
  const result = spawnSync(command[0], command.slice(1), {
    cwd,
    encoding: 'utf8',
    timeout: Number(suite.timeoutMs || DEFAULT_TIMEOUT_MS),
    maxBuffer: OUTPUT_MAX_BUFFER,
    env: commandEnvironment(process.env, runRoot, label, suite.env || {}),
  });
  const endedAt = new Date().toISOString();
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const stdoutPath = path.join(outputDir, 'stdout.txt');
  const stderrPath = path.join(outputDir, 'stderr.txt');
  await writeFile(stdoutPath, stdout);
  await writeFile(stderrPath, stderr);

  const expectedExitCode = Number.isInteger(suite.expectExitCode) ? suite.expectExitCode : 0;
  const exitCode = result.status ?? (result.error ? 1 : 0);
  const timedOut = result.error?.code === 'ETIMEDOUT';
  const passed = !timedOut && exitCode === expectedExitCode;

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
    failureClass: passed ? '' : (timedOut ? 'timeout' : 'command_exit'),
    startedAt,
    endedAt,
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
    const exitCodeMatches = stableResult.exitCode === candidateResult.exitCode;
    if (exitCodeMatches || suite.allowExitCodeChange === true) {
      return [{
        suite: candidateResult.id,
        status: 'passed',
        reason: exitCodeMatches ? 'exit code unchanged' : 'exit code change explicitly allowed',
      }];
    }
    return [{
      suite: candidateResult.id,
      status: 'failed',
      reason: `exit code changed stable=${stableResult.exitCode} candidate=${candidateResult.exitCode}`,
    }];
  });
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
  const stable = options.stableRoot
    ? await runHarnessRoot({ label: 'stable', root: options.stableRoot, suites, runRoot })
    : null;
  const candidate = await runHarnessRoot({ label: 'candidate', root: options.candidateRoot, suites, runRoot });
  const differential = compareStableCandidate(stable, candidate, suites);
  const differentialFailed = differential.some((entry) => entry.status !== 'passed');
  const status = candidate.status === 'passed' && (!stable || stable.status === 'passed') && !differentialFailed
    ? 'passed'
    : 'failed';

  const result = {
    schemaVersion: SCHEMA_VERSION,
    issuedBy: TOOL_NAME,
    authority: 'external-bootstrap-lab',
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
    differential,
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
  sourceFingerprint,
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
