#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { shouldRerunBaseline, sourceFingerprint } from './harness-lab.mjs';

const DEFAULT_STATE_ROOT = '.moonshot-relay/harness-lab';
const DEFAULT_BASELINE_ROOT = `${DEFAULT_STATE_ROOT}/baselines`;
const DEFAULT_RUN_ROOT = `${DEFAULT_STATE_ROOT}/runs`;
const DEFAULT_WORKTREE_ROOT = `${DEFAULT_STATE_ROOT}/worktrees`;
const DEFAULT_ENV_ROOT = `${DEFAULT_STATE_ROOT}/env`;
const DEFAULT_SOURCE_SNAPSHOT_ROOT = `${DEFAULT_STATE_ROOT}/source-snapshots`;
const DEFAULT_CODEX_CLI_CACHE_ROOT = `${DEFAULT_STATE_ROOT}/codex-cli-cache`;
const DEFAULT_PREPARED_WORKSPACE_ROOT = `${DEFAULT_STATE_ROOT}/prepared-workspaces`;
const DEFAULT_DOCKER_IMAGE = 'moonshot-relay-harness-lab:local';
const DEFAULT_CODEX_CLI_VERSION = '0.128.0';
const CONTAINER_SOURCE_ROOT = '/harness-source';
const CONTAINER_WORKSPACE_ROOT = '/workspace';
const CONTAINER_OUTPUT_ROOT = '/harness-run/output';
const CONTAINER_CODEX_CLI_CACHE_ROOT = '/codex-cache';
const CONTAINER_CODEX_AUTH_SOURCE_ROOT = '/codex-auth-source';
const CONTAINER_CODEX_CLI_ROOT = '/harness-codex-cli';
const CONTAINER_PREPARED_ROOT = '/prepared';
const CLOSEOUT_RECEIPT_SCHEMA_VERSION = 'moonshot-harness-lab-closeout-receipt.v1';

const usage = () => `Usage:
  node tools/harness-lab/harness-loop.mjs auto [--backend docker|host] [--baseline-ref <git-ref>] [--candidate-root <dir>] [--promote] [--promotion-policy no_regression|strict_improvement] [--min-delta <number>] [--json]
  node tools/harness-lab/harness-loop.mjs init [--backend docker|host] [--baseline-ref <git-ref>] [--candidate-root <dir>] [--baseline-id <id>] [--json]
  node tools/harness-lab/harness-loop.mjs candidate [--backend docker|host] [--candidate-root <dir>] [--run-id <id>] [--promote] [--promotion-policy no_regression|strict_improvement] [--min-delta <number>] [--json]
  node tools/harness-lab/harness-loop.mjs calibrate [--backend docker|host] [--candidate-root <dir>] [--promote] [--json]
  node tools/harness-lab/harness-loop.mjs refresh-baseline [--backend docker|host] [--candidate-root <dir>] [--json]
  node tools/harness-lab/harness-loop.mjs auth-smoke [--backend docker] [--use-host-codex-auth] [--json]
  node tools/harness-lab/harness-loop.mjs closeout [--run-id <candidate-run-id>] [--json]
  node tools/harness-lab/harness-loop.mjs status [--json]

Initializes and operates the local baseline -> candidate harness loop under .moonshot-relay/harness-lab/.`;

const compactTime = () => new Date().toISOString().replace(/[-:.]/g, '').replace('T', '-').slice(0, 15);
const toPortable = (filePath) => filePath.split(path.sep).join('/');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const sha256File = async (filePath) => sha256(await readFile(filePath));

function parseArgs(argv) {
  const [command = 'status', ...rest] = argv;
  const options = {
    command,
    baselineRef: 'HEAD',
    candidateRoot: '.',
    baselineId: '',
    runId: '',
    promote: false,
    json: false,
    backend: 'docker',
    dockerImage: DEFAULT_DOCKER_IMAGE,
    codexCliVersion: DEFAULT_CODEX_CLI_VERSION,
    useHostCodexAuth: false,
    codexDevSmoke: false,
    dockerNetwork: '',
    promotionPolicy: 'no_regression',
    minDelta: '',
    lifecyclePath: '',
    calibrationCheck: false,
  };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--promote') {
      options.promote = true;
    } else if (arg === '--use-host-codex-auth') {
      options.useHostCodexAuth = true;
    } else if (arg === '--codex-dev-smoke') {
      options.codexDevSmoke = true;
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
  if (options.codexDevSmoke && !options.useHostCodexAuth) {
    throw new Error('--codex-dev-smoke requires --use-host-codex-auth');
  }
  if (['candidate', 'auto', 'init', 'calibrate', 'refresh-baseline'].includes(options.command)
    && (options.useHostCodexAuth || options.codexDevSmoke)) {
    throw new Error('Candidate benchmark commands must not mount host Codex auth. Run npm run lab:auth-smoke separately.');
  }
  if (options.command === 'auth-smoke') {
    options.useHostCodexAuth = true;
    options.codexDevSmoke = true;
  }
  return options;
}

function run(command, args, { cwd = process.cwd(), env = process.env, expect = 0 } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    shell: process.platform === 'win32' && /\.(cmd|bat)$/i.test(command),
  });
  const exitCode = result.status ?? (result.error ? 1 : 0);
  if (expect !== null && exitCode !== expect) {
    throw new Error(result.stderr || result.stdout || result.error?.message || `${command} exited ${exitCode}`);
  }
  return result;
}

const npmCommand = () => (process.platform === 'win32' ? 'npm.cmd' : 'npm');

function nodeArgs(script, args) {
  return [script, ...args];
}

function loopEnv(runId) {
  const envRoot = path.resolve(DEFAULT_ENV_ROOT, runId);
  return {
    ...process.env,
    MOONSHOT_RELAY_HOME: path.join(envRoot, 'moonshot-relay'),
    CODEX_HOME: path.join(envRoot, 'codex'),
    CLAUDE_HOME: path.join(envRoot, 'claude'),
  };
}

