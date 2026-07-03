#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { appendLedgerEvent, readLedger, verifyLedger } from '../../scripts/lib/event-ledger.mjs';
import { redactUnsafeObject, writeEnvironmentSnapshot } from '../../scripts/lib/harness-environment-snapshot.mjs';

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
const RUN_TERMINAL_EVENTS = new Set(['run.completed', 'run.cancelled']);

const usage = () => `Usage:
  node tools/harness-lab/harness-loop.mjs auto [--backend docker|host] [--baseline-ref <git-ref>] [--candidate-root <dir>] [--promote] [--promotion-policy no_regression|strict_improvement] [--min-delta <number>] [--json]
  node tools/harness-lab/harness-loop.mjs init [--backend docker|host] [--baseline-ref <git-ref>] [--candidate-root <dir>] [--baseline-id <id>] [--json]
  node tools/harness-lab/harness-loop.mjs candidate [--backend docker|host] [--candidate-root <dir>] [--run-id <id>] [--promote] [--promotion-policy no_regression|strict_improvement] [--min-delta <number>] [--json]
  node tools/harness-lab/harness-loop.mjs calibrate [--backend docker|host] [--candidate-root <dir>] [--promote] [--json]
  node tools/harness-lab/harness-loop.mjs refresh-baseline [--backend docker|host] [--candidate-root <dir>] [--json]
  node tools/harness-lab/harness-loop.mjs auth-smoke [--backend docker] [--use-host-codex-auth] [--json]
  node tools/harness-lab/harness-loop.mjs closeout [--run-id <candidate-run-id>] [--json]
  node tools/harness-lab/harness-loop.mjs worktrees:status [--json]
  node tools/harness-lab/harness-loop.mjs worktrees:prune [--dry-run] [--retain-current] [--json]
  node tools/harness-lab/harness-loop.mjs status [--json]
  node tools/harness-lab/harness-loop.mjs run-status --run-id <run-id> [--json]
  node tools/harness-lab/harness-loop.mjs resume --run-id <run-id> [--json]
  node tools/harness-lab/harness-loop.mjs cancel --run-id <run-id> --reason <text> [--json]
  node tools/harness-lab/harness-loop.mjs evaluate --run-id <run-id> [--json]
  node tools/harness-lab/harness-loop.mjs evolve --run-id <run-id> --out-run-id <new-run-id> [--hypothesis <text>] [--expected-metric <text>] [--risk <text>] [--rollback <text>] [--consulted-run <id>] [--json]

Initializes and operates the local baseline -> candidate harness loop under .moonshot-relay/harness-lab/.`;

const compactTime = () => new Date().toISOString().replace(/[-:.]/g, '').replace('T', '-').slice(0, 15);
const toPortable = (filePath) => filePath.split(path.sep).join('/');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const sha256File = async (filePath) => sha256(await readFile(filePath));

function canonicalStringify(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalStringify(entry)).join(',')}]`;
  return `{${Object.entries(value)
    .filter(([, nested]) => nested !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalStringify(nested)}`)
    .join(',')}}`;
}

function portablePathRecord(filePath, { root = process.cwd() } = {}) {
  const absolute = path.resolve(filePath);
  const rootAbsolute = path.resolve(root);
  const relative = path.relative(rootAbsolute, absolute);
  if (!relative) {
    return {
      path: absolute,
      portablePath: '.',
    };
  }
  const underRoot = relative && !relative.startsWith('..') && !path.isAbsolute(relative);
  return {
    path: absolute,
    portablePath: underRoot ? toPortable(relative) : toPortable(absolute),
  };
}

function runSpecHash(spec) {
  const { specHash: _specHash, ...hashInput } = spec;
  return sha256(canonicalStringify(hashInput));
}

function buildRunSpec({
  runId,
  objective = 'harness-lab-run',
  lifecyclePath = 'candidate_only',
  backend = 'docker',
  candidateRoot = '.',
  baselineRef = null,
  baselineId = null,
  role = 'candidate',
  fixtureSetId = 'moonshot-harness-default-fixtures',
  scorerVersion = 'moonshot-harness-scorer.v1',
  promotionCriteria = null,
  outputRoot = DEFAULT_RUN_ROOT,
  createdAt = new Date().toISOString(),
  parentRunId = null,
  evolvedFromSpecHash = null,
} = {}) {
  const spec = {
    schemaVersion: 'moonshot-run-spec.v1',
    runId,
    createdAt,
    objective,
    scope: {
      surface: 'harness-lab',
      lifecyclePath,
      role,
    },
    backend,
    candidateRoot: portablePathRecord(candidateRoot),
    baselineRef,
    baselineId,
    fixtureSetId,
    scorerVersion,
    allowedMutationBoundary: {
      source: 'read-only during lab execution',
      generatedState: portablePathRecord(path.join(outputRoot, runId), { root: outputRoot }),
      accountRoot: 'run-local homes only',
    },
    accountRootBoundary: {
      moonshotRelayHome: 'run-local',
      codexHome: 'run-local',
      claudeHome: 'run-local',
    },
    timeoutBudget: {
      suiteDefaultMs: 120000,
    },
    retryBudget: {
      retries: 0,
    },
    lineage: {
      parentRunId,
      evolvedFromSpecHash,
    },
    promotionCriteria: promotionCriteria || {
      authority: 'external-bootstrap-lab',
      candidateOnly: 'smoke_only',
    },
    outputContract: {
      runSpec: 'run-spec.json',
      events: 'events.jsonl',
      labResult: 'lab-result.json',
      environmentSnapshot: 'environment-snapshot.json',
    },
  };
  return {
    ...spec,
    specHash: runSpecHash(spec),
  };
}

async function writeRunKernelStart({
  runId,
  sourceRoot = '.',
  outRoot = DEFAULT_RUN_ROOT,
  lifecyclePath = 'candidate_only',
  backend = 'docker',
  role = 'candidate',
  baselineRef = null,
  baselineId = null,
  promotionCriteria = null,
  parentRunId = null,
  evolvedFromSpecHash = null,
  snapshotWriter = writeEnvironmentSnapshot,
} = {}) {
  const runRoot = path.resolve(outRoot, runId);
  await mkdir(runRoot, { recursive: true });
  const spec = buildRunSpec({
    runId,
    objective: `harness-lab-${lifecyclePath}`,
    lifecyclePath,
    backend,
    candidateRoot: sourceRoot,
    baselineRef,
    baselineId,
    role,
    promotionCriteria,
    outputRoot: outRoot,
    parentRunId,
    evolvedFromSpecHash,
  });
  const specPath = path.join(runRoot, 'run-spec.json');
  const eventsPath = path.join(runRoot, 'events.jsonl');
  if (existsSync(specPath)) {
    const existing = JSON.parse(await readFile(specPath, 'utf8'));
    const existingComputedSpecHash = runSpecHash(existing);
    if (existing.specHash !== existingComputedSpecHash || existing.specHash !== spec.specHash) {
      throw new Error(`run-spec mutation rejected for ${runId}: existing ${existing.specHash} computed ${existingComputedSpecHash} new ${spec.specHash}`);
    }
  } else {
    await writeFile(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  }
  if (!existsSync(eventsPath)) {
    await appendLedgerEvent(eventsPath, {
      type: 'run.spec_written',
      payload: { runId, specPath, specHash: spec.specHash },
    });
    await appendLedgerEvent(eventsPath, {
      type: 'run.started',
      payload: { runId, specHash: spec.specHash, lifecyclePath, backend, parentRunId, evolvedFromSpecHash },
    });
  }
  const environmentSnapshot = await snapshotWriter({
    runRoot,
    sourceRoot,
    runId,
    specHash: spec.specHash,
    extra: {
      lifecyclePath,
      backend,
      parentRunId,
      evolvedFromSpecHash,
    },
  }).catch((error) => ({
    path: path.join(runRoot, 'environment-snapshot.json'),
    sha256: '',
    snapshot: {
      schemaVersion: 'moonshot-harness-environment-snapshot.v1',
      status: 'snapshot_unavailable',
      reason: error instanceof Error ? error.message : String(error),
      promotionAuthority: false,
    },
  }));
  return { runRoot, spec, specHash: spec.specHash, specPath, eventsPath, environmentSnapshot };
}

async function appendRunEvent(kernel, type, payload = {}) {
  if (!kernel?.eventsPath) return null;
  return appendLedgerEvent(kernel.eventsPath, { type, payload });
}

async function bindRunKernelToLabResult(resultPath, kernel) {
  if (!resultPath || !existsSync(resultPath) || !kernel?.specHash) return null;
  const payload = JSON.parse(await readFile(resultPath, 'utf8'));
  const patched = {
    ...payload,
    run: {
      ...(payload.run || {}),
      specHash: kernel.specHash,
      runSpecPath: kernel.specPath,
      eventsPath: kernel.eventsPath,
    },
    runKernel: {
      schemaVersion: 'moonshot-run-kernel-binding.v1',
      specHash: kernel.specHash,
      runSpecPath: kernel.specPath,
      eventsPath: kernel.eventsPath,
    },
  };
  await writeFile(resultPath, `${JSON.stringify(patched, null, 2)}\n`);
  await appendRunEvent(kernel, 'artifact.written', {
    artifactKind: 'lab-result',
    path: resultPath,
    sha256: await sha256File(resultPath),
  });
  return { ...patched, resultPath };
}

async function bindRunKernelToJsonArtifact(filePath, kernel, artifactKind) {
  if (!filePath || !existsSync(filePath) || !kernel?.specHash) return null;
  const payload = JSON.parse(await readFile(filePath, 'utf8'));
  const patched = {
    ...payload,
    runKernel: {
      ...(payload.runKernel || {}),
      schemaVersion: 'moonshot-run-kernel-binding.v1',
      specHash: kernel.specHash,
      runSpecPath: kernel.specPath,
      eventsPath: kernel.eventsPath,
    },
    specHash: kernel.specHash,
  };
  await writeFile(filePath, `${JSON.stringify(patched, null, 2)}\n`);
  await appendRunEvent(kernel, 'artifact.written', {
    artifactKind,
    path: filePath,
    sha256: await sha256File(filePath),
  });
  return patched;
}

function runKernelFromArtifact(artifact) {
  const binding = artifact?.runKernel || artifact?.run || {};
  const specHash = binding.specHash || null;
  if (!specHash) return null;
  return {
    specHash,
    specPath: binding.runSpecPath || binding.specPath || null,
    eventsPath: binding.eventsPath || null,
  };
}

function runRootFor(runId, { runsRoot = DEFAULT_RUN_ROOT } = {}) {
  if (!runId) throw new Error('--run-id is required');
  return path.resolve(runsRoot, runId);
}

function terminalEvent(events = []) {
  return [...events].reverse().find((event) => RUN_TERMINAL_EVENTS.has(event.type)) || null;
}

function artifactKernelBinding(artifact) {
  if (!artifact) return null;
  const binding = artifact.runKernel || artifact.run || artifact;
  return {
    specHash: binding.specHash || null,
    runSpecPath: binding.runSpecPath || binding.specPath || null,
    eventsPath: binding.eventsPath || null,
  };
}

async function artifactConsistencyFor({ artifacts = {}, specHash, specPath, eventsPath, events = [] }) {
  const artifactEntries = Object.entries(artifacts).filter(([, artifact]) => artifact);
  const staleArtifacts = [];
  for (const [artifactKind, artifact] of artifactEntries) {
    const binding = artifactKernelBinding(artifact);
    if (!binding?.specHash && !binding?.runSpecPath && !binding?.eventsPath) continue;
    const reasons = [];
    if (binding.specHash && binding.specHash !== specHash) reasons.push('spec_hash_mismatch');
    if (binding.runSpecPath && path.resolve(binding.runSpecPath) !== path.resolve(specPath)) reasons.push('run_spec_path_mismatch');
    if (binding.eventsPath && path.resolve(binding.eventsPath) !== path.resolve(eventsPath)) reasons.push('events_path_mismatch');
    if (reasons.length > 0) staleArtifacts.push({ artifactKind, reasons, binding });
  }
  const artifactHashEvents = events.filter((event) => event.type === 'artifact.written' && event.payload?.path && event.payload?.sha256);
  for (const event of artifactHashEvents) {
    const artifactPath = event.payload.path;
    if (!existsSync(artifactPath)) {
      staleArtifacts.push({
        artifactKind: event.payload.artifactKind || 'unknown',
        reasons: ['artifact_missing'],
        binding: { path: artifactPath, expectedSha256: event.payload.sha256 },
      });
      continue;
    }
    const actualSha256 = await sha256File(artifactPath);
    staleArtifacts.push({
      artifactKind: event.payload.artifactKind || 'unknown',
      reasons: actualSha256 === event.payload.sha256 ? [] : ['artifact_hash_mismatch'],
      binding: { path: artifactPath, expectedSha256: event.payload.sha256, actualSha256 },
    });
  }
  const filteredStaleArtifacts = staleArtifacts.filter((entry) => entry.reasons.length > 0);
  return {
    status: filteredStaleArtifacts.length === 0 ? 'passed' : 'stale',
    staleArtifacts: filteredStaleArtifacts,
  };
}

async function loadRunProjection({ runId, runsRoot = DEFAULT_RUN_ROOT } = {}) {
  const runRoot = runRootFor(runId, { runsRoot });
  const specPath = path.join(runRoot, 'run-spec.json');
  const eventsPath = path.join(runRoot, 'events.jsonl');
  if (!existsSync(runRoot) || !existsSync(specPath)) {
    return {
      schemaVersion: 'moonshot-run-status.v1',
      status: 'not_found',
      runId,
      runRoot,
      specPath,
      eventsPath,
      valid: false,
      reason: 'run spec not found',
    };
  }
  const spec = await readJsonIfExists(specPath);
  const expectedSpecHash = spec ? runSpecHash(spec) : null;
  const specHashValid = Boolean(spec?.specHash && spec.specHash === expectedSpecHash);
  let events = [];
  let ledgerVerification = { valid: false, reason: 'events ledger not found' };
  if (existsSync(eventsPath)) {
    try {
      events = await readLedger(eventsPath);
      ledgerVerification = verifyLedger(events);
    } catch (error) {
      ledgerVerification = { valid: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }
  const artifacts = {
    labResult: await readJsonIfExists(path.join(runRoot, 'lab-result.json')),
    candidateSummary: await readJsonIfExists(path.join(runRoot, 'candidate-summary.json')),
    closeoutReceipt: await readJsonIfExists(path.join(runRoot, 'lab-closeout-receipt.json')),
    verdict: await readJsonIfExists(path.join(runRoot, 'verdict.json')),
  };
  const artifactConsistency = await artifactConsistencyFor({
    artifacts,
    specHash: spec?.specHash || '',
    specPath,
    eventsPath,
    events,
  });
  const terminal = terminalEvent(events);
  const terminalEventLast = !terminal || RUN_TERMINAL_EVENTS.has(events.at(-1)?.type);
  const valid = specHashValid && ledgerVerification.valid && terminalEventLast;
  const status = !valid
    ? 'invalid'
    : (artifactConsistency.status === 'stale'
      ? 'stale'
      : (terminal?.type === 'run.cancelled'
        ? 'cancelled'
        : (terminal?.type === 'run.completed' ? 'completed' : 'running')));
  return {
    schemaVersion: 'moonshot-run-status.v1',
    status,
    runId,
    runRoot,
    specPath,
    eventsPath,
    valid,
    specHash: spec?.specHash || null,
    expectedSpecHash,
    specHashValid,
    ledgerValid: ledgerVerification.valid,
    ledgerVerification,
    terminalEventLast,
    terminal: Boolean(terminal),
    terminalEvent: terminal,
    lastEvent: events.at(-1) || null,
    eventCount: events.length,
    artifactConsistency,
    artifacts: Object.fromEntries(Object.entries(artifacts).map(([key, value]) => [key, Boolean(value)])),
    artifactDetails: artifacts,
    spec,
  };
}

async function runStatusLoop(options = {}) {
  return loadRunProjection({
    runId: options.runId,
    runsRoot: options.runsRoot || DEFAULT_RUN_ROOT,
  });
}

async function resumeLoop(options = {}) {
  const projection = await loadRunProjection({
    runId: options.runId,
    runsRoot: options.runsRoot || DEFAULT_RUN_ROOT,
  });
  if (!projection.valid) {
    return {
      schemaVersion: 'moonshot-run-resume.v1',
      status: 'invalid',
      runId: options.runId,
      resumable: false,
      projection,
    };
  }
  if (projection.terminal) {
    return {
      schemaVersion: 'moonshot-run-resume.v1',
      status: 'terminal_noop',
      runId: options.runId,
      resumable: false,
      projection,
    };
  }
  return {
    schemaVersion: 'moonshot-run-resume.v1',
    status: 'manual_resume_required',
    runId: options.runId,
    resumable: true,
    reason: 'initial lifecycle command is replay-only; execution continuation remains with candidate/calibrate flows',
    projection,
  };
}

async function cancelLoop(options = {}) {
  if (!options.reason) throw new Error('--reason is required');
  const projection = await loadRunProjection({
    runId: options.runId,
    runsRoot: options.runsRoot || DEFAULT_RUN_ROOT,
  });
  if (!projection.valid) {
    return {
      schemaVersion: 'moonshot-run-cancel.v1',
      status: 'invalid',
      runId: options.runId,
      projection,
    };
  }
  if (projection.terminal) {
    return {
      schemaVersion: 'moonshot-run-cancel.v1',
      status: 'terminal_noop',
      runId: options.runId,
      projection,
    };
  }
  const event = await appendLedgerEvent(projection.eventsPath, {
    type: 'run.cancelled',
    payload: {
      runId: options.runId,
      specHash: projection.specHash,
      reason: options.reason,
    },
  });
  return {
    schemaVersion: 'moonshot-run-cancel.v1',
    status: 'cancelled',
    runId: options.runId,
    event,
    projection: await loadRunProjection({
      runId: options.runId,
      runsRoot: options.runsRoot || DEFAULT_RUN_ROOT,
    }),
  };
}

function artifactStatusCheck(id, payload) {
  if (!payload) return { id, status: 'skipped', reason: 'artifact absent' };
  if (id === 'lab_result_status') {
    return {
      id,
      status: payload.status === 'passed' ? 'passed' : 'failed',
      reason: payload.status === 'passed' ? '' : `lab result status is ${payload.status || 'missing'}`,
    };
  }
  if (id === 'candidate_summary_status') {
    const passed = payload.status === 'passed' && payload.promotable !== false;
    return {
      id,
      status: passed ? 'passed' : 'failed',
      reason: passed ? '' : `candidate summary status=${payload.status || 'missing'} promotable=${payload.promotable}`,
    };
  }
  if (id === 'closeout_receipt_status') {
    const passed = payload.status === 'passed' && payload.consumableByCommitWorkflow === true;
    return {
      id,
      status: passed ? 'passed' : 'failed',
      reason: passed ? '' : `closeout receipt status=${payload.status || 'missing'} consumableByCommitWorkflow=${payload.consumableByCommitWorkflow}`,
    };
  }
  return { id, status: 'failed', reason: 'unknown artifact check' };
}

function evaluateRunArtifacts(projection) {
  const details = projection.artifactDetails || {};
  const complete = Boolean(details.labResult || details.candidateSummary || details.closeoutReceipt);
  const artifactChecks = [
    artifactStatusCheck('lab_result_status', details.labResult),
    artifactStatusCheck('candidate_summary_status', details.candidateSummary),
    artifactStatusCheck('closeout_receipt_status', details.closeoutReceipt),
  ];
  const checks = [
    {
      id: 'spec_hash_valid',
      status: projection.specHashValid ? 'passed' : 'failed',
    },
    {
      id: 'event_ledger_valid',
      status: projection.ledgerValid ? 'passed' : 'failed',
    },
    {
      id: 'artifact_consistency',
      status: projection.artifactConsistency.status === 'passed' ? 'passed' : 'failed',
    },
    {
      id: 'lab_or_closeout_artifact_present',
      status: complete ? 'passed' : 'failed',
    },
    ...artifactChecks,
  ];
  const blockingChecks = checks.filter((check) => check.status === 'failed');
  return {
    status: !complete ? 'incomplete' : (blockingChecks.length === 0 ? 'passed' : 'failed'),
    complete,
    checks,
  };
}

async function evaluateLoop(options = {}) {
  const projection = await loadRunProjection({
    runId: options.runId,
    runsRoot: options.runsRoot || DEFAULT_RUN_ROOT,
  });
  if (!projection.valid || projection.status === 'stale') {
    return {
      schemaVersion: 'moonshot-run-evaluate.v1',
      status: 'invalid',
      runId: options.runId,
      projection,
    };
  }
  const artifactVerdict = evaluateRunArtifacts(projection);
  const verdict = {
    schemaVersion: 'moonshot-run-verdict.v1',
    runId: options.runId,
    status: artifactVerdict.status,
    authority: 'derived_run_kernel_verdict',
    promotionAuthority: false,
    promotionAuthorityReason: 'H0 compare/promote receipt remains required for promotion claims',
    specHash: projection.specHash,
    runSpecPath: projection.specPath,
    eventsPath: projection.eventsPath,
    terminal: projection.terminal,
    artifactVerdict,
  };
  const verdictPath = path.join(projection.runRoot, 'verdict.json');
  await writeFile(verdictPath, `${JSON.stringify(verdict, null, 2)}\n`);
  let eventAppendStatus = 'skipped_terminal';
  if (!projection.terminal) {
    await appendLedgerEvent(projection.eventsPath, {
      type: 'artifact.written',
      payload: {
        artifactKind: 'verdict',
        path: verdictPath,
        sha256: await sha256File(verdictPath),
        specHash: projection.specHash,
      },
    });
    eventAppendStatus = 'appended';
    if (artifactVerdict.complete) {
      await appendLedgerEvent(projection.eventsPath, {
        type: 'run.completed',
        payload: {
          runId: options.runId,
          specHash: projection.specHash,
          status: artifactVerdict.status,
          verdictPath,
        },
      });
      eventAppendStatus = 'appended_terminal';
    }
  }
  return {
    schemaVersion: 'moonshot-run-evaluate.v1',
    status: artifactVerdict.complete ? 'verdict_written' : 'incomplete',
    runId: options.runId,
    verdictPath,
    eventAppendStatus,
    verdict,
    projection: await loadRunProjection({
      runId: options.runId,
      runsRoot: options.runsRoot || DEFAULT_RUN_ROOT,
    }),
  };
}

async function evolveLoop(options = {}) {
  if (!options.outRunId) throw new Error('--out-run-id is required');
  const runsRoot = options.runsRoot || DEFAULT_RUN_ROOT;
  const projection = await loadRunProjection({ runId: options.runId, runsRoot });
  if (!projection.valid || projection.status === 'stale') {
    return {
      schemaVersion: 'moonshot-run-evolve.v1',
      status: 'invalid',
      runId: options.runId,
      outRunId: options.outRunId,
      projection,
    };
  }
  const kernel = await writeRunKernelStart({
    runId: options.outRunId,
    sourceRoot: projection.spec?.candidateRoot?.path || '.',
    outRoot: runsRoot,
    lifecyclePath: 'evolve',
    backend: projection.spec?.backend || options.backend || 'docker',
    role: 'candidate',
    baselineRef: projection.spec?.baselineRef || null,
    baselineId: projection.spec?.baselineId || null,
    promotionCriteria: projection.spec?.promotionCriteria || null,
    parentRunId: options.runId,
    evolvedFromSpecHash: projection.specHash,
  });
  await appendLedgerEvent(kernel.eventsPath, {
    type: 'run.evolved',
    payload: {
      runId: options.outRunId,
      parentRunId: options.runId,
      parentSpecHash: projection.specHash,
      specHash: kernel.specHash,
    },
  });
  const proposal = await writeEvolveProposal({
    kernel,
    parentProjection: projection,
    options,
  });
  return {
    schemaVersion: 'moonshot-run-evolve.v1',
    status: 'created',
    runId: options.runId,
    outRunId: options.outRunId,
    parentSpecHash: projection.specHash,
    runSpecPath: kernel.specPath,
    eventsPath: kernel.eventsPath,
    environmentSnapshotPath: kernel.environmentSnapshot?.path || '',
    proposalPath: proposal.path,
    specHash: kernel.specHash,
  };
}

async function writeEvolveProposal({ kernel, parentProjection, options }) {
  const warnings = [];
  const consultedRuns = Array.isArray(options.consultedRun)
    ? options.consultedRun
    : (options.consultedRun ? [options.consultedRun] : []);
  const consultedArtifacts = [];
  for (const consultedRunId of consultedRuns) {
    const consultedProjection = await loadRunProjection({
      runId: consultedRunId,
      runsRoot: options.runsRoot || DEFAULT_RUN_ROOT,
    });
    consultedArtifacts.push({
      runId: consultedRunId,
      status: consultedProjection.status,
      specHash: consultedProjection.specHash || '',
      runSpecPath: consultedProjection.valid ? consultedProjection.specPath : '',
      runSpecSha256: consultedProjection.valid && existsSync(consultedProjection.specPath)
        ? `sha256:${await sha256File(consultedProjection.specPath)}`
        : '',
      labResultPath: existsSync(path.join(consultedProjection.runRoot, 'lab-result.json'))
        ? path.join(consultedProjection.runRoot, 'lab-result.json')
        : '',
      labResultSha256: existsSync(path.join(consultedProjection.runRoot, 'lab-result.json'))
        ? `sha256:${await sha256File(path.join(consultedProjection.runRoot, 'lab-result.json'))}`
        : '',
    });
  }
  const proposal = {
    schemaVersion: 'moonshot-harness-evolve-proposal.v1',
    createdAt: new Date().toISOString(),
    runId: options.outRunId,
    parentRunId: options.runId,
    parentSpecHash: parentProjection.specHash,
    childSpecHash: kernel.specHash,
    consultedArtifacts,
    hypothesis: options.hypothesis || 'operator-supplied follow-up proposal pending',
    expectedMetric: options.expectedMetric || 'no metric claim; proposal is preparation-only',
    risk: options.risk || 'proposal is non-authoritative and cannot promote by itself',
    rollback: options.rollback || `remove generated child run output ${kernel.runRoot}`,
    verificationPlan: [
      'run H0 candidate/compare evidence before any improvement claim',
      'run package/eval gates before closeout',
      'keep proposalAuthority false',
    ],
    promotionAuthority: false,
  };
  const sanitized = redactUnsafeObject(proposal, warnings, 'proposal');
  sanitized.redaction = {
    status: warnings.length > 0 ? 'redacted' : 'clean',
    warnings,
  };
  const proposalPath = path.join(kernel.runRoot, 'evolve-proposal.json');
  await writeFile(proposalPath, `${JSON.stringify(sanitized, null, 2)}\n`);
  await appendRunEvent(kernel, 'artifact.written', {
    artifactKind: 'evolve-proposal',
    path: proposalPath,
    sha256: await sha256File(proposalPath),
    specHash: kernel.specHash,
  });
  await appendRunEvent(kernel, 'proposal.written', {
    runId: options.outRunId,
    parentRunId: options.runId,
    proposalPath,
    promotionAuthority: false,
  });
  return { path: proposalPath, proposal: sanitized };
}

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
    consultedRun: [],
  };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--promote') {
      options.promote = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--retain-current') {
      options.retainCurrent = true;
    } else if (arg === '--use-host-codex-auth') {
      options.useHostCodexAuth = true;
    } else if (arg === '--codex-dev-smoke') {
      options.codexDevSmoke = true;
    } else if (arg === '--help' || arg === '-h') {
      options.command = 'help';
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      const value = rest[++index] || '';
      if (key === 'consultedRun') {
        options.consultedRun.push(value);
      } else {
        options[key] = value;
      }
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

async function runCommandWithEvents(kernel, {
  commandId,
  suiteId = 'harness-loop',
  command,
  args,
  cwd = process.cwd(),
  env = process.env,
  expect = 0,
}) {
  const startedAt = Date.now();
  await appendRunEvent(kernel, 'command.started', {
    commandId,
    suiteId,
    cwd,
    command: [command, ...args],
    timeoutMs: null,
  });
  const result = run(command, args, { cwd, env, expect: null });
  const exitCode = result.status ?? (result.error ? 1 : 0);
  const passed = expect === null || exitCode === expect;
  await appendRunEvent(kernel, 'command.completed', {
    commandId,
    suiteId,
    exitCode,
    durationMs: Date.now() - startedAt,
    status: passed ? 'passed' : 'failed',
  });
  if (!passed) {
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
    specHash: summary.specHash || null,
    runSpecPath: summary.runSpecPath || null,
    eventsPath: summary.eventsPath || null,
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

function firstNumber(...values) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
}

function firstFailureClass(...collections) {
  for (const collection of collections) {
    if (!Array.isArray(collection)) continue;
    const failureClass = collection.find((entry) => entry?.failureClass && entry.failureClass !== 'none')?.failureClass;
    if (failureClass) return failureClass;
  }
  return 'none';
}

function buildLabResultSummaryContract({
  labResult = null,
  compareReport = null,
  runStatus = null,
  closeoutReceipt = null,
  candidateResultPath = '',
  baselineResultPath = '',
  closeoutReceiptPath = '',
} = {}) {
  const differentialEntries = Array.isArray(compareReport?.differential)
    ? compareReport.differential
    : (Array.isArray(labResult?.differential) ? labResult.differential : []);
  const regressions = Array.isArray(compareReport?.regressions) ? compareReport.regressions : [];
  const promotionBlockers = Array.isArray(labResult?.promotion?.blockers) ? labResult.promotion.blockers : [];
  const blockingGates = Array.isArray(closeoutReceipt?.blockingGates) ? closeoutReceipt.blockingGates : [];
  const failureClass = firstFailureClass(regressions, differentialEntries, promotionBlockers, blockingGates);
  const staleArtifacts = Array.isArray(runStatus?.artifactConsistency?.staleArtifacts)
    ? runStatus.artifactConsistency.staleArtifacts
    : [];
  const score = firstNumber(
    labResult?.score,
    labResult?.quantitative?.candidate?.normalizedScore,
    labResult?.candidate?.normalizedScore,
    compareReport?.candidate?.normalizedScore,
  );

  return {
    schemaVersion: 'moonshot-harness-lab-result-summary.v1',
    status: labResult?.status || compareReport?.status || closeoutReceipt?.status || 'unknown',
    score,
    failureClass,
    candidateResultPath: candidateResultPath || closeoutReceipt?.candidateResultPath || labResult?.resultPath || '',
    baselineResultPath: baselineResultPath || compareReport?.baselineResultPath || '',
    differential: {
      failureClass,
      failedCount: differentialEntries.filter((entry) => entry?.status !== 'passed').length + regressions.length,
      entries: differentialEntries,
      regressions,
    },
    artifactConsistency: {
      status: runStatus?.artifactConsistency?.status || 'not_recorded',
      staleArtifacts,
    },
    promotionDecision: closeoutReceipt?.status || labResult?.promotion?.status || (compareReport?.promotable === true
      ? 'promotable'
      : (compareReport?.status === 'failed' ? 'blocked_hard_gate' : 'not_evaluated')),
    closeoutReceiptPath,
    consumableByCommitWorkflow: closeoutReceipt?.consumableByCommitWorkflow === true,
    compareHash: closeoutReceipt?.compareReportSha256 || null,
    candidateHash: closeoutReceipt?.candidateRunSha256 || null,
  };
}

async function writeCandidateSummaryArtifact(summary) {
  const summaryPath = path.join(path.resolve(DEFAULT_RUN_ROOT), summary.runId, 'candidate-summary.json');
  await mkdir(path.dirname(summaryPath), { recursive: true });
  const payload = buildCandidateSummaryArtifact(summary);
  await writeFile(summaryPath, `${JSON.stringify(payload, null, 2)}\n`);
  if (summary.eventsPath && summary.specHash) {
    await appendLedgerEvent(summary.eventsPath, {
      type: 'artifact.written',
      payload: {
        artifactKind: 'candidate-summary',
        path: summaryPath,
        sha256: await sha256File(summaryPath),
      },
    });
  }
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
    specHash: candidateRun?.run?.specHash || candidateRun?.runKernel?.specHash || null,
    runSpecPath: candidateRun?.run?.runSpecPath || candidateRun?.runKernel?.runSpecPath || null,
    eventsPath: candidateRun?.run?.eventsPath || candidateRun?.runKernel?.eventsPath || null,
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
  if (receipt.eventsPath && receipt.specHash) {
    const receiptSha256 = await sha256File(receiptPath);
    await appendLedgerEvent(receipt.eventsPath, {
      type: 'verdict.written',
      payload: {
        status: receipt.status,
        baselineId: receipt.baselineId || null,
        reason: receipt.decisionReason || null,
        blockingGates: receipt.blockingGates || [],
        verdictPath: receiptPath,
        sha256: receiptSha256,
      },
    });
    if (['promoted_ready_for_commit_workflow', 'rejected_no_commit'].includes(receipt.status)) {
      await appendLedgerEvent(receipt.eventsPath, {
        type: 'promotion.eligible',
        payload: {
          compareReportPath: receipt.compareReportPath || null,
          policyMode: receipt.promotionPolicy?.mode || null,
          status: receipt.status,
        },
      });
    }
    if (receipt.status === 'promoted_ready_for_commit_workflow') {
      await appendLedgerEvent(receipt.eventsPath, {
        type: 'promotion.completed',
        payload: {
          status: receipt.status,
          baselineId: receipt.baselineId || null,
          manifestPath: receipt.promotionManifestPath || null,
          pointerSha256: receipt.baselinePointerAfter?.sha256 || null,
          verdictPath: receiptPath,
          sha256: receiptSha256,
        },
      });
    } else if (receipt.status === 'blocked_hard_gate') {
      await appendLedgerEvent(receipt.eventsPath, {
        type: 'promotion.blocked',
        payload: {
          status: receipt.status,
          baselineId: receipt.baselineId || null,
          reason: receipt.decisionReason || null,
          blockingGates: receipt.blockingGates || [],
          verdictPath: receiptPath,
          sha256: receiptSha256,
        },
      });
    }
    await appendLedgerEvent(receipt.eventsPath, {
      type: 'run.completed',
      payload: {
        status: receipt.status,
        resultPath: receiptPath,
      },
    });
  }
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

  const runKernelFieldCount = [receipt.specHash, receipt.runSpecPath, receipt.eventsPath].filter(Boolean).length;
  if (runKernelFieldCount === 0) {
    addCloseoutCheck(checks, 'run_kernel_legacy_compatibility', true, {
      compatibilityMode: 'legacy_run_spec_missing',
    });
  } else {
    addCloseoutCheck(checks, 'run_kernel_fields_complete', runKernelFieldCount === 3, {
      specHash: receipt.specHash || null,
      runSpecPath: receipt.runSpecPath || null,
      eventsPath: receipt.eventsPath || null,
    });
    const runSpec = receipt.runSpecPath && existsSync(receipt.runSpecPath)
      ? await readJsonIfExists(receipt.runSpecPath)
      : null;
    const computedSpecHash = runSpec ? runSpecHash(runSpec) : null;
    addCloseoutCheck(checks, 'run_spec_exists', Boolean(runSpec), {
      runSpecPath: receipt.runSpecPath || null,
    });
    addCloseoutCheck(checks, 'run_spec_hash_matches_receipt', Boolean(runSpec)
      && runSpec.specHash === receipt.specHash
      && computedSpecHash === receipt.specHash, {
      expected: receipt.specHash || null,
      actual: runSpec?.specHash || null,
      computed: computedSpecHash,
    });
    const eventLedgerExists = Boolean(receipt.eventsPath && existsSync(receipt.eventsPath));
    let events = [];
    let ledgerVerification = { valid: false };
    let ledgerReadError = '';
    if (eventLedgerExists) {
      try {
        events = await readLedger(receipt.eventsPath);
        ledgerVerification = verifyLedger(events);
      } catch (error) {
        ledgerReadError = error instanceof Error ? error.message : String(error);
      }
    }
    addCloseoutCheck(checks, 'event_ledger_exists', eventLedgerExists, {
      eventsPath: receipt.eventsPath || null,
    });
    addCloseoutCheck(checks, 'event_ledger_hash_chain_valid', ledgerVerification.valid === true, {
      eventCount: events.length,
      error: ledgerReadError || null,
    });
    addCloseoutCheck(checks, 'event_ledger_terminal_event_last', ['run.completed', 'run.cancelled'].includes(events.at(-1)?.type), {
      lastType: events.at(-1)?.type || null,
    });
    addCloseoutCheck(checks, 'event_ledger_spec_hash_matches_receipt', events.every((event) => {
      const eventSpecHash = event.payload?.specHash;
      return !eventSpecHash || eventSpecHash === receipt.specHash;
    }), {
      expected: receipt.specHash || null,
    });
  }

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
  runKernel = null,
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
  if (runKernel) {
    return bindRunKernelToLabResult(resultPath, runKernel);
  }
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
  lifecyclePath = 'candidate_only',
  baselineRef = null,
  baselineId = null,
  promotionCriteria = null,
}) {
  if (codexDevSmoke && !useHostCodexAuth) {
    throw new Error('--codex-dev-smoke requires --use-host-codex-auth');
  }
  assertDockerAvailable();
  await mkdir(outRoot, { recursive: true });
  const runKernel = await writeRunKernelStart({
    runId,
    sourceRoot,
    outRoot,
    lifecyclePath,
    backend: 'docker',
    role,
    baselineRef,
    baselineId,
    promotionCriteria,
  });
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
  const result = await runCommandWithEvents(runKernel, {
    commandId: `${role}.docker_lab`,
    command: 'docker',
    args,
  });
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
    runKernel,
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
  const runKernel = await writeRunKernelStart({
    runId,
    sourceRoot,
    outRoot,
    lifecyclePath: 'auth_smoke',
    backend: 'docker',
    role,
  });
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
  await runCommandWithEvents(runKernel, {
    commandId: 'auth-smoke.docker',
    command: 'docker',
    args,
  });
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
    specHash: runKernel.specHash,
    runSpecPath: runKernel.specPath,
    eventsPath: runKernel.eventsPath,
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
  await appendRunEvent(runKernel, 'artifact.written', {
    artifactKind: 'auth-smoke-summary',
    path: summaryPath,
    sha256: await sha256File(summaryPath),
  });
  await appendRunEvent(runKernel, 'run.completed', {
    status: summary.status,
    resultPath: summaryPath,
  });
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

function normalizeForBoundary(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isPathInside(parent, child) {
  const parentPath = normalizeForBoundary(parent);
  const childPath = normalizeForBoundary(child);
  const relative = path.relative(parentPath, childPath);
  return relative === '' || (relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

function parseGitWorktreePorcelain(text = '') {
  const entries = [];
  let current = null;
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) {
      if (current) {
        entries.push(current);
        current = null;
      }
      continue;
    }
    const [key, ...rest] = line.split(' ');
    const value = rest.join(' ');
    if (key === 'worktree') {
      if (current) entries.push(current);
      current = { path: value, head: '', branch: '', detached: false, bare: false, prunable: false };
    } else if (current && key === 'HEAD') {
      current.head = value;
    } else if (current && key === 'branch') {
      current.branch = value;
    } else if (current && key === 'detached') {
      current.detached = true;
    } else if (current && key === 'bare') {
      current.bare = true;
    } else if (current && key === 'prunable') {
      current.prunable = true;
    }
  }
  if (current) entries.push(current);
  return entries;
}

function parseHarnessWorktreeId(worktreePath) {
  const name = path.basename(worktreePath);
  const match = /^(baseline-\d+)(?:-(calibration|initial|refresh))?-(\d{8}-\d{6})$/.exec(name)
    || /^(baseline-\d+)$/.exec(name);
  return {
    id: name,
    baselineId: match?.[1] || '',
    purpose: match?.[2] || 'baseline',
    createdAtCompact: match?.[3] || '',
  };
}

function classifyHarnessWorktree(entry, {
  worktreeRoot = DEFAULT_WORKTREE_ROOT,
  currentBaselineId = '',
  dirtyStatusShort = '',
  retainCurrent = false,
} = {}) {
  const resolvedRoot = path.resolve(worktreeRoot);
  const resolvedPath = path.resolve(entry.path || '');
  const identity = parseHarnessWorktreeId(resolvedPath);
  const insideHarnessRoot = isPathInside(resolvedRoot, resolvedPath) && resolvedPath !== resolvedRoot;
  const detached = entry.detached === true || (!entry.branch && Boolean(entry.head));
  const dirty = Boolean(String(dirtyStatusShort || '').trim());
  const reasons = [];
  if (!insideHarnessRoot) reasons.push('outside_harness_worktree_root');
  if (!detached) reasons.push('not_detached_worktree');
  if (dirty) reasons.push('dirty_or_untracked_worktree');
  if (retainCurrent && identity.baselineId && identity.baselineId === currentBaselineId) {
    reasons.push('current_baseline_retained_by_operator');
  }
  const prunable = reasons.length === 0;
  return {
    ...identity,
    path: resolvedPath,
    head: entry.head || '',
    branch: entry.branch || '',
    detached,
    insideHarnessRoot,
    dirty,
    dirtyStatusShort: dirtyStatusShort || '',
    prunable,
    action: prunable ? 'remove' : 'retain',
    retainReason: reasons[0] || '',
    reasons,
    retentionTtlHours: prunable ? 0 : 72,
  };
}

async function listHarnessWorktrees({ retainCurrent = false } = {}) {
  const listed = run('git', ['worktree', 'list', '--porcelain'], { env: gitEnv(), expect: null });
  const currentPointer = await readCurrentPointer();
  const entries = parseGitWorktreePorcelain(listed.stdout)
    .filter((entry) => isPathInside(path.resolve(DEFAULT_WORKTREE_ROOT), path.resolve(entry.path || ''))
      && path.resolve(entry.path || '') !== path.resolve(DEFAULT_WORKTREE_ROOT));
  const worktrees = [];
  for (const entry of entries) {
    let dirtyStatusShort = '';
    const status = run('git', ['-C', entry.path, 'status', '--short'], { env: gitEnv(), expect: null });
    if ((status.status ?? 1) === 0) {
      dirtyStatusShort = status.stdout.trim();
    } else {
      dirtyStatusShort = `status_unavailable: ${status.stderr || status.stdout || status.error?.message || 'unknown'}`;
    }
    worktrees.push(classifyHarnessWorktree(entry, {
      currentBaselineId: currentPointer?.baselineId || '',
      dirtyStatusShort,
      retainCurrent,
    }));
  }
  return {
    schemaVersion: 'moonshot-harness-worktree-status.v1',
    status: 'ready',
    worktreeRoot: path.resolve(DEFAULT_WORKTREE_ROOT),
    currentBaselineId: currentPointer?.baselineId || '',
    totalCount: worktrees.length,
    prunableCount: worktrees.filter((entry) => entry.prunable).length,
    retainedCount: worktrees.filter((entry) => !entry.prunable).length,
    worktrees,
  };
}

async function writeWorktreeRetentionManifest(retained, { dryRun = false } = {}) {
  const manifestPath = path.resolve(DEFAULT_WORKTREE_ROOT, 'retention-manifest.json');
  await mkdir(path.dirname(manifestPath), { recursive: true });
  const manifest = {
    schemaVersion: 'moonshot-harness-worktree-retention.v1',
    generatedAt: new Date().toISOString(),
    dryRun,
    retained,
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifestPath;
}

async function pruneHarnessWorktrees({ dryRun = false, retainCurrent = false } = {}) {
  const status = await listHarnessWorktrees({ retainCurrent });
  const removed = [];
  const retained = [];
  for (const worktree of status.worktrees) {
    if (!worktree.prunable) {
      retained.push(worktree);
      continue;
    }
    if (dryRun) {
      removed.push({ ...worktree, removed: false, dryRun: true });
      continue;
    }
    const result = run('git', ['worktree', 'remove', worktree.path], { env: gitEnv(), expect: null });
    const exitCode = result.status ?? (result.error ? 1 : 0);
    if (exitCode === 0) {
      removed.push({ ...worktree, removed: true, command: `git worktree remove ${worktree.path}` });
    } else {
      retained.push({
        ...worktree,
        prunable: false,
        action: 'retain',
        retainReason: 'git_worktree_remove_failed',
        reasons: ['git_worktree_remove_failed'],
        removeError: result.stderr || result.stdout || result.error?.message || `git worktree remove exited ${exitCode}`,
        retentionTtlHours: 72,
      });
    }
  }
  if (!dryRun) {
    run('git', ['worktree', 'prune'], { env: gitEnv(), expect: null });
  }
  const retentionManifestPath = retained.length > 0
    ? await writeWorktreeRetentionManifest(retained, { dryRun })
    : '';
  return {
    schemaVersion: 'moonshot-harness-worktree-prune.v1',
    status: retained.length === 0 ? 'pruned' : 'maintenance_required',
    dryRun,
    retainCurrent,
    worktreeRoot: status.worktreeRoot,
    currentBaselineId: status.currentBaselineId,
    totalCount: status.totalCount,
    removedCount: removed.length,
    retainedCount: retained.length,
    removed,
    retained,
    retentionManifestPath,
    maintenanceRequired: retained.length > 0,
  };
}

async function retireHarnessWorktree(worktreePath, {
  runId = '',
  baselineId = '',
  reason = 'ephemeral_success',
} = {}) {
  const entry = {
    path: path.resolve(worktreePath),
    head: '',
    branch: '',
    detached: true,
  };
  const status = run('git', ['-C', worktreePath, 'rev-parse', 'HEAD'], { env: gitEnv(), expect: null });
  if ((status.status ?? 1) === 0) {
    entry.head = status.stdout.trim();
  }
  const dirty = run('git', ['-C', worktreePath, 'status', '--short'], { env: gitEnv(), expect: null });
  const classified = classifyHarnessWorktree(entry, {
    dirtyStatusShort: (dirty.status ?? 1) === 0 ? dirty.stdout.trim() : 'status_unavailable',
  });
  if (!classified.prunable) {
    const retained = {
      ...classified,
      runId,
      baselineId: classified.baselineId || baselineId,
      retainReason: classified.retainReason || 'retire_precondition_failed',
      retentionTtlHours: 72,
    };
    const retentionManifestPath = await writeWorktreeRetentionManifest([retained]);
    return {
      schemaVersion: 'moonshot-harness-worktree-retire.v1',
      status: 'retained',
      reason,
      runId,
      baselineId,
      worktree: retained,
      retentionManifestPath,
    };
  }
  const removed = run('git', ['worktree', 'remove', worktreePath], { env: gitEnv(), expect: null });
  const exitCode = removed.status ?? (removed.error ? 1 : 0);
  if (exitCode !== 0) {
    const retained = {
      ...classified,
      runId,
      baselineId: classified.baselineId || baselineId,
      retainReason: 'git_worktree_remove_failed',
      reasons: ['git_worktree_remove_failed'],
      removeError: removed.stderr || removed.stdout || removed.error?.message || `git worktree remove exited ${exitCode}`,
      retentionTtlHours: 72,
    };
    const retentionManifestPath = await writeWorktreeRetentionManifest([retained]);
    return {
      schemaVersion: 'moonshot-harness-worktree-retire.v1',
      status: 'retained',
      reason,
      runId,
      baselineId,
      worktree: retained,
      retentionManifestPath,
    };
  }
  run('git', ['worktree', 'prune'], { env: gitEnv(), expect: null });
  return {
    schemaVersion: 'moonshot-harness-worktree-retire.v1',
    status: 'removed',
    reason,
    runId,
    baselineId,
    worktree: classified,
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
      lifecyclePath: 'initial_bootstrap',
      baselineRef: options.baselineRef,
      baselineId,
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
      lifecyclePath: 'initial_bootstrap',
      baselineRef: options.baselineRef,
      baselineId,
      promotionCriteria: {
        policy: options.promotionPolicy,
        minDelta: options.minDelta || null,
      },
    });
    baselineResultPath = baselineResult.resultPath;
    labResult = candidateResult;
    const compareDir = path.resolve(DEFAULT_STATE_ROOT, 'compare');
    await mkdir(compareDir, { recursive: true });
    comparePath = path.join(compareDir, `${candidateRunId}-vs-${baselineId}.json`);
    const candidateKernel = runKernelFromArtifact(candidateResult);
    const compare = await runCommandWithEvents(candidateKernel, {
      commandId: 'initial_bootstrap.compare',
      command: process.execPath,
      args: nodeArgs('tools/harness-lab/harness-lab.mjs', [
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
      ]),
      env: loopEnv(runId),
      expect: null,
    });
    const compareResult = JSON.parse(compare.stdout);
    if (candidateKernel) {
      await bindRunKernelToJsonArtifact(comparePath, candidateKernel, 'compare-report');
    }
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
    const hostKernel = await writeRunKernelStart({
      runId,
      sourceRoot: options.candidateRoot,
      outRoot: DEFAULT_RUN_ROOT,
      lifecyclePath: 'initial_bootstrap',
      backend: 'host',
      role: 'candidate',
      baselineRef: options.baselineRef,
      baselineId,
      promotionCriteria: {
        policy: options.promotionPolicy,
        minDelta: options.minDelta || null,
      },
    });
    const lab = await runCommandWithEvents(hostKernel, {
      commandId: 'initial_bootstrap.host_lab',
      command: process.execPath,
      args: nodeArgs('tools/harness-lab/harness-lab.mjs', [
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
      ]),
      env: loopEnv(runId),
    });
    labResult = JSON.parse(lab.stdout);
    labResult = await bindRunKernelToLabResult(labResult.resultPath, hostKernel);
    backend = {
      type: 'host',
      baselineDependencies,
    };
  } else {
    throw new Error(`Unknown backend: ${options.backend}`);
  }
  const compareResult = comparePath ? await readJsonIfExists(comparePath) : null;
  const runKernel = runKernelFromArtifact(labResult);
  let promotion = null;
  if (options.promoteInitial !== false && labResult.status === 'passed' && (!compareResult || compareResult.status === 'passed')) {
    const promoted = await runCommandWithEvents(runKernel, {
      commandId: 'initial_bootstrap.promote',
      command: process.execPath,
      args: nodeArgs('tools/harness-lab/harness-lab.mjs', [
      'promote',
      '--candidate-run',
      labResult.resultPath,
      ...(comparePath ? ['--compare-report', comparePath] : []),
      '--baseline-root',
      DEFAULT_BASELINE_ROOT,
      '--baseline-id',
      baselineId,
      '--json',
      ]),
      env: loopEnv(runId),
    });
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
  const worktreeCleanup = await retireHarnessWorktree(stableRoot, {
    runId,
    baselineId,
    reason: receiptStatus === 'promoted_ready_for_commit_workflow' ? 'initial_baseline_promoted' : 'initial_baseline_run_completed',
  });
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
    specHash: runKernel?.specHash || null,
    runSpecPath: runKernel?.specPath || null,
    eventsPath: runKernel?.eventsPath || null,
    labResultPath: labResult.resultPath,
    baselineResultPath,
    compareReportPath: comparePath,
    promotionPolicy: compareResult?.promotionPolicy || null,
    promotion,
    closeoutReceiptPath,
    worktreeCleanup,
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
      lifecyclePath: options.lifecyclePath || 'candidate_only',
      baselineId: pointer.baselineId,
      promotionCriteria: {
        policy: options.promotionPolicy,
        minDelta: options.minDelta || null,
      },
    });
    backend = {
      type: 'docker',
      image: options.dockerImage,
      imagePreparation: dockerImage,
    };
  } else if (options.backend === 'host') {
    const hostKernel = await writeRunKernelStart({
      runId,
      sourceRoot: options.candidateRoot,
      outRoot: DEFAULT_RUN_ROOT,
      lifecyclePath: options.lifecyclePath || 'candidate_only',
      backend: 'host',
      role: 'candidate',
      baselineId: pointer.baselineId,
      promotionCriteria: {
        policy: options.promotionPolicy,
        minDelta: options.minDelta || null,
      },
    });
    const candidate = await runCommandWithEvents(hostKernel, {
      commandId: 'candidate.host_lab',
      command: process.execPath,
      args: nodeArgs('tools/harness-lab/harness-lab.mjs', [
      'run',
      '--candidate-root',
      options.candidateRoot,
      '--out',
      DEFAULT_RUN_ROOT,
      '--run-id',
      runId,
      '--json',
      ]),
      env: loopEnv(runId),
    });
    candidateResult = JSON.parse(candidate.stdout);
    candidateResult = await bindRunKernelToLabResult(candidateResult.resultPath, hostKernel);
    backend = {
      type: 'host',
    };
  } else {
    throw new Error(`Unknown backend: ${options.backend}`);
  }
  const compareDir = path.resolve(DEFAULT_STATE_ROOT, 'compare');
  await mkdir(compareDir, { recursive: true });
  const comparePath = path.join(compareDir, `${runId}-vs-${pointer.baselineId}.json`);
  const runKernel = runKernelFromArtifact(candidateResult);
  const compare = await runCommandWithEvents(runKernel, {
    commandId: 'candidate.compare',
    command: process.execPath,
    args: nodeArgs('tools/harness-lab/harness-lab.mjs', [
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
    ]),
    env: loopEnv(runId),
    expect: null,
  });
  const compareResult = JSON.parse(compare.stdout);
  if (runKernel) {
    await bindRunKernelToJsonArtifact(comparePath, runKernel, 'compare-report');
  }
  const calibration = shouldRerunBaseline({
    baselineManifest: manifest,
    candidateResult,
    marginThreshold: options.calibrationMarginThreshold ? Number(options.calibrationMarginThreshold) : 0.02,
  });
  let promotion = null;
  if (options.promote && calibration.status !== 'calibration_required') {
    const nextNumber = Number((pointer.baselineId || '').match(/(\d+)$/)?.[1] || 1) + 1;
    const baselineId = `baseline-${String(nextNumber).padStart(4, '0')}`;
    promotion = JSON.parse((await runCommandWithEvents(runKernel, {
      commandId: 'candidate.promote',
      command: process.execPath,
      args: nodeArgs('tools/harness-lab/harness-lab.mjs', [
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
      ]),
      env: loopEnv(runId),
    })).stdout);
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
  const closeoutReceiptPath = path.join(path.resolve(DEFAULT_RUN_ROOT), runId, 'lab-closeout-receipt.json');
  const summary = {
    schemaVersion: 'moonshot-harness-loop-candidate.v1',
    status: closeoutStatus === 'calibration_required' ? 'calibration_required' : compareResult.status,
    promotable: compareResult.promotable && calibration.status !== 'calibration_required',
    lifecyclePath: options.lifecyclePath || 'candidate_only',
    previousBaselineId: pointer.baselineId,
    backend,
    runId,
    specHash: runKernel?.specHash || null,
    runSpecPath: runKernel?.specPath || null,
    eventsPath: runKernel?.eventsPath || null,
    candidateResultPath: candidateResult.resultPath,
    compareReportPath: comparePath,
    promotionPolicy: compareResult.promotionPolicy,
    calibration,
    closeoutReceiptPath,
    promotion,
  };
  summary.candidateSummaryPath = await writeCandidateSummaryArtifact(summary);
  await writeCloseoutReceipt(runId, closeoutReceipt);
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
      lifecyclePath: 'calibration',
      baselineRef,
      baselineId: pointer.baselineId,
    });
    candidateResult = await runDockerLab({
      role: 'candidate',
      sourceRoot: options.candidateRoot,
      runId: `${runId}-candidate`,
      image: options.dockerImage,
      imageMetadata: dockerImage,
      codexCliVersion: options.codexCliVersion,
      dockerNetwork: options.dockerNetwork,
      lifecyclePath: 'calibration',
      baselineRef,
      baselineId: pointer.baselineId,
      promotionCriteria: {
        policy: options.promotionPolicy,
        minDelta: options.minDelta || null,
      },
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
    const baselineKernel = await writeRunKernelStart({
      runId: `${runId}-baseline`,
      sourceRoot: stableRoot,
      outRoot: DEFAULT_RUN_ROOT,
      lifecyclePath: 'calibration',
      backend: 'host',
      role: 'baseline',
      baselineRef,
      baselineId: pointer.baselineId,
    });
    const candidateKernel = await writeRunKernelStart({
      runId: `${runId}-candidate`,
      sourceRoot: options.candidateRoot,
      outRoot: DEFAULT_RUN_ROOT,
      lifecyclePath: 'calibration',
      backend: 'host',
      role: 'candidate',
      baselineRef,
      baselineId: pointer.baselineId,
      promotionCriteria: {
        policy: options.promotionPolicy,
        minDelta: options.minDelta || null,
      },
    });
    const baseline = await runCommandWithEvents(baselineKernel, {
      commandId: 'calibration.baseline_host_lab',
      command: process.execPath,
      args: nodeArgs('tools/harness-lab/harness-lab.mjs', [
      'run',
      '--candidate-root',
      stableRoot,
      '--out',
      DEFAULT_RUN_ROOT,
      '--run-id',
      `${runId}-baseline`,
      '--json',
      ]),
      env: loopEnv(runId),
    });
    const candidate = await runCommandWithEvents(candidateKernel, {
      commandId: 'calibration.candidate_host_lab',
      command: process.execPath,
      args: nodeArgs('tools/harness-lab/harness-lab.mjs', [
      'run',
      '--candidate-root',
      options.candidateRoot,
      '--out',
      DEFAULT_RUN_ROOT,
      '--run-id',
      `${runId}-candidate`,
      '--json',
      ]),
      env: loopEnv(runId),
    });
    baselineResult = JSON.parse(baseline.stdout);
    candidateResult = JSON.parse(candidate.stdout);
    baselineResult = await bindRunKernelToLabResult(baselineResult.resultPath, baselineKernel);
    candidateResult = await bindRunKernelToLabResult(candidateResult.resultPath, candidateKernel);
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
  const runKernel = runKernelFromArtifact(candidateResult);
  const compare = await runCommandWithEvents(runKernel, {
    commandId: 'calibration.compare',
    command: process.execPath,
    args: nodeArgs('tools/harness-lab/harness-lab.mjs', [
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
    ]),
    env: loopEnv(runId),
    expect: null,
  });
  const compareResult = JSON.parse(compare.stdout);
  if (runKernel) {
    await bindRunKernelToJsonArtifact(comparePath, runKernel, 'compare-report');
  }
  const pointerBefore = await currentPointerSnapshot();
  let promotion = null;
  if (options.promote && compareResult.status === 'passed') {
    const nextNumber = Number((pointer.baselineId || '').match(/(\d+)$/)?.[1] || 1) + 1;
    const baselineId = `baseline-${String(nextNumber).padStart(4, '0')}`;
    promotion = JSON.parse((await runCommandWithEvents(runKernel, {
      commandId: 'calibration.promote',
      command: process.execPath,
      args: nodeArgs('tools/harness-lab/harness-lab.mjs', [
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
      ]),
      env: loopEnv(runId),
    })).stdout);
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
  const worktreeCleanup = await retireHarnessWorktree(stableRoot, {
    runId,
    baselineId: pointer.baselineId,
    reason: receiptStatus === 'promoted_ready_for_commit_workflow' ? 'calibration_promoted' : 'calibration_run_completed',
  });
  return {
    schemaVersion: 'moonshot-harness-loop-calibration.v1',
    status: compareResult.status,
    lifecyclePath: 'calibration',
    previousBaselineId: pointer.baselineId,
    baselineRef,
    backend,
    runId,
    specHash: runKernel?.specHash || null,
    runSpecPath: runKernel?.specPath || null,
    eventsPath: runKernel?.eventsPath || null,
    baselineResultPath: baselineResult.resultPath,
    baselineCompareResultPath: calibrationBaselineFixtureNormalization.resultPath,
    candidateResultPath: candidateResult.resultPath,
    compareReportPath: comparePath,
    promotionPolicy: compareResult.promotionPolicy,
    calibrationBaselineFixtureNormalization,
    promotion,
    closeoutReceiptPath,
    worktreeCleanup,
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
      lifecyclePath: 'baseline_refresh',
      baselineId: pointer.baselineId,
      promotionCriteria: {
        policy: options.promotionPolicy,
        minDelta: options.minDelta || null,
      },
    });
    backend = {
      type: 'docker',
      image: options.dockerImage,
      imagePreparation: dockerImage,
    };
  } else if (options.backend === 'host') {
    const hostKernel = await writeRunKernelStart({
      runId,
      sourceRoot: options.candidateRoot,
      outRoot: DEFAULT_RUN_ROOT,
      lifecyclePath: 'baseline_refresh',
      backend: 'host',
      role: 'candidate',
      baselineId: pointer.baselineId,
      promotionCriteria: {
        policy: options.promotionPolicy,
        minDelta: options.minDelta || null,
      },
    });
    const candidate = await runCommandWithEvents(hostKernel, {
      commandId: 'refresh-baseline.host_lab',
      command: process.execPath,
      args: nodeArgs('tools/harness-lab/harness-lab.mjs', [
      'run',
      '--candidate-root',
      options.candidateRoot,
      '--out',
      DEFAULT_RUN_ROOT,
      '--run-id',
      runId,
      '--json',
      ]),
      env: loopEnv(runId),
    });
    candidateResult = JSON.parse(candidate.stdout);
    candidateResult = await bindRunKernelToLabResult(candidateResult.resultPath, hostKernel);
    backend = { type: 'host' };
  } else {
    throw new Error(`Unknown backend: ${options.backend}`);
  }
  const compareDir = path.resolve(DEFAULT_STATE_ROOT, 'compare');
  await mkdir(compareDir, { recursive: true });
  const comparePath = path.join(compareDir, `${runId}-refresh-self-compare.json`);
  const refreshRunKernel = runKernelFromArtifact(candidateResult);
  const compare = await runCommandWithEvents(refreshRunKernel, {
    commandId: 'refresh-baseline.compare',
    command: process.execPath,
    args: nodeArgs('tools/harness-lab/harness-lab.mjs', [
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
    ]),
    env: loopEnv(runId),
    expect: null,
  });
  const compareResult = JSON.parse(compare.stdout);
  if (refreshRunKernel) {
    await bindRunKernelToJsonArtifact(comparePath, refreshRunKernel, 'compare-report');
  }
  if (compareResult.status !== 'passed') {
    throw new Error(`Refresh self-compare failed: ${comparePath}`);
  }
  const pointerBefore = await currentPointerSnapshot();
  const nextNumber = Number((pointer.baselineId || '').match(/(\d+)$/)?.[1] || 1) + 1;
  const baselineId = `baseline-${String(nextNumber).padStart(4, '0')}`;
  const promotion = JSON.parse((await runCommandWithEvents(refreshRunKernel, {
    commandId: 'refresh-baseline.promote',
    command: process.execPath,
    args: nodeArgs('tools/harness-lab/harness-lab.mjs', [
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
    ]),
    env: loopEnv(runId),
  })).stdout);
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
    specHash: refreshRunKernel?.specHash || null,
    runSpecPath: refreshRunKernel?.specPath || null,
    eventsPath: refreshRunKernel?.eventsPath || null,
    candidateResultPath: candidateResult.resultPath,
    compareReportPath: comparePath,
    refreshReadiness,
    promotion,
    closeoutReceiptPath,
  };
}

async function closeoutLoop(options) {
  const runsRoot = path.resolve(options.runsRoot || DEFAULT_RUN_ROOT);
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
  const revalidation = await revalidateCloseoutReceipt(receipt, {
    receiptPath,
    sourceRoot: options.sourceRoot || process.cwd(),
    baselineRoot: options.baselineRoot || DEFAULT_BASELINE_ROOT,
  });
  const runStatus = await loadRunProjection({ runId, runsRoot });
  const labResult = await readJsonIfExists(receipt.candidateResultPath);
  const compareReport = await readJsonIfExists(receipt.compareReportPath);
  const previousBaselineManifest = await readBaselineManifest(receipt.baselinePointerBefore?.pointer);
  const labResultSummary = buildLabResultSummaryContract({
    labResult,
    compareReport,
    runStatus,
    closeoutReceipt: {
      ...receipt,
      consumableByCommitWorkflow: revalidation.consumableByCommitWorkflow,
    },
    candidateResultPath: receipt.candidateResultPath,
    baselineResultPath: previousBaselineManifest?.artifact?.path || '',
    closeoutReceiptPath: receiptPath,
  });
  const worktreeStatus = await listHarnessWorktrees();
  const maintenanceWarnings = revalidation.consumableByCommitWorkflow && worktreeStatus.totalCount > 0
    ? [{
      id: 'harness_worktree_maintenance_required',
      status: 'maintenance_required',
      severity: 'warning',
      reason: 'ephemeral harness worktrees are still registered with git worktree',
      worktreeRoot: worktreeStatus.worktreeRoot,
      worktreeCount: worktreeStatus.totalCount,
      prunableCount: worktreeStatus.prunableCount,
      command: 'npm run lab:worktrees:prune -- --dry-run',
    }]
    : [];
  return {
    schemaVersion: 'moonshot-harness-closeout-read.v1',
    status: receipt.status,
    consumableByCommitWorkflow: revalidation.consumableByCommitWorkflow,
    receiptPath,
    labResultSummary,
    revalidation,
    blockingGates: revalidation.blockingGates,
    maintenanceWarnings,
    maintenanceRequired: maintenanceWarnings.length > 0,
    receipt,
  };
}

function closeoutExitCode(result) {
  return result?.consumableByCommitWorkflow === true ? 0 : 1;
}

function lifecycleExitCode(result) {
  if (!result) return 1;
  if (['invalid', 'not_found', 'stale', 'incomplete'].includes(result.status)) return 1;
  if (result.schemaVersion === 'moonshot-run-resume.v1' && result.status !== 'terminal_noop') return 1;
  return 0;
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
  if (options.command === 'worktrees:status') {
    print(await listHarnessWorktrees({ retainCurrent: options.retainCurrent }), options.json);
    return;
  }
  if (options.command === 'worktrees:prune') {
    const result = await pruneHarnessWorktrees({
      dryRun: options.dryRun === true,
      retainCurrent: options.retainCurrent === true,
    });
    print(result, options.json);
    return;
  }
  if (options.command === 'status') {
    print(await statusLoop(), options.json);
    return;
  }
  if (options.command === 'run-status') {
    const result = await runStatusLoop(options);
    print(result, options.json);
    process.exitCode = lifecycleExitCode(result);
    return;
  }
  if (options.command === 'resume') {
    const result = await resumeLoop(options);
    print(result, options.json);
    process.exitCode = lifecycleExitCode(result);
    return;
  }
  if (options.command === 'cancel') {
    const result = await cancelLoop(options);
    print(result, options.json);
    process.exitCode = lifecycleExitCode(result);
    return;
  }
  if (options.command === 'evaluate') {
    const result = await evaluateLoop(options);
    print(result, options.json);
    process.exitCode = lifecycleExitCode(result);
    return;
  }
  if (options.command === 'evolve') {
    const result = await evolveLoop(options);
    print(result, options.json);
    process.exitCode = lifecycleExitCode(result);
    return;
  }
  throw new Error(`Unknown command: ${options.command}\n${usage()}`);
}

export {
  authSmokeLoop,
  bindRunKernelToLabResult,
  autoLoop,
  buildCandidateSummaryArtifact,
  buildCloseoutReceipt,
  buildLabResultSummaryContract,
  calibrationLoop,
  dockerRunHardeningArgs,
  dockerRunHardeningPolicy,
  candidateLoop,
  closeoutLoop,
  closeoutExitCode,
  cancelLoop,
  classifyHarnessWorktree,
  dockerScript,
  deriveInstallStatus,
  initLoop,
  evaluateLoop,
  evolveLoop,
  lifecycleExitCode,
  loadRunProjection,
  normalizeInstalledRuntimeSmoke,
  normalizeCalibrationBaselineFixtureIdentity,
  patchDockerLabResult,
  parseGitWorktreePorcelain,
  prepareDockerScript,
  pruneHarnessWorktrees,
  refreshBaselineLoop,
  retireHarnessWorktree,
  revalidateCloseoutReceipt,
  rewriteContainerPaths,
  runDockerAuthSmoke,
  runDockerLab,
  scanAuthArtifacts,
  buildBaselineRefreshReadiness,
  buildRunSpec,
  selectAutoLifecycle,
  shouldExcludeSourceSnapshotPath,
  listHarnessWorktrees,
  runSpecHash,
  resumeLoop,
  runStatusLoop,
  statusLoop,
  writeRunKernelStart,
};

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