function dockerAvailable() {
  const result = spawnSync('docker', ['--version'], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  return {
    available: result.status === 0,
    version: result.stdout.trim(),
    error: result.status === 0 ? '' : (result.stderr || result.error?.message || 'docker command failed'),
  };
}

function assertDockerAvailable() {
  const probe = dockerAvailable();
  if (!probe.available) {
    throw new Error(`Docker backend requested but Docker is unavailable: ${probe.error}`);
  }
  return probe;
}

function dockerContainerName(role, runId) {
  return `moonshot-harness-${role}-${runId}`.replace(/[^a-zA-Z0-9_.-]/g, '-').slice(0, 120);
}

function dockerMountPath(hostPath) {
  return path.resolve(hostPath);
}

function shouldExcludeSourceSnapshotPath(relativePath) {
  const normalized = toPortable(relativePath);
  if (!normalized || normalized === '.') {
    return false;
  }
  const segments = normalized.split('/');
  const fileName = segments.at(-1) || '';
  return segments.includes('.git')
    || segments.includes('.moonshot-relay')
    || segments.includes('node_modules')
    || normalized === 'package/claude/profile'
    || normalized.startsWith('package/claude/profile/')
    || normalized === 'package/codex/profile'
    || normalized.startsWith('package/codex/profile/')
    || normalized.endsWith('.sqlite')
    || normalized.endsWith('.sqlite-shm')
    || normalized.endsWith('.sqlite-wal')
    || normalized.endsWith('.tgz')
    || fileName === '.DS_Store';
}

async function prepareDockerSourceSnapshot({ sourceRoot, role, runId }) {
  const source = path.resolve(sourceRoot);
  const snapshotRoot = path.resolve(DEFAULT_SOURCE_SNAPSHOT_ROOT, `${runId}-${role}`);
  await rm(snapshotRoot, { recursive: true, force: true });
  await mkdir(snapshotRoot, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    if (shouldExcludeSourceSnapshotPath(entry.name)) {
      continue;
    }
    await cp(path.join(source, entry.name), path.join(snapshotRoot, entry.name), {
      recursive: true,
      force: true,
      filter: (sourcePath) => {
        const relativePath = path.relative(source, sourcePath);
        return !shouldExcludeSourceSnapshotPath(relativePath);
      },
    });
  }
  const h0SupportFiles = [
    'tools/harness-lab/codex-cli-smoke.mjs',
  ];
  for (const relativePath of h0SupportFiles) {
    const snapshotPath = path.join(snapshotRoot, relativePath);
    const controllerPath = path.resolve(relativePath);
    if (!existsSync(snapshotPath) && existsSync(controllerPath)) {
      await mkdir(path.dirname(snapshotPath), { recursive: true });
      await cp(controllerPath, snapshotPath, { force: true });
    }
  }
  return snapshotRoot;
}

function codexCliTarballNames(version = DEFAULT_CODEX_CLI_VERSION) {
  return {
    cli: `openai-codex-${version}.tgz`,
    linuxX64: `openai-codex-${version}-linux-x64.tgz`,
  };
}

function dockerScript(runId, {
  useHostCodexAuth = false,
  codexDevSmoke = false,
  runHarnessLab = true,
} = {}) {
  const escapedRunId = runId.replace(/'/g, `'\\''`);
  const runHomeRoot = `/harness-run/homes/${escapedRunId}/candidate`;
  const moonshotHome = `${runHomeRoot}/moonshot-relay`;
  const codexHome = `${runHomeRoot}/codex`;
  const claudeHome = `${runHomeRoot}/claude`;
  const userHome = `${runHomeRoot}/user-home`;
  const userProfile = `${runHomeRoot}/userprofile`;
  const runtimeDb = `${runHomeRoot}/runtime-state.sqlite`;
  const codexDevSmokeWorkDir = `${CONTAINER_OUTPUT_ROOT}/${escapedRunId}/codex-dev-smoke-work`;
  const codexDevSmokeLogPath = `${CONTAINER_OUTPUT_ROOT}/${escapedRunId}/codex-dev-smoke.log`;
  const codexDevSmokeJsonPath = `${CONTAINER_OUTPUT_ROOT}/${escapedRunId}/codex-dev-smoke.json`;
  const codexBin = `${CONTAINER_CODEX_CLI_ROOT}/node_modules/.bin/codex`;
  return [
    'set -eu',
    'test -d /workspace/node_modules',
    `test -x '${codexBin}'`,
    'cd /workspace',
    `mkdir -p '${CONTAINER_OUTPUT_ROOT}/${escapedRunId}' '${moonshotHome}' '${codexHome}' '${claudeHome}' '${userHome}' '${userProfile}'`,
    `export PATH='${CONTAINER_CODEX_CLI_ROOT}/node_modules/.bin':$PATH`,
    `export HARNESS_LAB_CODEX_BIN='${codexBin}'`,
    `codex --version > '${CONTAINER_OUTPUT_ROOT}/${escapedRunId}/codex-cli-version.txt'`,
    `node bin/moonshot-relay.mjs install --runtime all --moonshot-home '${moonshotHome}' --codex-home '${codexHome}' --claude-home '${claudeHome}' --json > '${CONTAINER_OUTPUT_ROOT}/${escapedRunId}/install-result.json'`,
    useHostCodexAuth
      ? `cp '${CONTAINER_CODEX_AUTH_SOURCE_ROOT}/auth.json' '${codexHome}/auth.json' && chmod 600 '${codexHome}/auth.json'`
      : '',
    useHostCodexAuth
      ? `awk 'BEGIN{in_root=1} /^\\[/{in_root=0} in_root && /^[[:space:]]*(model|model_provider|model_reasoning_effort)[[:space:]]*=/{print}' '${CONTAINER_CODEX_AUTH_SOURCE_ROOT}/config.toml' > '${codexHome}/config.toml' && cat package/profile-templates/codex/.codex/config.toml >> '${codexHome}/config.toml'`
      : `if [ ! -f '${codexHome}/config.toml' ] && [ -f package/profile-templates/codex/.codex/config.toml ]; then cp package/profile-templates/codex/.codex/config.toml '${codexHome}/config.toml'; fi`,
    `export MOONSHOT_RELAY_HOME='${moonshotHome}'`,
    `export CODEX_HOME='${codexHome}'`,
    `export CLAUDE_HOME='${claudeHome}'`,
    `export HOME='${userHome}'`,
    `export USERPROFILE='${userProfile}'`,
    `export PHASE_RUNTIME_DB='${runtimeDb}'`,
    "export NODE_PATH='/workspace/node_modules'",
    "export HARNESS_LAB_REQUIRE_CODEX_CONFIG='1'",
    useHostCodexAuth ? "export HARNESS_LAB_REQUIRE_CODEX_AUTH='1'" : '',
    "export HARNESS_LAB_SKIP_NESTED_CODEX_SMOKE='1'",
    `node '${moonshotHome}/scripts/runtime-state.mjs' status --json > '${CONTAINER_OUTPUT_ROOT}/${escapedRunId}/installed-runtime-smoke.json'`,
    `node tools/harness-lab/codex-cli-smoke.mjs --out '${CONTAINER_OUTPUT_ROOT}/${escapedRunId}/codex-cli-smoke.json'`,
    codexDevSmoke
      ? [
        `mkdir -p '${codexDevSmokeWorkDir}'`,
        '(',
        `cd '${codexDevSmokeWorkDir}'`,
        'set +e',
        `timeout 180s '${codexBin}' exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox 'Create a file named codex-smoke.txt containing exactly ok and no other text.' > '${codexDevSmokeLogPath}' 2>&1`,
        'codex_dev_smoke_exit_code=$?',
        'set -e',
        'codex_dev_smoke_content=""',
        'if [ -f codex-smoke.txt ]; then codex_dev_smoke_content="$(tr -d \'\\r\\n\' < codex-smoke.txt)"; fi',
        `node - "$codex_dev_smoke_exit_code" "$codex_dev_smoke_content" '${codexDevSmokeJsonPath}' '${codexDevSmokeLogPath}' <<'NODE'`,
        'const fs = require("fs");',
        'const [exitCodeRaw, fileContent, outPath, logPath] = process.argv.slice(2);',
        'const exitCode = Number(exitCodeRaw);',
        'const status = exitCode === 0 && fileContent === "ok" ? "passed" : "failed";',
        'fs.writeFileSync(outPath, `${JSON.stringify({',
        '  schemaVersion: "moonshot-harness-codex-dev-smoke.v1",',
        '  status,',
        '  criterion: "model-backed-codex-exec-can-write-in-container-workspace",',
        '  command: "codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox <redacted prompt>",',
        '  exitCode,',
        '  expectedFile: "codex-smoke.txt",',
        '  expectedContent: "ok",',
        '  actualContent: fileContent,',
        '  logPath,',
        '  authPolicy: "host auth copied only into ephemeral CODEX_HOME in separate auth-smoke stage",',
        '  sandboxPolicy: "approval and sandbox bypass is used only for this container-local development smoke",',
        '}, null, 2)}\\n`);',
        'if (status !== "passed") process.exit(1);',
        'NODE',
        ')',
      ].join('\n')
      : '',
    runHarnessLab
      ? `node tools/harness-lab/harness-lab.mjs run --candidate-root /workspace --out /harness-run/output --run-id '${escapedRunId}' --json`
      : `node -e "require('fs').writeFileSync('${CONTAINER_OUTPUT_ROOT}/${escapedRunId}/auth-smoke-summary.json', JSON.stringify({ schemaVersion: 'moonshot-harness-auth-smoke-summary.v1', status: 'passed', runId: '${escapedRunId}', stage: 'auth_smoke', candidateBenchmarkRun: false }, null, 2) + '\\n')"`,
  ].filter(Boolean).join('\n');
}

function prepareDockerScript({ codexCliVersion = DEFAULT_CODEX_CLI_VERSION } = {}) {
  const tarballs = codexCliTarballNames(codexCliVersion);
  return [
    'set -eu',
    `rm -rf '${CONTAINER_PREPARED_ROOT}/workspace' '${CONTAINER_PREPARED_ROOT}/codex-cli' '${CONTAINER_PREPARED_ROOT}/home'`,
    `mkdir -p '${CONTAINER_PREPARED_ROOT}/workspace' '${CONTAINER_PREPARED_ROOT}/codex-cli' '${CONTAINER_PREPARED_ROOT}/home'`,
    `tar --exclude="./node_modules" --exclude="./.moonshot-relay" -C '${CONTAINER_SOURCE_ROOT}' -cf - . | tar -C '${CONTAINER_PREPARED_ROOT}/workspace' -xf -`,
    `cd '${CONTAINER_PREPARED_ROOT}/workspace'`,
    'npm ci --no-audit --no-fund',
    `npm install --prefix '${CONTAINER_PREPARED_ROOT}/codex-cli' '${CONTAINER_CODEX_CLI_CACHE_ROOT}/${tarballs.cli}' '@openai/codex-linux-x64@file:${CONTAINER_CODEX_CLI_CACHE_ROOT}/${tarballs.linuxX64}' --no-audit --no-fund`,
    `'${CONTAINER_PREPARED_ROOT}/codex-cli/node_modules/.bin/codex' --version > '${CONTAINER_PREPARED_ROOT}/codex-cli-version.txt'`,
  ].join('\n');
}

function dockerRunHardeningArgs({ networkMode = 'none', readOnlyRootFilesystem = true } = {}) {
  return [
    '--init',
    ...(readOnlyRootFilesystem ? ['--read-only'] : []),
    '--cap-drop',
    'ALL',
    '--cap-add',
    'CHOWN',
    '--cap-add',
    'FOWNER',
    '--security-opt',
    'no-new-privileges',
    '--pids-limit',
    '512',
    '--tmpfs',
    '/tmp:rw,nosuid,nodev,size=512m',
    '--tmpfs',
    '/harness-run/homes:rw,exec,nosuid,nodev,size=1024m',
    '--network',
    networkMode,
  ];
}

function dockerRunHardeningPolicy({
  networkMode = 'none',
  readOnlyRootFilesystem = true,
  codexDevSmoke = false,
  explicitNetworkOverride = false,
} = {}) {
  return {
    schemaVersion: 'moonshot-harness-docker-hardening.v1',
    init: true,
    readOnlyRootFilesystem,
    capDrop: ['ALL'],
    capAdd: ['CHOWN', 'FOWNER'],
    noNewPrivileges: true,
    pidsLimit: 512,
    tmpfs: [
      '/tmp:rw,nosuid,nodev,size=512m',
      '/harness-run/homes:rw,exec,nosuid,nodev,size=1024m',
    ],
    networkMode,
    networkIsolation: networkMode === 'none',
    networkIsolationReason: networkMode === 'none'
      ? 'default strict run uses --network none; dependency and Codex CLI installation happen in a separate prepare container'
      : (codexDevSmoke
        ? 'model-backed codex exec smoke requires outbound network and is opt-in'
        : (explicitNetworkOverride ? 'operator supplied --docker-network override' : 'network enabled by explicit run policy')),
    readOnlyRootFilesystemReason: readOnlyRootFilesystem
      ? 'strict run mounts prepared workspace and Codex CLI read-only; mutable state is redirected to output or tmpfs mounts; homes tmpfs allows native runtime modules to load'
      : 'disabled by run policy',
    preparePhase: {
      networkMode: 'default',
      readOnlyRootFilesystem: false,
      purpose: 'copy source snapshot, run npm ci, and install Codex CLI before strict evaluation',
    },
  };
}

function buildCandidateSummaryArtifact(summary, { createdAt = new Date().toISOString() } = {}) {
  return {
    schemaVersion: 'moonshot-harness-loop-candidate-summary.v1',
    createdAt,
    status: summary.status,
    promotable: summary.promotable,
    lifecyclePath: summary.lifecyclePath || 'candidate_only',
    previousBaselineId: summary.previousBaselineId,
    backend: summary.backend,
    runId: summary.runId,
    candidateResultPath: summary.candidateResultPath,
    compareReportPath: summary.compareReportPath,
    promotionPolicy: summary.promotionPolicy || null,
    calibration: summary.calibration || null,
    closeoutReceiptPath: summary.closeoutReceiptPath || null,
    promotion: summary.promotion
      ? {
        status: summary.promotion.status || null,
        baselineId: summary.promotion.baselineId || null,
        manifestPath: summary.promotion.manifestPath || null,
        currentPointerPath: summary.promotion.currentPointerPath || null,
      }
      : null,
  };
}

async function writeCandidateSummaryArtifact(summary) {
  const summaryPath = path.join(path.resolve(DEFAULT_RUN_ROOT), summary.runId, 'candidate-summary.json');
  await mkdir(path.dirname(summaryPath), { recursive: true });
  const payload = buildCandidateSummaryArtifact(summary);
  await writeFile(summaryPath, `${JSON.stringify(payload, null, 2)}\n`);
  return summaryPath;
}

async function readJsonIfExists(filePath) {
  if (!filePath || !existsSync(filePath)) {
    return null;
  }
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function fixtureIdentityFromLabResult(result) {
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

function fixtureIdentityCompleteness(identity) {
  const requiredFields = ['fixtureSetId', 'fixtureId', 'inputHash', 'scorerVersion'];
  const missingFields = requiredFields.filter((field) => !identity?.[field]);
  return {
    requiredFields,
    missingFields,
    complete: missingFields.length === 0,
  };
}

function runtimeGateFromLabResult(result) {
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

function compareFixtureIdentityComplete(compareReport) {
  const completeness = compareReport?.fixtureIdentity?.completeness || null;
  const baselineRequiredFields = completeness?.baseline?.requiredFields || [];
  const candidateRequiredFields = completeness?.candidate?.requiredFields || [];
  return Boolean(completeness
    && completeness.complete === true
    && baselineRequiredFields.includes('inputHash')
    && candidateRequiredFields.includes('inputHash'));
}

async function normalizeCalibrationBaselineFixtureIdentity({ resultPath, manifest }) {
  const result = await readJsonIfExists(resultPath);
  const manifestIdentity = manifest?.fixtureIdentity || null;
  const manifestCompleteness = fixtureIdentityCompleteness(manifestIdentity);
  const resultCompleteness = fixtureIdentityCompleteness(fixtureIdentityFromLabResult(result));
  if (!result || resultCompleteness.complete || !manifestCompleteness.complete) {
    return {
      resultPath,
      normalized: false,
      reason: resultCompleteness.complete ? 'baseline_result_already_complete' : 'manifest_fixture_identity_unavailable',
    };
  }

  const normalized = structuredClone(result);
  normalized.run = {
    ...(normalized.run || {}),
    fixtureSetId: normalized.run?.fixtureSetId || manifestIdentity.fixtureSetId,
    scorerVersion: normalized.run?.scorerVersion || manifestIdentity.scorerVersion,
  };
  const suites = normalized.candidate?.results || normalized.stable?.results || [];
  for (const suite of suites) {
    for (const metric of suite.metrics || []) {
      metric.fixtureSetId = metric.fixtureSetId || manifestIdentity.fixtureSetId;
      metric.fixtureId = metric.fixtureId || manifestIdentity.fixtureId;
      metric.inputHash = metric.inputHash || manifestIdentity.inputHash;
      metric.scorerVersion = metric.scorerVersion || manifestIdentity.scorerVersion;
    }
  }
  normalized.calibrationFixtureIdentityNormalization = {
    schemaVersion: 'moonshot-harness-calibration-fixture-normalization.v1',
    source: 'current_baseline_manifest',
    fixtureIdentity: manifestIdentity,
    originalResultPath: resultPath,
    createdAt: new Date().toISOString(),
  };

  const normalizedPath = path.join(path.dirname(resultPath), 'lab-result.fixture-normalized.json');
  await writeFile(normalizedPath, `${JSON.stringify(normalized, null, 2)}\n`);
  return {
    resultPath: normalizedPath,
    normalized: true,
    originalResultPath: resultPath,
    fixtureIdentity: manifestIdentity,
  };
}

function buildBaselineRefreshReadiness({ manifest, labResult = null, compareReport = null } = {}) {
  const reasons = [];
  if (!manifest?.promotionPolicy) {
    reasons.push('missing_promotion_policy');
  }
  if (manifest?.runtimeGate?.status !== 'healthy') {
    reasons.push('missing_or_unhealthy_runtime_gate');
  }
  if (!manifest?.runtimeIdentity) {
    reasons.push('missing_runtime_identity');
  } else if (!manifest.runtimeIdentity.imageDigest) {
    reasons.push('missing_runtime_image_digest');
  }
  if (manifest?.runtimeIdentity && !manifest?.artifact?.imageDigest) {
    reasons.push('missing_artifact_image_digest');
  }
  if (!manifest?.candidateRunSha256) {
    reasons.push('missing_candidate_run_hash');
  }
  if (!manifest?.compareReport?.sha256) {
    reasons.push('missing_compare_report_hash');
  }
  const pointerEvidence = manifest?.pointerEvidence || {};
  for (const field of ['newPointerSha256', 'manifestSha256', 'labResultSha256', 'compareReportSha256']) {
    if (!pointerEvidence[field]) {
      reasons.push(`missing_pointer_evidence_${field}`);
    }
  }
  const manifestIdentity = manifest?.fixtureIdentity || fixtureIdentityFromLabResult(labResult);
  const manifestIdentityCompleteness = fixtureIdentityCompleteness(manifestIdentity);
  if (!manifestIdentityCompleteness.complete) {
    reasons.push('baseline_fixture_identity_incomplete');
  }
  const compareCompleteness = compareReport?.fixtureIdentity?.completeness || null;
  const compareRequiredFields = [
    ...(compareCompleteness?.baseline?.requiredFields || []),
    ...(compareCompleteness?.candidate?.requiredFields || []),
  ];
  if (compareReport && !compareRequiredFields.includes('inputHash')) {
    reasons.push('compare_report_uses_legacy_fixture_identity_contract');
  } else if (compareReport?.fixtureIdentity?.completeness?.complete === false) {
    reasons.push('compare_report_fixture_identity_incomplete');
  }
  return {
    schemaVersion: 'moonshot-harness-baseline-refresh-readiness.v1',
    refreshRequired: reasons.length > 0,
    reasons,
    fixtureIdentity: {
      identity: manifestIdentity,
      completeness: manifestIdentityCompleteness,
    },
  };
}

async function currentPointerSnapshot(baselineRoot = DEFAULT_BASELINE_ROOT) {
  const pointerPath = path.resolve(baselineRoot, 'current.json');
  if (!existsSync(pointerPath)) {
    return { baselineId: null, sha256: null, path: pointerPath, pointer: null };
  }
  const pointer = JSON.parse(await readFile(pointerPath, 'utf8'));
  return {
    baselineId: pointer.baselineId || null,
    sha256: await sha256File(pointerPath),
    path: pointerPath,
    pointer,
  };
}

async function buildCloseoutReceipt({
  status,
  decisionReason,
  blockingGates = [],
  runId,
  candidateResultPath = '',
  compareReportPath = '',
  promotion = null,
  previousBaselineId = null,
  promotionPolicy = null,
  calibration = null,
  pointerBefore = null,
  pointerAfter = null,
}) {
  const candidateRun = await readJsonIfExists(candidateResultPath);
  const compareReport = await readJsonIfExists(compareReportPath);
  const runtimeGate = candidateRun?.executionBackend?.installedRuntimeSmokeStatus
    ? {
      status: candidateRun.executionBackend.installedRuntimeSmokeStatus,
      artifact: candidateRun.executionBackend.installedRuntimeSmokePath || null,
    }
    : { status: 'not_recorded', artifact: null };
  const receipt = {
    schemaVersion: CLOSEOUT_RECEIPT_SCHEMA_VERSION,
    status,
    decisionReason,
    blockingGates,
    baselineId: promotion?.baselineId || pointerAfter?.baselineId || previousBaselineId,
    previousBaselineId,
    baselinePointerBefore: pointerBefore,
    baselinePointerAfter: pointerAfter,
    candidateResultPath,
    candidateRunId: candidateRun?.run?.candidateRunId || candidateRun?.runId || runId,
    candidateRunSha256: candidateResultPath && existsSync(candidateResultPath) ? await sha256File(candidateResultPath) : null,
    compareReportPath,
    compareReportSha256: compareReportPath && existsSync(compareReportPath) ? await sha256File(compareReportPath) : null,
    promotionPolicy: promotionPolicy || compareReport?.promotionPolicy || null,
    promotionStatus: promotion?.status || null,
    promotionManifestPath: promotion?.manifestPath || null,
    promotionCurrentPointerPath: promotion?.currentPointerPath || null,
    runtimeGate,
    calibrationStatus: calibration?.status || 'not_required',
    calibration,
    sourceFingerprint: candidateRun?.candidate?.sourceFingerprint || null,
    nextAction: status === 'promoted_ready_for_commit_workflow'
      ? 'run explicit commit workflow if source changes should be committed'
      : (status === 'calibration_required'
        ? 'run npm run lab:calibrate before promotion'
        : (String(decisionReason || '').includes('promotion_not_requested')
          ? 'run an explicit promote command if this passing candidate should become the next baseline'
          : 'fix candidate or policy blockers and rerun the lab')),
    createdAt: new Date().toISOString(),
  };
  return receipt;
}

async function writeCloseoutReceipt(runId, receipt) {
  const receiptPath = path.join(path.resolve(DEFAULT_RUN_ROOT), runId, 'lab-closeout-receipt.json');
  await mkdir(path.dirname(receiptPath), { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  return receiptPath;
}

function addCloseoutCheck(checks, id, passed, detail = {}) {
  checks.push({
    id,
    status: passed ? 'passed' : 'failed',
    ...detail,
  });
}

async function revalidateCloseoutReceipt(receipt, {
  receiptPath = '',
  sourceRoot = process.cwd(),
  baselineRoot = DEFAULT_BASELINE_ROOT,
} = {}) {
  const checks = [];
  addCloseoutCheck(
    checks,
    'receipt_status_promoted',
    receipt.status === 'promoted_ready_for_commit_workflow',
    { actual: receipt.status },
  );
  const pointer = await currentPointerSnapshot(baselineRoot);
  addCloseoutCheck(checks, 'current_pointer_baseline_matches_receipt', pointer.baselineId === receipt.baselineId, {
    expected: receipt.baselineId,
    actual: pointer.baselineId,
  });
  addCloseoutCheck(checks, 'current_pointer_sha_matches_receipt', pointer.sha256 === receipt.baselinePointerAfter?.sha256, {
    expected: receipt.baselinePointerAfter?.sha256 || null,
    actual: pointer.sha256,
  });

  const currentPointer = pointer.pointer;
  const manifest = await readBaselineManifest(currentPointer);
  const manifestPath = currentPointer?.manifestPath || receipt.promotionManifestPath || '';
  addCloseoutCheck(checks, 'promotion_manifest_exists', Boolean(manifest && manifestPath && existsSync(manifestPath)), {
    manifestPath,
  });
  addCloseoutCheck(checks, 'manifest_candidate_hash_matches_receipt', manifest?.candidateRunSha256 === receipt.candidateRunSha256, {
    expected: receipt.candidateRunSha256 || null,
    actual: manifest?.candidateRunSha256 || null,
  });
  addCloseoutCheck(checks, 'manifest_compare_hash_matches_receipt', manifest?.compareReport?.sha256 === receipt.compareReportSha256, {
    expected: receipt.compareReportSha256 || null,
    actual: manifest?.compareReport?.sha256 || null,
  });

  const candidateArtifactPath = manifest?.artifact?.path || receipt.candidateResultPath || '';
  const candidateArtifactSha = candidateArtifactPath && existsSync(candidateArtifactPath)
    ? await sha256File(candidateArtifactPath)
    : null;
  const candidateArtifact = candidateArtifactPath && existsSync(candidateArtifactPath)
    ? await readJsonIfExists(candidateArtifactPath)
    : null;
  addCloseoutCheck(checks, 'candidate_artifact_hash_matches_receipt', candidateArtifactSha === receipt.candidateRunSha256, {
    artifactPath: candidateArtifactPath || null,
    expected: receipt.candidateRunSha256 || null,
    actual: candidateArtifactSha,
  });

  const comparePath = manifest?.compareReport?.path || receipt.compareReportPath || '';
  const compareSha = comparePath && existsSync(comparePath) ? await sha256File(comparePath) : null;
  const compareReport = comparePath && existsSync(comparePath) ? await readJsonIfExists(comparePath) : null;
  addCloseoutCheck(checks, 'compare_report_hash_matches_receipt', compareSha === receipt.compareReportSha256, {
    comparePath: comparePath || null,
    expected: receipt.compareReportSha256 || null,
    actual: compareSha,
  });

  const artifactRuntimeGate = manifest?.runtimeGate || runtimeGateFromLabResult(candidateArtifact);
  addCloseoutCheck(checks, 'runtime_gate_healthy', artifactRuntimeGate?.status === 'healthy', {
    actual: artifactRuntimeGate?.status || null,
    source: manifest?.runtimeGate ? 'manifest' : 'candidate_artifact',
  });
  addCloseoutCheck(checks, 'runtime_gate_matches_receipt', artifactRuntimeGate?.status === receipt.runtimeGate?.status, {
    expected: artifactRuntimeGate?.status || null,
    actual: receipt.runtimeGate?.status || null,
  });

  const artifactFixtureIdentity = manifest?.fixtureIdentity || fixtureIdentityFromLabResult(candidateArtifact);
  const artifactFixtureCompleteness = fixtureIdentityCompleteness(artifactFixtureIdentity);
  addCloseoutCheck(checks, 'fixture_identity_complete', artifactFixtureCompleteness.complete === true, {
    identity: artifactFixtureIdentity,
    missingFields: artifactFixtureCompleteness.missingFields,
  });
  addCloseoutCheck(checks, 'compare_fixture_identity_complete', compareFixtureIdentityComplete(compareReport), {
    complete: compareReport?.fixtureIdentity?.completeness?.complete ?? null,
  });

  const manifestImageDigest = manifest?.runtimeIdentity?.imageDigest || null;
  const manifestArtifactImageDigest = manifest?.artifact?.imageDigest || null;
  const candidateImageDigest = candidateArtifact?.executionBackend?.imageDigest || null;
  const dockerIdentityRequired = [
    manifest?.runtimeIdentity?.type,
    candidateArtifact?.executionBackend?.type,
  ].includes('docker');
  const imageDigests = [
    manifestImageDigest,
    manifestArtifactImageDigest,
    candidateImageDigest,
  ].filter(Boolean);
  addCloseoutCheck(checks, 'docker_image_digest_present', !dockerIdentityRequired || imageDigests.length === 3, {
    required: dockerIdentityRequired,
    manifestImageDigest,
    manifestArtifactImageDigest,
    candidateImageDigest,
  });
  addCloseoutCheck(checks, 'docker_image_digest_consistent', !dockerIdentityRequired || new Set(imageDigests).size === 1, {
    required: dockerIdentityRequired,
    manifestImageDigest,
    manifestArtifactImageDigest,
    candidateImageDigest,
  });

  const currentSource = await sourceFingerprint(sourceRoot);
  addCloseoutCheck(checks, 'source_fingerprint_matches_receipt', currentSource.digest === receipt.sourceFingerprint?.digest, {
    expected: receipt.sourceFingerprint?.digest || null,
    actual: currentSource.digest,
  });

  const blockingGates = checks.filter((check) => check.status !== 'passed');
  return {
    schemaVersion: 'moonshot-harness-closeout-revalidation.v1',
    status: blockingGates.length === 0 ? 'passed' : 'failed',
    consumableByCommitWorkflow: blockingGates.length === 0,
    receiptPath,
    checks,
    blockingGates,
    currentPointer: pointer,
  };
}

function replacePathPrefix(value, prefix, replacement) {
  if (typeof value !== 'string' || !value.startsWith(prefix)) {
    return value;
  }
  const suffix = value.slice(prefix.length).replaceAll('/', path.sep);
  return `${replacement}${suffix}`;
}

function rewriteContainerPaths(value, { sourceRoot, outRoot }) {
  if (Array.isArray(value)) {
    return value.map((entry) => rewriteContainerPaths(entry, { sourceRoot, outRoot }));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key,
      rewriteContainerPaths(entry, { sourceRoot, outRoot }),
    ]));
  }
  if (typeof value !== 'string') {
    return value;
  }
  if (value.startsWith(CONTAINER_OUTPUT_ROOT)) {
    return replacePathPrefix(value, CONTAINER_OUTPUT_ROOT, path.resolve(outRoot));
  }
  if (value.startsWith(CONTAINER_WORKSPACE_ROOT)) {
    return replacePathPrefix(value, CONTAINER_WORKSPACE_ROOT, path.resolve(sourceRoot));
  }
  return value;
}

async function patchDockerLabResult({
  resultPath,
  sourceRoot,
  sourceSnapshotRoot,
  preparedWorkspaceRoot = '',
  preparedCodexCliRoot = '',
  prepareResult = null,
  sourceFingerprintResult,
  outRoot,
  role,
  image,
  imageMetadata = null,
  codexDevSmoke = false,
  containerHardening = dockerRunHardeningPolicy(),
}) {
  const payload = JSON.parse(await readFile(resultPath, 'utf8'));
  const installResultPath = path.join(path.resolve(outRoot), payload.runId || payload.run?.runId || '', 'install-result.json');
  if (!existsSync(installResultPath)) {
    throw new Error(`Docker lab did not write expected install result: ${installResultPath}`);
  }
  const installedRuntimeSmokePath = path.join(path.resolve(outRoot), payload.runId || payload.run?.runId || '', 'installed-runtime-smoke.json');
  if (!existsSync(installedRuntimeSmokePath)) {
    throw new Error(`Docker lab did not write expected installed runtime smoke result: ${installedRuntimeSmokePath}`);
  }
  const codexCliSmokePath = path.join(path.resolve(outRoot), payload.runId || payload.run?.runId || '', 'codex-cli-smoke.json');
  if (!existsSync(codexCliSmokePath)) {
    throw new Error(`Docker lab did not write expected Codex CLI smoke result: ${codexCliSmokePath}`);
  }
  const codexDevSmokePath = path.join(path.resolve(outRoot), payload.runId || payload.run?.runId || '', 'codex-dev-smoke.json');
  if (codexDevSmoke && !existsSync(codexDevSmokePath)) {
    throw new Error(`Docker lab did not write expected model-backed Codex dev smoke result: ${codexDevSmokePath}`);
  }
  const installResult = JSON.parse(await readFile(installResultPath, 'utf8'));
  const installStatus = deriveInstallStatus(installResult);
  if (!installResult.status) {
    await writeFile(installResultPath, `${JSON.stringify({
      status: installStatus,
      ...installResult,
    }, null, 2)}\n`);
  }
  const installedRuntimeSmoke = JSON.parse(await readFile(installedRuntimeSmokePath, 'utf8'));
  const codexCliSmoke = JSON.parse(await readFile(codexCliSmokePath, 'utf8'));
  const codexDevSmokeResult = existsSync(codexDevSmokePath)
    ? JSON.parse(await readFile(codexDevSmokePath, 'utf8'))
    : null;
  const normalizedRuntimeSmoke = normalizeInstalledRuntimeSmoke(installedRuntimeSmoke);
  await writeFile(installedRuntimeSmokePath, `${JSON.stringify(normalizedRuntimeSmoke, null, 2)}\n`);
  const runtimeStatus = normalizedRuntimeSmoke.runtimeCapabilityStatus?.status || normalizedRuntimeSmoke.status || 'unknown';
  if (runtimeStatus !== 'healthy') {
    throw new Error(`Docker installed runtime smoke failed hard gate (${runtimeStatus}): ${installedRuntimeSmokePath}`);
  }
  if (codexCliSmoke.status !== 'passed') {
    throw new Error(`Docker Codex CLI smoke failed: ${codexCliSmokePath}`);
  }
  if (codexDevSmokeResult && codexDevSmokeResult.status !== 'passed') {
    throw new Error(`Docker model-backed Codex dev smoke failed: ${codexDevSmokePath}`);
  }
  const rewritten = rewriteContainerPaths(payload, { sourceRoot, outRoot });
  if (rewritten.candidate && sourceFingerprintResult) {
    rewritten.candidate.sourceFingerprint = sourceFingerprintResult;
  }
  if (rewritten.run && sourceFingerprintResult) {
    rewritten.run.candidateRunId = sourceFingerprintResult.digest;
  }
  const patched = {
    ...rewritten,
    executionBackend: {
      type: 'docker',
      image,
      imageId: imageMetadata?.imageId || null,
      imageDigest: imageMetadata?.imageDigest || imageMetadata?.imageId || null,
      repoDigests: imageMetadata?.repoDigests || [],
      role,
      sourceRoot: path.resolve(sourceRoot),
      sourceSnapshotRoot: path.resolve(sourceSnapshotRoot),
      preparedWorkspaceRoot: preparedWorkspaceRoot ? path.resolve(preparedWorkspaceRoot) : null,
      preparedCodexCliRoot: preparedCodexCliRoot ? path.resolve(preparedCodexCliRoot) : null,
      outputRoot: path.resolve(outRoot),
      containerSourceRoot: CONTAINER_SOURCE_ROOT,
      containerWorkspaceRoot: CONTAINER_WORKSPACE_ROOT,
      containerOutputRoot: CONTAINER_OUTPUT_ROOT,
      containerCodexCliRoot: CONTAINER_CODEX_CLI_ROOT,
      prepare: prepareResult
        ? {
          preparedRoot: prepareResult.preparedRoot,
          workspaceRoot: prepareResult.workspaceRoot,
          codexCliRoot: prepareResult.codexCliRoot,
          codexCliVersionPath: prepareResult.codexCliVersionPath,
          command: prepareResult.command,
        }
        : null,
      installResultPath,
      installStatus,
      installId: installResult.installId || null,
      installedRuntimeSmokePath,
      installedRuntimeSmokeStatus: runtimeStatus,
      runtimeGate: {
        status: runtimeStatus,
        artifact: installedRuntimeSmokePath,
        hardGate: true,
      },
      codexCliSmokePath,
      codexCliSmokeStatus: codexCliSmoke.status || 'unknown',
      codexCliCriterion: codexCliSmoke.criterion || 'unknown',
      codexCliVersion: codexCliSmoke.codexCli?.version?.stdout || null,
      codexDevSmokePath: codexDevSmokeResult ? codexDevSmokePath : null,
      codexDevSmokeStatus: codexDevSmokeResult?.status || 'not_run',
      codexDevSmokeCriterion: codexDevSmokeResult?.criterion || null,
      hostCodexAuth: codexCliSmoke.authContract?.status === 'present' ? 'present_ephemeral' : 'not_used',
      containerHardening,
    },
  };
  await writeFile(resultPath, `${JSON.stringify(patched, null, 2)}\n`);
  return { ...patched, resultPath };
}

function deriveInstallStatus(installResult) {
  if (installResult?.status) {
    return installResult.status;
  }
  if (installResult?.result) {
    return installResult.result;
  }
  const verification = Array.isArray(installResult?.verification) ? installResult.verification : [];
  const profileSurfaceParity = Array.isArray(installResult?.profileSurfaceParity)
    ? installResult.profileSurfaceParity
    : [];
  const verificationClean = verification.every((entry) => (entry.missing || []).length === 0
    && (entry.mismatch || []).length === 0);
  const surfaceParityClean = profileSurfaceParity.every((entry) => (entry.missingPublicSkills || []).length === 0
    && (entry.extraPublicSkills || []).length === 0);
  if (verification.length > 0 && verificationClean && surfaceParityClean) {
    return 'installed';
  }
  return 'unknown';
}

function normalizeInstalledRuntimeSmoke(payload) {
  const status = payload?.runtimeCapabilityStatus?.status || payload?.status || 'unknown';
  const blockerCount = payload?.operationalMetrics?.blockerMetrics?.length || 0;
  const releaseBlockerCount = payload?.operationalMetrics?.releaseBlockerMetrics?.length || 0;
  const degradedReasons = payload?.compactStatus?.staleWarnings || [];
  if (status === 'available' && blockerCount === 0 && releaseBlockerCount === 0 && degradedReasons.length === 0) {
    return {
      ...payload,
      runtimeCapabilityStatus: {
        ...payload.runtimeCapabilityStatus,
        status: 'healthy',
        normalizedFrom: 'available',
      },
    };
  }
  return payload;
}

async function ensureCodexCliCache(version = DEFAULT_CODEX_CLI_VERSION) {
  const cacheRoot = path.resolve(DEFAULT_CODEX_CLI_CACHE_ROOT);
  const tarballs = codexCliTarballNames(version);
  const cliPath = path.join(cacheRoot, tarballs.cli);
  const linuxX64Path = path.join(cacheRoot, tarballs.linuxX64);
  await mkdir(cacheRoot, { recursive: true });
  if (existsSync(cliPath) && existsSync(linuxX64Path)) {
    return {
      status: 'reused_local_cache',
      version,
      cacheRoot,
      tarballs,
    };
  }
  run(npmCommand(), ['pack', `@openai/codex@${version}`, '--pack-destination', cacheRoot]);
  run(npmCommand(), ['pack', `@openai/codex@${version}-linux-x64`, '--pack-destination', cacheRoot]);
  if (!existsSync(cliPath) || !existsSync(linuxX64Path)) {
    throw new Error(`Codex CLI cache incomplete after npm pack: ${cacheRoot}`);
  }
  return {
    status: 'created_with_npm_pack',
    version,
    cacheRoot,
    tarballs,
  };
}

function defaultHostCodexHome() {
  if (process.env.CODEX_HOME) {
    return path.resolve(process.env.CODEX_HOME);
  }
  const home = process.env.USERPROFILE || process.env.HOME || '';
  return home ? path.join(home, '.codex') : '';
}

function resolveHostCodexAuthFiles() {
  const hostCodexHome = defaultHostCodexHome();
  if (!hostCodexHome) {
    throw new Error('Cannot resolve host Codex home for --use-host-codex-auth');
  }
  const authJson = path.join(hostCodexHome, 'auth.json');
  const configToml = path.join(hostCodexHome, 'config.toml');
  if (!existsSync(authJson)) {
    throw new Error(`Host Codex auth.json not found: ${authJson}`);
  }
  if (!existsSync(configToml)) {
    throw new Error(`Host Codex config.toml not found: ${configToml}`);
  }
  return {
    hostCodexHome,
    authJson,
    configToml,
  };
}

async function prepareDockerWorkspace({
  role,
  runId,
  image = DEFAULT_DOCKER_IMAGE,
  sourceSnapshot,
  codexCliCache,
  codexCliVersion = DEFAULT_CODEX_CLI_VERSION,
}) {
  const preparedRoot = path.resolve(DEFAULT_PREPARED_WORKSPACE_ROOT, runId);
  await rm(preparedRoot, { recursive: true, force: true });
  await mkdir(preparedRoot, { recursive: true });
  const args = [
    'run',
    '--rm',
    '--init',
    '--cap-drop',
    'ALL',
    '--cap-add',
    'CHOWN',
    '--cap-add',
    'FOWNER',
    '--security-opt',
    'no-new-privileges',
    '--pids-limit',
    '512',
    '--name',
    dockerContainerName(`${role}-prepare`, runId),
    '--mount',
    `type=bind,source=${dockerMountPath(sourceSnapshot)},target=${CONTAINER_SOURCE_ROOT},readonly`,
    '--mount',
    `type=bind,source=${dockerMountPath(preparedRoot)},target=${CONTAINER_PREPARED_ROOT}`,
    '--mount',
    `type=bind,source=${dockerMountPath(codexCliCache.cacheRoot)},target=${CONTAINER_CODEX_CLI_CACHE_ROOT},readonly`,
    '-e',
    `HOME=${CONTAINER_PREPARED_ROOT}/home`,
    '-e',
    `USERPROFILE=${CONTAINER_PREPARED_ROOT}/home`,
    '-w',
    `${CONTAINER_PREPARED_ROOT}/workspace`,
    image,
    'sh',
    '-lc',
    prepareDockerScript({ codexCliVersion }),
  ];
  run('docker', args);
  const workspaceRoot = path.join(preparedRoot, 'workspace');
  const codexCliRoot = path.join(preparedRoot, 'codex-cli');
  const codexCliVersionPath = path.join(preparedRoot, 'codex-cli-version.txt');
  if (!existsSync(path.join(workspaceRoot, 'node_modules'))) {
    throw new Error(`Docker prepare did not write expected node_modules: ${workspaceRoot}`);
  }
  if (!existsSync(codexCliVersionPath)) {
    throw new Error(`Docker prepare did not write expected Codex CLI version: ${codexCliVersionPath}`);
  }
  return {
    preparedRoot,
    workspaceRoot,
    codexCliRoot,
    codexCliVersionPath,
    command: `docker run ${image} sh -lc <prepareDockerScript>`,
  };
}

async function runDockerLab({
  role,
  sourceRoot,
  runId,
  outRoot = DEFAULT_RUN_ROOT,
  image = DEFAULT_DOCKER_IMAGE,
  imageMetadata = null,
  codexCliVersion = DEFAULT_CODEX_CLI_VERSION,
  useHostCodexAuth = false,
  codexDevSmoke = false,
  dockerNetwork = '',
}) {
  if (codexDevSmoke && !useHostCodexAuth) {
    throw new Error('--codex-dev-smoke requires --use-host-codex-auth');
  }
  assertDockerAvailable();
  await mkdir(outRoot, { recursive: true });
  const codexCliCache = await ensureCodexCliCache(codexCliVersion);
  const hostCodexAuth = useHostCodexAuth ? resolveHostCodexAuthFiles() : null;
  const source = path.resolve(sourceRoot);
  const sourceFingerprintResult = await sourceFingerprint(source);
  const sourceSnapshot = await prepareDockerSourceSnapshot({ sourceRoot: source, role, runId });
  const output = path.resolve(outRoot);
  const strictNetworkMode = dockerNetwork || (codexDevSmoke ? 'bridge' : 'none');
  if (codexDevSmoke && strictNetworkMode === 'none') {
    throw new Error('--codex-dev-smoke requires an outbound Docker network; omit --docker-network or use --docker-network bridge');
  }
  const prepared = await prepareDockerWorkspace({
    role,
    runId,
    image,
    sourceSnapshot,
    codexCliCache,
    codexCliVersion,
  });
  const hardeningArgs = dockerRunHardeningArgs({ networkMode: strictNetworkMode, readOnlyRootFilesystem: true });
  const hardeningPolicy = dockerRunHardeningPolicy({
    networkMode: strictNetworkMode,
    readOnlyRootFilesystem: true,
    codexDevSmoke,
    explicitNetworkOverride: Boolean(dockerNetwork),
  });
  const args = [
    'run',
    '--rm',
    ...hardeningArgs,
    '--name',
    dockerContainerName(role, runId),
    '--mount',
    `type=bind,source=${dockerMountPath(prepared.workspaceRoot)},target=${CONTAINER_WORKSPACE_ROOT},readonly`,
    '--mount',
    `type=bind,source=${dockerMountPath(prepared.codexCliRoot)},target=${CONTAINER_CODEX_CLI_ROOT},readonly`,
    '--mount',
    `type=bind,source=${dockerMountPath(output)},target=${CONTAINER_OUTPUT_ROOT}`,
    ...(hostCodexAuth ? [
      '--mount',
      `type=bind,source=${dockerMountPath(hostCodexAuth.authJson)},target=${CONTAINER_CODEX_AUTH_SOURCE_ROOT}/auth.json,readonly`,
      '--mount',
      `type=bind,source=${dockerMountPath(hostCodexAuth.configToml)},target=${CONTAINER_CODEX_AUTH_SOURCE_ROOT}/config.toml,readonly`,
    ] : []),
    '-e',
    'MOONSHOT_RELAY_HOME=/harness-run/homes/moonshot-relay',
    '-e',
    'PHASE_RUNTIME_DB=/harness-run/homes/runtime-state.sqlite',
    '-e',
    'CODEX_HOME=/harness-run/homes/codex',
    '-e',
    'CLAUDE_HOME=/harness-run/homes/claude',
    '-e',
    'HOME=/harness-run/homes/user-home',
    '-e',
    'USERPROFILE=/harness-run/homes/userprofile',
    '-w',
    CONTAINER_WORKSPACE_ROOT,
    image,
    'sh',
    '-lc',
    dockerScript(runId, { useHostCodexAuth, codexDevSmoke }),
  ];
  const result = run('docker', args);
  const hostResultPath = path.join(output, runId, 'lab-result.json');
  if (!existsSync(hostResultPath)) {
    throw new Error(result.stdout || `Docker lab did not write expected result: ${hostResultPath}`);
  }
  return patchDockerLabResult({
    resultPath: hostResultPath,
    sourceRoot: source,
    sourceSnapshotRoot: sourceSnapshot,
    preparedWorkspaceRoot: prepared.workspaceRoot,
    preparedCodexCliRoot: prepared.codexCliRoot,
    prepareResult: prepared,
    sourceFingerprintResult,
    outRoot: output,
    role,
    image,
    imageMetadata,
    codexDevSmoke,
    containerHardening: hardeningPolicy,
  });
}

async function scanAuthArtifacts(rootPath) {
  const findings = [];
  async function walk(currentPath) {
    const entries = await readdir(currentPath, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const absolute = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
        continue;
      }
      const relative = toPortable(path.relative(rootPath, absolute));
      if (entry.name === 'auth.json') {
        findings.push({ path: relative, failureClass: 'auth_file_copied_to_artifact' });
        continue;
      }
      if (!/\.(json|txt|log|toml)$/i.test(entry.name)) {
        continue;
      }
      const content = await readFile(absolute, 'utf8').catch(() => '');
      if (/(access_token|refresh_token|id_token|api[_-]?key|session[_-]?token)\s*[:=]/i.test(content)) {
        findings.push({ path: relative, failureClass: 'token_like_payload_in_artifact' });
      }
    }
  }
  await walk(rootPath);
  return {
    schemaVersion: 'moonshot-harness-auth-artifact-scan.v1',
    status: findings.length === 0 ? 'passed' : 'failed',
    findings,
  };
}

async function runDockerAuthSmoke({
  runId,
  sourceRoot,
  outRoot = DEFAULT_RUN_ROOT,
  image = DEFAULT_DOCKER_IMAGE,
  codexCliVersion = DEFAULT_CODEX_CLI_VERSION,
  dockerNetwork = '',
}) {
  assertDockerAvailable();
  await mkdir(outRoot, { recursive: true });
  const role = 'auth-smoke';
  const codexCliCache = await ensureCodexCliCache(codexCliVersion);
  const hostCodexAuth = resolveHostCodexAuthFiles();
  const source = path.resolve(sourceRoot);
  const sourceSnapshot = await prepareDockerSourceSnapshot({ sourceRoot: source, role, runId });
  const output = path.resolve(outRoot);
  const prepared = await prepareDockerWorkspace({
    role,
    runId,
    image,
    sourceSnapshot,
    codexCliCache,
    codexCliVersion,
  });
  const networkMode = dockerNetwork || 'bridge';
  if (networkMode === 'none') {
    throw new Error('auth-smoke requires outbound network; omit --docker-network or use --docker-network bridge');
  }
  const hardeningArgs = dockerRunHardeningArgs({ networkMode, readOnlyRootFilesystem: true });
  const hardeningPolicy = dockerRunHardeningPolicy({
    networkMode,
    readOnlyRootFilesystem: true,
    codexDevSmoke: true,
    explicitNetworkOverride: Boolean(dockerNetwork),
  });
  const args = [
    'run',
    '--rm',
    ...hardeningArgs,
    '--name',
    dockerContainerName(role, runId),
    '--mount',
    `type=bind,source=${dockerMountPath(prepared.workspaceRoot)},target=${CONTAINER_WORKSPACE_ROOT},readonly`,
    '--mount',
    `type=bind,source=${dockerMountPath(prepared.codexCliRoot)},target=${CONTAINER_CODEX_CLI_ROOT},readonly`,
    '--mount',
    `type=bind,source=${dockerMountPath(output)},target=${CONTAINER_OUTPUT_ROOT}`,
    '--mount',
    `type=bind,source=${dockerMountPath(hostCodexAuth.authJson)},target=${CONTAINER_CODEX_AUTH_SOURCE_ROOT}/auth.json,readonly`,
    '--mount',
    `type=bind,source=${dockerMountPath(hostCodexAuth.configToml)},target=${CONTAINER_CODEX_AUTH_SOURCE_ROOT}/config.toml,readonly`,
    '-w',
    CONTAINER_WORKSPACE_ROOT,
    image,
    'sh',
    '-lc',
    dockerScript(runId, { useHostCodexAuth: true, codexDevSmoke: true, runHarnessLab: false }),
  ];
  run('docker', args);
  const runRoot = path.join(output, runId);
  const summaryPath = path.join(runRoot, 'auth-smoke-summary.json');
  const codexDevSmokePath = path.join(runRoot, 'codex-dev-smoke.json');
  const codexCliSmokePath = path.join(runRoot, 'codex-cli-smoke.json');
  const installedRuntimeSmokePath = path.join(runRoot, 'installed-runtime-smoke.json');
  if (!existsSync(summaryPath) || !existsSync(codexDevSmokePath) || !existsSync(codexCliSmokePath)) {
    throw new Error(`Docker auth-smoke did not write expected artifacts: ${runRoot}`);
  }
  const installedRuntimeSmoke = normalizeInstalledRuntimeSmoke(JSON.parse(await readFile(installedRuntimeSmokePath, 'utf8')));
  await writeFile(installedRuntimeSmokePath, `${JSON.stringify(installedRuntimeSmoke, null, 2)}\n`);
  const runtimeStatus = installedRuntimeSmoke.runtimeCapabilityStatus?.status || installedRuntimeSmoke.status || 'unknown';
  if (runtimeStatus !== 'healthy') {
    throw new Error(`Docker installed runtime smoke failed hard gate (${runtimeStatus}): ${installedRuntimeSmokePath}`);
  }
  const devSmoke = JSON.parse(await readFile(codexDevSmokePath, 'utf8'));
  if (devSmoke.status !== 'passed') {
    throw new Error(`Docker model-backed Codex dev smoke failed: ${codexDevSmokePath}`);
  }
  const artifactScan = await scanAuthArtifacts(runRoot);
  if (artifactScan.status !== 'passed') {
    throw new Error(`Auth smoke artifact scan failed: ${JSON.stringify(artifactScan.findings)}`);
  }
  const summary = {
    schemaVersion: 'moonshot-harness-auth-smoke-loop.v1',
    status: 'passed',
    runId,
    stage: 'auth_smoke',
    candidateBenchmarkRun: false,
    resultPath: summaryPath,
    installedRuntimeSmokePath,
    codexCliSmokePath,
    codexDevSmokePath,
    artifactScan,
    backend: {
      type: 'docker',
      image,
      sourceRoot: source,
      sourceSnapshotRoot: sourceSnapshot,
      preparedWorkspaceRoot: prepared.workspaceRoot,
      networkMode,
      hostCodexAuth: 'mounted_ephemeral_in_auth_smoke_stage',
      containerHardening: hardeningPolicy,
    },
  };
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

function ensureDockerImage(image) {
  assertDockerAvailable();
  const existingImage = inspectDockerImage(image);
  if (existingImage) {
    return {
      status: 'reused_local_image',
      image,
      command: `docker image inspect ${image}`,
      ...existingImage,
    };
  }
  run('docker', ['build', '-f', 'Dockerfile.harness-lab', '-t', image, '.']);
  const builtImage = inspectDockerImage(image);
  return {
    status: 'built_or_reused_from_cache',
    image,
    command: `docker build -f Dockerfile.harness-lab -t ${image} .`,
    ...(builtImage || {}),
  };
}

function inspectDockerImage(image) {
  const inspect = spawnSync('docker', ['image', 'inspect', image, '--format', '{{json .}}'], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  if (inspect.status !== 0 || !inspect.stdout.trim()) {
    return null;
  }
  const payload = JSON.parse(inspect.stdout);
  const repoDigests = Array.isArray(payload.RepoDigests) ? payload.RepoDigests.filter(Boolean) : [];
  const imageId = payload.Id || '';
  return {
    imageId,
    imageDigest: repoDigests[0] || imageId || null,
    repoDigests,
  };
}

async function ensureLoopRoots(runId) {
  await mkdir(DEFAULT_BASELINE_ROOT, { recursive: true });
  await mkdir(DEFAULT_RUN_ROOT, { recursive: true });
  await mkdir(DEFAULT_WORKTREE_ROOT, { recursive: true });
  await mkdir(path.join(DEFAULT_ENV_ROOT, runId, 'moonshot-relay'), { recursive: true });
  await mkdir(path.join(DEFAULT_ENV_ROOT, runId, 'codex'), { recursive: true });
  await mkdir(path.join(DEFAULT_ENV_ROOT, runId, 'claude'), { recursive: true });
}

function gitEnv() {
  const repoRoot = process.cwd().replaceAll(path.sep, '/');
  return {
    ...process.env,
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'safe.directory',
    GIT_CONFIG_VALUE_0: repoRoot,
  };
}

async function createBaselineWorktree(baselineRef, baselineId) {
  const worktreePath = path.resolve(DEFAULT_WORKTREE_ROOT, baselineId);
  if (existsSync(worktreePath)) {
    await rm(worktreePath, { recursive: true, force: true });
    run('git', ['worktree', 'prune'], { env: gitEnv() });
  }
  run('git', ['worktree', 'add', '--detach', worktreePath, baselineRef], { env: gitEnv() });
  return worktreePath;
}

function ensureBaselineDependencies(worktreePath) {
  const dependencyProbe = path.join(worktreePath, 'node_modules', 'base64-js');
  if (existsSync(dependencyProbe)) {
    return {
      status: 'reused',
      command: 'dependency probe already exists',
    };
  }
  run(npmCommand(), ['ci', '--no-audit', '--no-fund'], { cwd: worktreePath });
  return {
    status: 'installed',
    command: 'npm ci --no-audit --no-fund',
  };
}

async function readCurrentPointer() {
  const pointerPath = path.resolve(DEFAULT_BASELINE_ROOT, 'current.json');
  if (!existsSync(pointerPath)) {
    return null;
  }
  return JSON.parse(await readFile(pointerPath, 'utf8'));
}

async function readBaselineManifest(pointer) {
  if (!pointer?.manifestPath || !existsSync(pointer.manifestPath)) {
    return null;
  }
  return JSON.parse(await readFile(pointer.manifestPath, 'utf8'));
}

async function initLoop(options) {
  const baselineId = options.baselineId || 'baseline-0001';
  const runId = options.runId || `initial-${compactTime()}`;
  const pointerBefore = await currentPointerSnapshot();
  await ensureLoopRoots(runId);
  const stableRoot = await createBaselineWorktree(options.baselineRef, baselineId);
  let backend = null;
  let labResult = null;
  let baselineResultPath = '';
  let comparePath = '';
  if (options.backend === 'docker') {
    const dockerImage = ensureDockerImage(options.dockerImage);
    const baselineRunId = `${runId}-baseline`;
    const candidateRunId = `${runId}-candidate`;
    const baselineResult = await runDockerLab({
      role: 'baseline',
      sourceRoot: stableRoot,
      runId: baselineRunId,
      image: options.dockerImage,
      imageMetadata: dockerImage,
      codexCliVersion: options.codexCliVersion,
      useHostCodexAuth: options.useHostCodexAuth,
      codexDevSmoke: options.codexDevSmoke,
      dockerNetwork: options.dockerNetwork,
    });
    const candidateResult = await runDockerLab({
      role: 'candidate',
      sourceRoot: options.candidateRoot,
      runId: candidateRunId,
      image: options.dockerImage,
      imageMetadata: dockerImage,
      codexCliVersion: options.codexCliVersion,
      useHostCodexAuth: options.useHostCodexAuth,
      codexDevSmoke: options.codexDevSmoke,
      dockerNetwork: options.dockerNetwork,
    });
    baselineResultPath = baselineResult.resultPath;
    labResult = candidateResult;
    const compareDir = path.resolve(DEFAULT_STATE_ROOT, 'compare');
    await mkdir(compareDir, { recursive: true });
    comparePath = path.join(compareDir, `${candidateRunId}-vs-${baselineId}.json`);
    const compare = run(process.execPath, nodeArgs('tools/harness-lab/harness-lab.mjs', [
      'compare',
      '--baseline-result',
      baselineResult.resultPath,
      '--candidate-result',
      candidateResult.resultPath,
      '--out',
      comparePath,
      '--promotion-policy',
      options.promotionPolicy,
      ...(options.minDelta !== '' ? ['--min-delta', String(options.minDelta)] : []),
      '--json',
    ]), { env: loopEnv(runId), expect: null });
    const compareResult = JSON.parse(compare.stdout);
    backend = {
      type: 'docker',
      image: options.dockerImage,
      imagePreparation: dockerImage,
      baselineRunId,
      baselineResultPath,
      candidateRunId,
      compareReportPath: comparePath,
      compareStatus: compareResult.status,
    };
  } else if (options.backend === 'host') {
    const baselineDependencies = ensureBaselineDependencies(stableRoot);
    const lab = run(process.execPath, nodeArgs('tools/harness-lab/harness-lab.mjs', [
      'run',
      '--stable-root',
      stableRoot,
      '--candidate-root',
      options.candidateRoot,
      '--out',
      DEFAULT_RUN_ROOT,
      '--run-id',
      runId,
      '--json',
    ]), { env: loopEnv(runId) });
    labResult = JSON.parse(lab.stdout);
    backend = {
      type: 'host',
      baselineDependencies,
    };
  } else {
    throw new Error(`Unknown backend: ${options.backend}`);
  }
  const compareResult = comparePath ? await readJsonIfExists(comparePath) : null;
  let promotion = null;
  if (options.promoteInitial !== false && labResult.status === 'passed' && (!compareResult || compareResult.status === 'passed')) {
    const promoted = run(process.execPath, nodeArgs('tools/harness-lab/harness-lab.mjs', [
      'promote',
      '--candidate-run',
      labResult.resultPath,
      ...(comparePath ? ['--compare-report', comparePath] : []),
      '--baseline-root',
      DEFAULT_BASELINE_ROOT,
      '--baseline-id',
      baselineId,
      '--json',
    ]), { env: loopEnv(runId) });
    promotion = JSON.parse(promoted.stdout);
  }
  const pointerAfter = await currentPointerSnapshot();
  const receiptStatus = promotion?.status === 'promoted'
    ? 'promoted_ready_for_commit_workflow'
    : (compareResult?.status === 'passed' ? 'rejected_no_commit' : 'blocked_hard_gate');
  const receipt = await buildCloseoutReceipt({
    status: receiptStatus,
    decisionReason: promotion?.status === 'promoted'
      ? 'compare_passed_and_promoted'
      : (compareResult?.status === 'passed' ? 'compare_passed_promotion_not_requested' : 'compare_or_lab_failed'),
    blockingGates: compareResult?.regressions || [],
    runId: labResult.runId || runId,
    candidateResultPath: labResult.resultPath,
    compareReportPath: comparePath,
    promotion,
    previousBaselineId: pointerBefore.baselineId,
    promotionPolicy: compareResult?.promotionPolicy || null,
    pointerBefore,
    pointerAfter,
  });
  const closeoutReceiptPath = await writeCloseoutReceipt(labResult.runId || runId, receipt);
  const summary = {
    schemaVersion: 'moonshot-harness-loop-init.v1',
    status: promotion?.status === 'promoted'
      ? 'ready'
      : (compareResult?.status || labResult.status),
    lifecyclePath: 'initial_bootstrap',
    baselineId,
    baselineRef: options.baselineRef,
    backend,
    stableRoot,
    runId,
    labResultPath: labResult.resultPath,
    baselineResultPath,
    compareReportPath: comparePath,
    promotionPolicy: compareResult?.promotionPolicy || null,
    promotion,
    closeoutReceiptPath,
    baselineRoot: path.resolve(DEFAULT_BASELINE_ROOT),
    currentPointerPath: promotion?.currentPointerPath || path.resolve(DEFAULT_BASELINE_ROOT, 'current.json'),
  };
  await writeFile(path.resolve(DEFAULT_STATE_ROOT, 'loop-status.json'), `${JSON.stringify(summary, null, 2)}\n`);
  return summary;
}

async function candidateLoop(options) {
  if (options.useHostCodexAuth || options.codexDevSmoke) {
    throw new Error('Candidate benchmark commands must not mount host Codex auth. Run npm run lab:auth-smoke separately.');
  }
  const pointer = await readCurrentPointer();
  const manifest = await readBaselineManifest(pointer);
  if (!manifest?.artifact?.path) {
    throw new Error('No current baseline artifact found. Run npm run lab:init first.');
  }
  const pointerBefore = await currentPointerSnapshot();
  const runId = options.runId || `candidate-${compactTime()}`;
  await ensureLoopRoots(runId);
  let candidateResult = null;
  let backend = null;
  if (options.backend === 'docker') {
    const dockerImage = ensureDockerImage(options.dockerImage);
    candidateResult = await runDockerLab({
      role: 'candidate',
      sourceRoot: options.candidateRoot,
      runId,
      image: options.dockerImage,
      imageMetadata: dockerImage,
      codexCliVersion: options.codexCliVersion,
      useHostCodexAuth: options.useHostCodexAuth,
      codexDevSmoke: options.codexDevSmoke,
      dockerNetwork: options.dockerNetwork,
    });
    backend = {
      type: 'docker',
      image: options.dockerImage,
      imagePreparation: dockerImage,
    };
  } else if (options.backend === 'host') {
    const candidate = run(process.execPath, nodeArgs('tools/harness-lab/harness-lab.mjs', [
      'run',
      '--candidate-root',
      options.candidateRoot,
      '--out',
      DEFAULT_RUN_ROOT,
      '--run-id',
      runId,
      '--json',
    ]), { env: loopEnv(runId) });
    candidateResult = JSON.parse(candidate.stdout);
    backend = {
      type: 'host',
    };
  } else {
    throw new Error(`Unknown backend: ${options.backend}`);
  }
  const compareDir = path.resolve(DEFAULT_STATE_ROOT, 'compare');
  await mkdir(compareDir, { recursive: true });
  const comparePath = path.join(compareDir, `${runId}-vs-${pointer.baselineId}.json`);
  const compare = run(process.execPath, nodeArgs('tools/harness-lab/harness-lab.mjs', [
    'compare',
    '--baseline-result',
    manifest.artifact.path,
    '--candidate-result',
    candidateResult.resultPath,
    '--out',
    comparePath,
    '--promotion-policy',
    options.promotionPolicy,
    ...(options.minDelta !== '' ? ['--min-delta', String(options.minDelta)] : []),
    '--json',
  ]), { env: loopEnv(runId), expect: null });
  const compareResult = JSON.parse(compare.stdout);
  const calibration = shouldRerunBaseline({
    baselineManifest: manifest,
    candidateResult,
    marginThreshold: options.calibrationMarginThreshold ? Number(options.calibrationMarginThreshold) : 0.02,
  });
  let promotion = null;
  if (options.promote && calibration.status !== 'calibration_required') {
    const nextNumber = Number((pointer.baselineId || '').match(/(\d+)$/)?.[1] || 1) + 1;
    const baselineId = `baseline-${String(nextNumber).padStart(4, '0')}`;
    promotion = JSON.parse(run(process.execPath, nodeArgs('tools/harness-lab/harness-lab.mjs', [
      'promote',
      '--candidate-run',
      candidateResult.resultPath,
      '--compare-report',
      comparePath,
      '--baseline-root',
      DEFAULT_BASELINE_ROOT,
      '--baseline-id',
      baselineId,
      '--expected-previous-baseline-id',
      pointer.baselineId,
      ...(pointerBefore.sha256 ? ['--expected-previous-pointer-sha256', pointerBefore.sha256] : []),
      '--json',
    ]), { env: loopEnv(runId) }).stdout);
  }
  const pointerAfter = await currentPointerSnapshot();
  const closeoutStatus = calibration.status === 'calibration_required'
    ? 'calibration_required'
    : (promotion?.status === 'promoted'
      ? 'promoted_ready_for_commit_workflow'
      : (compareResult.status === 'passed' ? 'rejected_no_commit' : 'blocked_hard_gate'));
  const closeoutReceipt = await buildCloseoutReceipt({
    status: closeoutStatus,
    decisionReason: calibration.status === 'calibration_required'
      ? 'baseline_calibration_required'
      : (promotion?.status === 'promoted'
        ? 'compare_passed_and_promoted'
        : (compareResult.status === 'passed' ? 'compare_passed_promotion_not_requested' : 'compare_failed')),
    blockingGates: compareResult.regressions || [],
    runId,
    candidateResultPath: candidateResult.resultPath,
    compareReportPath: comparePath,
    promotion,
    previousBaselineId: pointer.baselineId,
    promotionPolicy: compareResult.promotionPolicy,
    calibration,
    pointerBefore,
    pointerAfter,
  });
  const closeoutReceiptPath = await writeCloseoutReceipt(runId, closeoutReceipt);
  const summary = {
    schemaVersion: 'moonshot-harness-loop-candidate.v1',
    status: closeoutStatus === 'calibration_required' ? 'calibration_required' : compareResult.status,
    promotable: compareResult.promotable && calibration.status !== 'calibration_required',
    lifecyclePath: options.lifecyclePath || 'candidate_only',
    previousBaselineId: pointer.baselineId,
    backend,
    runId,
    candidateResultPath: candidateResult.resultPath,
    compareReportPath: comparePath,
    promotionPolicy: compareResult.promotionPolicy,
    calibration,
    closeoutReceiptPath,
    promotion,
  };
  summary.candidateSummaryPath = await writeCandidateSummaryArtifact(summary);
  return summary;
}

async function statusLoop() {
  const pointer = await readCurrentPointer();
  const manifest = await readBaselineManifest(pointer);
  const docker = dockerAvailable();
  return {
    schemaVersion: 'moonshot-harness-loop-status.v1',
    status: pointer ? 'ready' : 'not_initialized',
    defaultBackend: 'docker',
    docker,
    stateRoot: path.resolve(DEFAULT_STATE_ROOT),
    baselineRoot: path.resolve(DEFAULT_BASELINE_ROOT),
    current: pointer,
    currentManifest: manifest,
  };
}

function selectAutoLifecycle(pointer) {
  if (!pointer) {
    return {
      lifecyclePath: 'initial_bootstrap',
      command: 'init',
      promoteInitial: true,
    };
  }
  return {
    lifecyclePath: 'candidate_only',
    command: 'candidate',
    promoteInitial: false,
  };
}

async function autoLoop(options) {
  const pointer = await readCurrentPointer();
  const lifecycle = selectAutoLifecycle(pointer);
  if (lifecycle.command === 'init') {
    return initLoop({
      ...options,
      lifecyclePath: lifecycle.lifecyclePath,
      promoteInitial: lifecycle.promoteInitial,
    });
  }
  return candidateLoop({
    ...options,
    lifecyclePath: lifecycle.lifecyclePath,
  });
}

async function authSmokeLoop(options) {
  if (options.backend !== 'docker') {
    throw new Error('auth-smoke is only supported by the Docker backend.');
  }
  const dockerImage = ensureDockerImage(options.dockerImage);
  const runId = options.runId || `auth-smoke-${compactTime()}`;
  const result = await runDockerAuthSmoke({
    runId,
    sourceRoot: options.candidateRoot,
    image: options.dockerImage,
    codexCliVersion: options.codexCliVersion,
    dockerNetwork: options.dockerNetwork,
  });
  return {
    ...result,
    backend: {
      ...result.backend,
      imagePreparation: dockerImage,
    },
  };
}

async function calibrationLoop(options) {
  const pointer = await readCurrentPointer();
  const manifest = await readBaselineManifest(pointer);
  if (!manifest?.artifact?.path) {
    throw new Error('No current baseline artifact found. Run npm run lab:auto first.');
  }
  const runId = options.runId || `calibration-${compactTime()}`;
  const calibrationWorktreeId = `${pointer.baselineId}-calibration-${compactTime()}`;
  const baselineRef = options.baselineRef && options.baselineRef !== 'HEAD'
    ? options.baselineRef
    : (manifest.sourceFingerprint?.head || 'HEAD');
  const stableRoot = await createBaselineWorktree(baselineRef, calibrationWorktreeId);
  await ensureLoopRoots(runId);
  let baselineResult = null;
  let candidateResult = null;
  let backend = null;
  if (options.backend === 'docker') {
    const dockerImage = ensureDockerImage(options.dockerImage);
    baselineResult = await runDockerLab({
      role: 'baseline',
      sourceRoot: stableRoot,
      runId: `${runId}-baseline`,
      image: options.dockerImage,
      imageMetadata: dockerImage,
      codexCliVersion: options.codexCliVersion,
      dockerNetwork: options.dockerNetwork,
    });
    candidateResult = await runDockerLab({
      role: 'candidate',
      sourceRoot: options.candidateRoot,
      runId: `${runId}-candidate`,
      image: options.dockerImage,
      imageMetadata: dockerImage,
      codexCliVersion: options.codexCliVersion,
      dockerNetwork: options.dockerNetwork,
    });
    backend = {
      type: 'docker',
      image: options.dockerImage,
      imagePreparation: dockerImage,
      baselineRunId: `${runId}-baseline`,
      candidateRunId: `${runId}-candidate`,
    };
  } else if (options.backend === 'host') {
    ensureBaselineDependencies(stableRoot);
    const baseline = run(process.execPath, nodeArgs('tools/harness-lab/harness-lab.mjs', [
      'run',
      '--candidate-root',
      stableRoot,
      '--out',
      DEFAULT_RUN_ROOT,
      '--run-id',
      `${runId}-baseline`,
      '--json',
    ]), { env: loopEnv(runId) });
    const candidate = run(process.execPath, nodeArgs('tools/harness-lab/harness-lab.mjs', [
      'run',
      '--candidate-root',
      options.candidateRoot,
      '--out',
      DEFAULT_RUN_ROOT,
      '--run-id',
      `${runId}-candidate`,
      '--json',
    ]), { env: loopEnv(runId) });
    baselineResult = JSON.parse(baseline.stdout);
    candidateResult = JSON.parse(candidate.stdout);
    backend = { type: 'host' };
  } else {
    throw new Error(`Unknown backend: ${options.backend}`);
  }
  const compareDir = path.resolve(DEFAULT_STATE_ROOT, 'compare');
  await mkdir(compareDir, { recursive: true });
  const calibrationBaselineFixtureNormalization = await normalizeCalibrationBaselineFixtureIdentity({
    resultPath: baselineResult.resultPath,
    manifest,
  });
  const comparePath = path.join(compareDir, `${runId}-candidate-vs-${pointer.baselineId}-calibrated.json`);
  const compare = run(process.execPath, nodeArgs('tools/harness-lab/harness-lab.mjs', [
    'compare',
    '--baseline-result',
    calibrationBaselineFixtureNormalization.resultPath,
    '--candidate-result',
    candidateResult.resultPath,
    '--out',
    comparePath,
    '--promotion-policy',
    options.promotionPolicy,
    ...(options.minDelta !== '' ? ['--min-delta', String(options.minDelta)] : []),
    '--json',
  ]), { env: loopEnv(runId), expect: null });
  const compareResult = JSON.parse(compare.stdout);
  const pointerBefore = await currentPointerSnapshot();
  let promotion = null;
  if (options.promote && compareResult.status === 'passed') {
    const nextNumber = Number((pointer.baselineId || '').match(/(\d+)$/)?.[1] || 1) + 1;
    const baselineId = `baseline-${String(nextNumber).padStart(4, '0')}`;
    promotion = JSON.parse(run(process.execPath, nodeArgs('tools/harness-lab/harness-lab.mjs', [
      'promote',
      '--candidate-run',
      candidateResult.resultPath,
      '--compare-report',
      comparePath,
      '--baseline-root',
      DEFAULT_BASELINE_ROOT,
      '--baseline-id',
      baselineId,
      '--expected-previous-baseline-id',
      pointer.baselineId,
      ...(pointerBefore.sha256 ? ['--expected-previous-pointer-sha256', pointerBefore.sha256] : []),
      '--allow-calibrated-baseline',
      '--json',
    ]), { env: loopEnv(runId) }).stdout);
  }
  const pointerAfter = await currentPointerSnapshot();
  const receiptStatus = promotion?.status === 'promoted'
    ? 'promoted_ready_for_commit_workflow'
    : (compareResult.status === 'passed' ? 'rejected_no_commit' : 'blocked_hard_gate');
  const receipt = await buildCloseoutReceipt({
    status: receiptStatus,
    decisionReason: promotion?.status === 'promoted'
      ? 'calibration_compare_passed_and_promoted'
      : (compareResult.status === 'passed' ? 'calibration_compare_passed_promotion_not_requested' : 'calibration_compare_failed'),
    blockingGates: compareResult.regressions || [],
    runId: `${runId}-candidate`,
    candidateResultPath: candidateResult.resultPath,
    compareReportPath: comparePath,
    promotion,
    previousBaselineId: pointer.baselineId,
    promotionPolicy: compareResult.promotionPolicy,
    calibration: { schemaVersion: 'moonshot-harness-calibration-decision.v1', status: 'baseline_rerun_completed', rerunBaseline: true, reasons: ['explicit_calibration_command'] },
    pointerBefore,
    pointerAfter,
  });
  const closeoutReceiptPath = await writeCloseoutReceipt(`${runId}-candidate`, receipt);
  return {
    schemaVersion: 'moonshot-harness-loop-calibration.v1',
    status: compareResult.status,
    lifecyclePath: 'calibration',
    previousBaselineId: pointer.baselineId,
    baselineRef,
    backend,
    runId,
    baselineResultPath: baselineResult.resultPath,
    baselineCompareResultPath: calibrationBaselineFixtureNormalization.resultPath,
    candidateResultPath: candidateResult.resultPath,
    compareReportPath: comparePath,
    promotionPolicy: compareResult.promotionPolicy,
    calibrationBaselineFixtureNormalization,
    promotion,
    closeoutReceiptPath,
  };
}

async function refreshBaselineLoop(options) {
  const pointer = await readCurrentPointer();
  const manifest = await readBaselineManifest(pointer);
  if (!manifest?.artifact?.path) {
    throw new Error('No current baseline artifact found. Run npm run lab:auto first.');
  }
  const currentLabResult = await readJsonIfExists(manifest.artifact.path);
  const currentCompareReport = await readJsonIfExists(manifest.compareReport?.path);
  const refreshReadiness = buildBaselineRefreshReadiness({
    manifest,
    labResult: currentLabResult,
    compareReport: currentCompareReport,
  });
  if (!refreshReadiness.refreshRequired) {
    throw new Error('Current baseline already has strengthened evidence; refresh-baseline is only allowed for legacy or incomplete baselines.');
  }
  const runId = options.runId || `refresh-${compactTime()}`;
  await ensureLoopRoots(runId);
  let candidateResult = null;
  let backend = null;
  if (options.backend === 'docker') {
    const dockerImage = ensureDockerImage(options.dockerImage);
    candidateResult = await runDockerLab({
      role: 'candidate',
      sourceRoot: options.candidateRoot,
      runId,
      image: options.dockerImage,
      imageMetadata: dockerImage,
      codexCliVersion: options.codexCliVersion,
      dockerNetwork: options.dockerNetwork,
    });
    backend = {
      type: 'docker',
      image: options.dockerImage,
      imagePreparation: dockerImage,
    };
  } else if (options.backend === 'host') {
    const candidate = run(process.execPath, nodeArgs('tools/harness-lab/harness-lab.mjs', [
      'run',
      '--candidate-root',
      options.candidateRoot,
      '--out',
      DEFAULT_RUN_ROOT,
      '--run-id',
      runId,
      '--json',
    ]), { env: loopEnv(runId) });
    candidateResult = JSON.parse(candidate.stdout);
    backend = { type: 'host' };
  } else {
    throw new Error(`Unknown backend: ${options.backend}`);
  }
  const compareDir = path.resolve(DEFAULT_STATE_ROOT, 'compare');
  await mkdir(compareDir, { recursive: true });
  const comparePath = path.join(compareDir, `${runId}-refresh-self-compare.json`);
  const compare = run(process.execPath, nodeArgs('tools/harness-lab/harness-lab.mjs', [
    'compare',
    '--baseline-result',
    candidateResult.resultPath,
    '--candidate-result',
    candidateResult.resultPath,
    '--out',
    comparePath,
    '--promotion-policy',
    options.promotionPolicy,
    ...(options.minDelta !== '' ? ['--min-delta', String(options.minDelta)] : []),
    '--json',
  ]), { env: loopEnv(runId), expect: null });
  const compareResult = JSON.parse(compare.stdout);
  if (compareResult.status !== 'passed') {
    throw new Error(`Refresh self-compare failed: ${comparePath}`);
  }
  const pointerBefore = await currentPointerSnapshot();
  const nextNumber = Number((pointer.baselineId || '').match(/(\d+)$/)?.[1] || 1) + 1;
  const baselineId = `baseline-${String(nextNumber).padStart(4, '0')}`;
  const promotion = JSON.parse(run(process.execPath, nodeArgs('tools/harness-lab/harness-lab.mjs', [
    'promote',
    '--candidate-run',
    candidateResult.resultPath,
    '--compare-report',
    comparePath,
    '--baseline-root',
    DEFAULT_BASELINE_ROOT,
    '--baseline-id',
    baselineId,
    '--expected-previous-baseline-id',
    pointer.baselineId,
    ...(pointerBefore.sha256 ? ['--expected-previous-pointer-sha256', pointerBefore.sha256] : []),
    '--allow-baseline-refresh',
    '--json',
  ]), { env: loopEnv(runId) }).stdout);
  const pointerAfter = await currentPointerSnapshot();
  const receipt = await buildCloseoutReceipt({
    status: 'promoted_ready_for_commit_workflow',
    decisionReason: 'legacy_baseline_refresh_passed_and_promoted',
    blockingGates: [],
    runId,
    candidateResultPath: candidateResult.resultPath,
    compareReportPath: comparePath,
    promotion,
    previousBaselineId: pointer.baselineId,
    promotionPolicy: compareResult.promotionPolicy,
    calibration: {
      schemaVersion: 'moonshot-harness-calibration-decision.v1',
      status: 'baseline_refresh_completed',
      rerunBaseline: false,
      reasons: ['legacy_baseline_refresh', ...refreshReadiness.reasons],
    },
    pointerBefore,
    pointerAfter,
  });
  const closeoutReceiptPath = await writeCloseoutReceipt(runId, receipt);
  return {
    schemaVersion: 'moonshot-harness-loop-refresh-baseline.v1',
    status: 'promoted',
    lifecyclePath: 'baseline_refresh',
    previousBaselineId: pointer.baselineId,
    baselineId: promotion.baselineId,
    backend,
    runId,
    candidateResultPath: candidateResult.resultPath,
    compareReportPath: comparePath,
    refreshReadiness,
    promotion,
    closeoutReceiptPath,
  };
}

async function closeoutLoop(options) {
  const runsRoot = path.resolve(DEFAULT_RUN_ROOT);
  let runId = options.runId;
  if (!runId) {
    const entries = await readdir(runsRoot, { withFileTypes: true }).catch(() => []);
    const candidates = [];
    for (const entry of entries.filter((item) => item.isDirectory())) {
      const receiptPath = path.join(runsRoot, entry.name, 'lab-closeout-receipt.json');
      if (existsSync(receiptPath)) {
        candidates.push({ runId: entry.name, receiptPath, mtimeMs: (await stat(receiptPath)).mtimeMs });
      }
    }
    candidates.sort((left, right) => right.mtimeMs - left.mtimeMs);
    runId = candidates[0]?.runId || '';
  }
  if (!runId) {
    throw new Error('No lab closeout receipt found. Run lab:auto or lab:candidate first.');
  }
  const receiptPath = path.join(runsRoot, runId, 'lab-closeout-receipt.json');
  if (!existsSync(receiptPath)) {
    throw new Error(`Lab closeout receipt not found: ${receiptPath}`);
  }
  const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
  const revalidation = await revalidateCloseoutReceipt(receipt, { receiptPath });
  return {
    schemaVersion: 'moonshot-harness-closeout-read.v1',
    status: receipt.status,
    consumableByCommitWorkflow: revalidation.consumableByCommitWorkflow,
    receiptPath,
    revalidation,
    blockingGates: revalidation.blockingGates,
    receipt,
  };
}

function closeoutExitCode(result) {
  return result?.consumableByCommitWorkflow === true ? 0 : 1;
}

function print(payload, json) {
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  console.log(`${payload.status}: ${payload.baselineId || payload.previousBaselineId || payload.stateRoot || ''}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === 'help') {
    console.log(usage());
    return;
  }
  if (options.command === 'init') {
    options.promoteInitial = true;
    print(await initLoop(options), options.json);
    return;
  }
  if (options.command === 'auto') {
    const result = await autoLoop(options);
    print(result, options.json);
    if (['failed', 'blocked_hard_gate', 'calibration_required'].includes(result.status)) {
      process.exitCode = 1;
    }
    return;
  }
  if (options.command === 'candidate') {
    const result = await candidateLoop(options);
    print(result, options.json);
    if (result.status !== 'passed') {
      process.exitCode = 1;
    }
    return;
  }
  if (options.command === 'calibrate') {
    const result = await calibrationLoop(options);
    print(result, options.json);
    if (result.status !== 'passed') {
      process.exitCode = 1;
    }
    return;
  }
  if (options.command === 'refresh-baseline') {
    const result = await refreshBaselineLoop(options);
    print(result, options.json);
    if (result.status !== 'promoted') {
      process.exitCode = 1;
    }
    return;
  }
  if (options.command === 'auth-smoke') {
    print(await authSmokeLoop(options), options.json);
    return;
  }
  if (options.command === 'closeout') {
    const result = await closeoutLoop(options);
    print(result, options.json);
    process.exitCode = closeoutExitCode(result);
    return;
  }
  if (options.command === 'status') {
    print(await statusLoop(), options.json);
    return;
  }
  throw new Error(`Unknown command: ${options.command}\n${usage()}`);
}

export {
  authSmokeLoop,
  autoLoop,
  buildCandidateSummaryArtifact,
  buildCloseoutReceipt,
  calibrationLoop,
  dockerRunHardeningArgs,
  dockerRunHardeningPolicy,
  candidateLoop,
  closeoutLoop,
  closeoutExitCode,
  dockerScript,
  deriveInstallStatus,
  initLoop,
  normalizeInstalledRuntimeSmoke,
  normalizeCalibrationBaselineFixtureIdentity,
  patchDockerLabResult,
  prepareDockerScript,
  refreshBaselineLoop,
  revalidateCloseoutReceipt,
  rewriteContainerPaths,
  runDockerAuthSmoke,
  runDockerLab,
  scanAuthArtifacts,
  buildBaselineRefreshReadiness,
  selectAutoLifecycle,
  shouldExcludeSourceSnapshotPath,
  statusLoop,
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
