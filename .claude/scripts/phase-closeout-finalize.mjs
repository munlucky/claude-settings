#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { evaluatePhaseCloseout } from './verify-phase-closeout.mjs';
import { resolveGitTreeFingerprint } from './verification-verdict-state.mjs';
import { appendCloseoutDiagnostic, buildCloseoutDiagnosticEvent } from './lib/closeout-diagnostics.mjs';
import { evaluateCloseoutInvariant } from './lib/harness-state-invariants.mjs';
import { recordLifecycleTransition } from './lib/lifecycle-projection-writer.mjs';
import { patchAttemptManifestFinalizerSeal, readAttemptManifest } from './lib/phase-attempt-manifest.mjs';
import { appendPhaseEvent, defaultPhaseEventLedgerPath } from './lib/phase-event-ledger.mjs';
import { parseCriticalScenarios, parsePhaseStatusDocument, readText, resolvePath } from './lib/phase-closeout-parsers.mjs';
import {
  STATUS_PROJECTION_SCHEMA_VERSION,
  SUMMARY_FINAL_OUTCOME_SCHEMA_VERSION,
  WORKFLOW_FINAL_OUTCOME_SCHEMA_VERSION,
  buildFinalOutcomeProjectionHash,
  canonicalProjectionIssues,
  isCanonicalFinalCompleteProjection,
  normalizeFinalRunVerdict,
  phaseProjectionCounts,
  sidecarProjectionIssues,
} from './lib/final-outcome-projection.mjs';
import { readBlockerSidecarState } from './lib/blocker-sidecar-state.mjs';
import {
  parsePhaseSummaryProjection,
  renderPhaseSummaryProjection,
} from './lib/phase-summary-projection.mjs';
import { updateGoalStatus, withDb } from './runtime-state.mjs';

const DEFAULT_STATUS_FILE = '.claude/docs/phase-status.yaml';
const DEFAULT_WORKFLOW_DIR = '.claude/logs/workflow-enforcement';
const DEFAULT_AGENT_LOOP_DIR = '.claude/logs/agent-loop';
const CURRENT_SUMMARY_FILE = 'summary.current.md';
const CURRENT_ARTIFACTS_INDEX = 'current-artifacts.json';
const CLOSEOUT_MANIFEST_PREFIX = 'closeout-sync-manifest';
const CLOSEOUT_ARCHIVE_DIR = 'closeout-archive';
const LOG_SNAPSHOT_TAIL_BYTES = 64 * 1024;
const STATE_FILES = ['current-run.json', 'active-phase-run.json', 'latest-dispatch.json'];
const COMPLETION_WARNING_VALUES = new Set([
  'scope_complete',
  'clean_complete',
  'success',
  'success_with_warning',
  'complete',
  'completed',
]);
const RECOVERABLE_BLOCKER_FIELDS = [
  'stopReasonClass',
  'rawStopReason',
  'blockerClass',
  'blockingReasonCode',
  'failureClass',
  'stopReasonExplanation',
];

function usage() {
  return [
    'Usage:',
    '  phase-closeout-finalize.mjs finalize --phase <NN> --status-file <path> --plan-dir <path> --master-plan <path> --execution-root <path> [--dry-run] [--json]',
    '',
    'Options:',
    '  --phase <NN>             Phase number to finalize.',
    `  --status-file <path>     Default: ${DEFAULT_STATUS_FILE}`,
    '  --plan-dir <path>        Active plan directory.',
    '  --master-plan <path>     Master plan path.',
    '  --execution-root <path>  Plan execution root or phase execution directory.',
    `  --workflow-dir <path>    Default: ${DEFAULT_WORKFLOW_DIR}`,
    '  --dry-run                Report expected writes without mutating files.',
    '  --keep-prep              With --dry-run, write prep preview files only; never publish current state.',
    '  --strict-repository-closeout  Exit 2 when repository closeout is pending.',
    '  --json                   Print JSON payload.',
    '  --now <iso>              Deterministic timestamp for tests.',
    '  --commit-token <token>    Deterministic closeout publish token for tests.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = [...argv];
  const result = { command: 'finalize' };
  if (args.length > 0 && !args[0].startsWith('--')) {
    result.command = args.shift();
  }
  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case '--phase':
        result.phase = args.shift() || '';
        break;
      case '--status-file':
        result.statusFile = args.shift() || '';
        break;
      case '--plan-dir':
        result.planDir = args.shift() || '';
        break;
      case '--master-plan':
        result.masterPlan = args.shift() || '';
        break;
      case '--execution-root':
        result.executionRoot = args.shift() || '';
        break;
      case '--workflow-dir':
        result.workflowDir = args.shift() || '';
        break;
      case '--now':
        result.now = args.shift() || '';
        break;
      case '--commit-token':
        result.commitToken = args.shift() || '';
        break;
      case '--dry-run':
        result.dryRun = true;
        break;
      case '--keep-prep':
        result.keepPrep = true;
        break;
      case '--strict-repository-closeout':
        result.strictRepositoryCloseout = true;
        break;
      case '--json':
        result.json = true;
        break;
      case '--help':
      case '-h':
        result.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  return result;
}

function timestamp(now = '') {
  if (!now) {
    return new Date().toISOString();
  }
  const parsed = new Date(now);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid --now value: ${now}`);
  }
  return parsed.toISOString();
}

function rel(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/') || '.';
}

function sidecarPathsForPhaseExecutionDir(executionDir) {
  return {
    blockerEvidencePath: path.join(executionDir, 'BLOCKER_EVIDENCE.jsonl'),
    attemptLedgerPath: path.join(executionDir, 'ATTEMPT_LEDGER.jsonl'),
    projectionManifestPath: path.join(executionDir, 'projection-manifest.json'),
  };
}

function phaseExecutionDirForSidecar({ root, phase, executionRoot }) {
  const artifactPath = phase.qaReport || phase.sprintContract || phase.scorecard || phase.handoff || '';
  if (artifactPath) {
    return path.dirname(resolvePath(artifactPath, root));
  }
  return executionRoot;
}

function loadFinalizeSidecarState({ root, phase, executionRoot }) {
  const sidecarPaths = sidecarPathsForPhaseExecutionDir(
    phaseExecutionDirForSidecar({ root, phase, executionRoot }),
  );
  const sidecarState = readBlockerSidecarState(sidecarPaths);
  return {
    ...sidecarState,
    diagnostics: [
      ...(sidecarState.diagnostics || []),
      ...validateFinalizeSidecarManifest({ root, sidecarPaths, sidecarState }),
    ],
  };
}

function validateFinalizeSidecarManifest({ root, sidecarPaths, sidecarState }) {
  if (!sidecarState || sidecarState.mode !== 'sidecar_canonical') {
    return [];
  }
  const diagnostics = [];
  let manifest = null;
  try {
    manifest = JSON.parse(fs.readFileSync(sidecarPaths.projectionManifestPath, 'utf8'));
  } catch (error) {
    return [{ type: 'invalid_manifest_json', message: error.message }];
  }
  const blockerIds = new Set((sidecarState.blockerEvidence || []).map((record) => record.id).filter(Boolean));
  const attemptKeys = new Set((sidecarState.attemptLedger || []).map((record) => `${record.attemptId}:${record.transactionId}`));
  for (const id of Array.isArray(manifest.blockerEvidenceIds) ? manifest.blockerEvidenceIds : []) {
    if (!blockerIds.has(id)) {
      diagnostics.push({ type: 'manifest_blocker_record_missing', id });
    }
  }
  for (const key of Array.isArray(manifest.attemptLedgerKeys) ? manifest.attemptLedgerKeys : []) {
    if (!attemptKeys.has(key)) {
      diagnostics.push({ type: 'manifest_attempt_record_missing', key });
    }
  }
  for (const entry of Array.isArray(manifest.files) ? manifest.files : []) {
    const filePath = resolvePath(entry?.path || '', root);
    const expectedHash = entry?.sha256 || '';
    if (!filePath || !expectedHash) {
      continue;
    }
    if (!fs.existsSync(filePath)) {
      diagnostics.push({ type: 'manifest_file_missing', filePath });
      continue;
    }
    const actualHash = crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
    if (actualHash !== expectedHash) {
      diagnostics.push({ type: 'manifest_file_hash_mismatch', filePath, expectedHash, actualHash });
    }
  }
  return diagnostics;
}

function finalCanonicalRunVerdict({ phase = {}, historicalWarnings = [] } = {}) {
  return normalizeFinalRunVerdict({ phase, historicalWarnings });
}

function yamlScalar(value) {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  const text = String(value);
  if (/^[A-Za-z0-9_.:/-]+$/.test(text)) {
    return text;
  }
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function stripYamlQuotes(value) {
  return String(value ?? '').trim().replace(/^["'`]+|["'`]+$/g, '');
}

function normalizeBlockerValue(value) {
  const text = stripYamlQuotes(value);
  return text === 'null' ? '' : text;
}

function normalizedBlockerObject(blocker = {}) {
  return Object.fromEntries(RECOVERABLE_BLOCKER_FIELDS.map((field) => [field, normalizeBlockerValue(blocker[field])]));
}

function blockerHasEvidence(blocker = {}) {
  return Object.values(normalizedBlockerObject(blocker)).some((value) => value !== '');
}

export function recoveredBlockerFingerprint(blocker = {}) {
  return crypto.createHash('sha256').update(JSON.stringify(normalizedBlockerObject(blocker))).digest('hex').slice(0, 16);
}

function recoveredBlockerFromStatusRoot(statusRoot = {}, now) {
  const blocker = normalizedBlockerObject(statusRoot);
  if (!blockerHasEvidence(blocker)) {
    return null;
  }
  return {
    fingerprint: recoveredBlockerFingerprint(blocker),
    ...blocker,
    recoveredAt: now,
  };
}

function topLevelBlockBounds(lines, key) {
  const start = lines.findIndex((line) => line.startsWith(`${key}:`));
  if (start < 0) {
    return { start: -1, end: -1 };
  }
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\S/.test(lines[index]) && !lines[index].startsWith('  - ')) {
      end = index;
      break;
    }
  }
  return { start, end };
}

function parseRecoveredBlockers(lines) {
  const { start, end } = topLevelBlockBounds(lines, 'recoveredBlockers');
  if (start < 0) {
    return [];
  }
  const blockers = [];
  let current = null;
  for (const line of lines.slice(start + 1, end)) {
    const itemStart = line.match(/^  - ([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
    if (itemStart) {
      if (current) {
        blockers.push(current);
      }
      current = { [itemStart[1]]: stripYamlQuotes(itemStart[2]) };
      continue;
    }
    const field = line.match(/^    ([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
    if (field && current) {
      current[field[1]] = stripYamlQuotes(field[2]);
    }
  }
  if (current) {
    blockers.push(current);
  }
  return blockers;
}

function renderRecoveredBlocker(blocker) {
  return [
    `  - fingerprint: ${yamlScalar(blocker.fingerprint)}`,
    ...RECOVERABLE_BLOCKER_FIELDS.map((field) => `    ${field}: ${yamlScalar(blocker[field] || '')}`),
    `    recoveredAt: ${yamlScalar(blocker.recoveredAt || '')}`,
  ];
}

function upsertTopLevelBlock(lines, key, blockLines) {
  const { start, end } = topLevelBlockBounds(lines, key);
  const rendered = [`${key}:`, ...blockLines];
  if (start >= 0) {
    lines.splice(start, end - start, ...rendered);
    return;
  }
  const phasesIndex = lines.findIndex((line) => line.startsWith('phases:'));
  lines.splice(phasesIndex >= 0 ? phasesIndex : lines.length, 0, ...rendered);
}

function removeTopLevelBlock(lines, key) {
  const { start, end } = topLevelBlockBounds(lines, key);
  if (start >= 0) {
    lines.splice(start, end - start);
  }
}

function upsertRecoveredBlockerState(lines, statusRoot, now) {
  const candidate = recoveredBlockerFromStatusRoot(statusRoot, now);
  const existing = parseRecoveredBlockers(lines);
  const byFingerprint = new Map(existing.map((blocker) => [
    blocker.fingerprint || recoveredBlockerFingerprint(blocker),
    blocker,
  ]));
  if (candidate && !byFingerprint.has(candidate.fingerprint)) {
    byFingerprint.set(candidate.fingerprint, candidate);
  }
  const recoveredBlockers = [...byFingerprint.values()];
  if (recoveredBlockers.length > 0) {
    upsertTopLevelBlock(lines, 'recoveredBlockers', recoveredBlockers.flatMap(renderRecoveredBlocker));
    const latest = candidate
      ? byFingerprint.get(candidate.fingerprint)
      : recoveredBlockers[recoveredBlockers.length - 1];
    upsertTopLevelBlock(lines, 'lastRecoveredBlocker', renderRecoveredBlocker(latest).map((line) => line.replace(/^  - /, '  ').replace(/^    /, '  ')));
  }
  for (const field of RECOVERABLE_BLOCKER_FIELDS) {
    upsertTopLevel(lines, field, '');
  }
}

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempFile = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tempFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tempFile, filePath);
}

function jsonPayloadRawHash(payload) {
  return crypto.createHash('sha256').update(Buffer.from(`${JSON.stringify(payload, null, 2)}\n`)).digest('hex');
}

function writeTextAtomic(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempFile = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tempFile, content, 'utf8');
  fs.renameSync(tempFile, filePath);
}

function copyFileAtomic(sourcePath, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const tempFile = path.join(path.dirname(targetPath), `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`);
  fs.copyFileSync(sourcePath, tempFile);
  fs.renameSync(tempFile, targetPath);
}

function stableCommitToken({ phaseNumber, now, override = '' }) {
  const explicit = String(override || '').trim();
  if (explicit) {
    return explicit.replace(/[^A-Za-z0-9_.-]/g, '-');
  }
  const digest = crypto.createHash('sha256').update(`phase:${phaseNumber}:${now}`).digest('hex').slice(0, 12);
  return `phase${String(phaseNumber).padStart(2, '0')}-${digest}`;
}

function closeoutPrepRoot(workflowDir, commitToken) {
  return path.join(workflowDir, 'closeout-prep', commitToken);
}

function stagedPathFor(prepRoot, root, canonicalPath) {
  return path.join(prepRoot, relativeFromRoot(root, canonicalPath));
}

function relativeFromRoot(root, candidate) {
  return path.relative(root, candidate).replace(/\\/g, '/');
}

function artifactMetadata({ root, kind, filePath, commitToken, sourceAttempt = null }) {
  const stats = fs.statSync(filePath);
  const metadata = {
    kind,
    path: relativeFromRoot(root, filePath),
    hashAlgorithm: 'sha256_raw_bytes',
    hash: crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'),
    sizeBytes: stats.size,
    mtimeMs: stats.mtimeMs,
    commitToken,
  };
  if (sourceAttempt) {
    metadata.sourceAttempt = sourceAttempt;
  }
  return metadata;
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readWorkflowStates(workflowDir) {
  return STATE_FILES
    .map((basename) => {
      const payload = readJsonIfExists(path.join(workflowDir, basename));
      return payload ? { basename, ...payload } : null;
    })
    .filter(Boolean);
}

function readFinalOutcomeSummary(summaryPath) {
  return parsePhaseSummaryProjection(readText(summaryPath));
}

function summaryPathFor(root, rawConfig = {}) {
  return resolvePath(rawConfig.summaryPath || path.join(DEFAULT_AGENT_LOOP_DIR, CURRENT_SUMMARY_FILE), root);
}

function maybeCanonicalNoop({
  root,
  statusPath,
  planDir,
  masterPlan,
  workflowDir,
  summaryPath,
  statusDocument,
  phaseNumber,
  now,
}) {
  const workflowStates = readWorkflowStates(workflowDir);
  const summary = readFinalOutcomeSummary(summaryPath);
  const canonical = isCanonicalFinalCompleteProjection({
    statusRoot: statusDocument.root,
    phases: statusDocument.phases,
    workflowStates,
    summary,
  });
  if (!canonical || summary.summaryProjectionSchemaVersion !== SUMMARY_FINAL_OUTCOME_SCHEMA_VERSION) {
    return null;
  }
  const closeoutGate = evaluatePhaseCloseout({
    statusFile: statusPath,
    planDir,
    masterPlan,
    workflowDir,
    now,
    masterPlanProvided: true,
  });
  if (!closeoutGate.allowed) {
    return null;
  }
  const phase = statusDocument.phases.find((entry) => Number(entry.number) === phaseNumber) || { number: phaseNumber };
  const gitCloseout = runNodeScript(path.join(root, '.claude/scripts/phase-final-git-closeout.mjs'), [
    'preflight',
    '--json',
  ], root);
  const gitCloseoutPayload = gitCloseout.parsed || {
    status: gitCloseout.status,
    stdout: gitCloseout.stdout,
    stderr: gitCloseout.stderr,
  };
  return {
    ok: true,
    dryRun: false,
    keepPrep: false,
    runtimeCloseout: {
      status: 'passed',
      ok: true,
      reason: '',
    },
    repositoryCloseout: repositoryCloseoutFromGitPayload(gitCloseoutPayload),
    idempotentNoop: true,
    finalVerdict: 'complete',
    normalizedRunVerdict: String(statusDocument.root.normalizedRunVerdict || 'success'),
    canonicalNoop: {
      status: 'passed',
      reason: 'canonical_final_complete_projection',
      summaryPath: rel(root, summaryPath),
      statusPath: rel(root, statusPath),
      workflowDir: rel(root, workflowDir),
    },
    phaseNumber,
    phaseTitle: phase.title || `Phase ${phaseNumber}`,
    generatedAt: now,
    plannedWrites: [],
    ...canonicalNoopWriteVisibility({ root, statusPath, workflowDir, summaryPath }),
  };
}

function maybeCanonicalSummaryRepair({
  root,
  statusPath,
  workflowDir,
  summaryPath,
  statusDocument,
  phaseNumber,
  now,
}) {
  const workflowStates = readWorkflowStates(workflowDir);
  const summary = readFinalOutcomeSummary(summaryPath);
  const issues = canonicalProjectionIssues({
    statusRoot: statusDocument.root,
    phases: statusDocument.phases,
    workflowStates,
    summary,
  });
  const markerStale = summary.summaryProjectionSchemaVersion !== SUMMARY_FINAL_OUTCOME_SCHEMA_VERSION;
  const summaryOnlyStale = issues.length === 0 || issues.every((issue) => issue === 'summary_projection_stale');
  if (!summaryOnlyStale || (!markerStale && !issues.includes('summary_projection_stale'))) {
    return null;
  }
  const projectionHash = buildFinalOutcomeProjectionHash({
    statusRoot: statusDocument.root,
    phases: statusDocument.phases,
    workflowStates,
  });
  writeTextAtomic(summaryPath, renderPhaseSummaryProjection({
    statusRoot: statusDocument.root,
    phases: statusDocument.phases,
    workflowStates,
    projectionHash,
    generatedAt: now,
  }));
  const phase = statusDocument.phases.find((entry) => Number(entry.number) === phaseNumber) || { number: phaseNumber };
  return {
    ok: true,
    dryRun: false,
    keepPrep: false,
    runtimeCloseout: {
      status: 'passed',
      ok: true,
      reason: '',
    },
    repositoryCloseout: repositoryCloseoutFromGitPayload({ clean: false }),
    idempotentNoop: false,
    finalVerdict: 'complete',
    normalizedRunVerdict: String(statusDocument.root.normalizedRunVerdict || 'success'),
    summaryOnlyRepair: true,
    phaseNumber,
    phaseTitle: phase.title || `Phase ${phaseNumber}`,
    generatedAt: now,
    plannedWrites: [{ path: rel(root, summaryPath), kind: 'agent-loop-current-summary' }],
    publishWrites: [{ path: rel(root, summaryPath), kind: 'agent-loop-current-summary' }],
    skippedWrites: [],
    finalOutcomeSummary: {
      path: rel(root, summaryPath),
      updated: true,
      projectionHash,
      staleReasons: ['summary_projection_stale'],
    },
    canonicalNoop: {
      status: 'repaired',
      reason: 'canonical_final_complete_projection_summary_marker_rewritten',
      summaryPath: rel(root, summaryPath),
      statusPath: rel(root, statusPath),
      workflowDir: rel(root, workflowDir),
    },
  };
}

function syncFinalOutcomeSummary({ summaryPath, statusPath, workflowDir, dryRun, plannedWrites, now }) {
  const statusText = readText(statusPath);
  const statusDocument = statusText ? parsePhaseStatusDocument(statusText) : { root: {}, phases: [] };
  const workflowStates = readWorkflowStates(workflowDir);
  const projectionHash = buildFinalOutcomeProjectionHash({
    statusRoot: statusDocument.root,
    phases: statusDocument.phases,
    workflowStates,
  });
  const current = readFinalOutcomeSummary(summaryPath);
  if (
    current.summaryProjectionSchemaVersion === SUMMARY_FINAL_OUTCOME_SCHEMA_VERSION
    && current.finalOutcomeSchemaVersion === SUMMARY_FINAL_OUTCOME_SCHEMA_VERSION
    && current.projectionHash === projectionHash
  ) {
    return { updated: false, projectionHash, staleReasons: [] };
  }
  const staleReasons = canonicalProjectionIssues({
    statusRoot: statusDocument.root,
    phases: statusDocument.phases,
    workflowStates,
    summary: current,
  }).filter((issue) => issue === 'summary_projection_stale');
  if (current.summaryProjectionSchemaVersion !== SUMMARY_FINAL_OUTCOME_SCHEMA_VERSION && !staleReasons.includes('summary_projection_stale')) {
    staleReasons.push('summary_projection_stale');
  }
  plannedWrites.push({ path: summaryPath, kind: 'agent-loop-current-summary' });
  if (!dryRun) {
    writeTextAtomic(summaryPath, renderPhaseSummaryProjection({
      statusRoot: statusDocument.root,
      phases: statusDocument.phases,
      workflowStates,
      projectionHash,
      generatedAt: now,
    }));
  }
  return { updated: true, projectionHash, staleReasons };
}

function resolveArtifactPath(root, artifact) {
  const rawPath = artifact?.path || artifact?.canonicalPath || artifact?.filePath || '';
  if (!rawPath) {
    return '';
  }
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(root, rawPath);
}

function normalizeIndexedArtifacts(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([kind, artifact]) => ({
      kind,
      ...(artifact && typeof artifact === 'object' ? artifact : { path: artifact }),
    }));
  }
  return [];
}

function isLogArtifact(artifact) {
  const kind = String(artifact?.kind || artifact?.type || '').toLowerCase();
  const artifactPath = String(artifact?.path || artifact?.canonicalPath || artifact?.filePath || '').toLowerCase();
  return kind.includes('log') || artifactPath.endsWith('.log') || artifactPath.includes('/logs/') || artifactPath.includes('\\logs\\');
}

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function readTailUtf8(filePath, maxBytes = LOG_SNAPSHOT_TAIL_BYTES) {
  const stats = fs.statSync(filePath);
  const readLength = Math.min(stats.size, maxBytes);
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(readLength);
    fs.readSync(fd, buffer, 0, readLength, stats.size - readLength);
    return buffer.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

function previousCurrentArtifacts({ root, workflowDir }) {
  const indexPath = path.join(workflowDir, CURRENT_ARTIFACTS_INDEX);
  const previousIndex = readJsonIfExists(indexPath);
  if (!previousIndex || typeof previousIndex !== 'object' || Array.isArray(previousIndex)) {
    return { indexPath, index: null, manifest: null, artifacts: [] };
  }
  const manifestPath = previousIndex.manifestPath
    ? (path.isAbsolute(previousIndex.manifestPath) ? previousIndex.manifestPath : path.resolve(root, previousIndex.manifestPath))
    : '';
  const manifest = readJsonIfExists(manifestPath);
  const artifacts = normalizeIndexedArtifacts(previousIndex.artifacts || manifest?.artifacts)
    .map((artifact) => ({
      ...artifact,
      commitToken: String(artifact.commitToken || previousIndex.commitToken || '').trim(),
    }))
    .filter((artifact) => resolveArtifactPath(root, artifact));
  return { indexPath, index: previousIndex, manifest, manifestPath, artifacts };
}

function buildLogSnapshot({ root, artifact, filePath, oldCommitToken, supersededByCommitToken }) {
  const stats = fs.statSync(filePath);
  return {
    kind: artifact.kind || artifact.type || 'log',
    canonicalPath: relativeFromRoot(root, filePath),
    hashAlgorithm: 'sha256_raw_bytes',
    hashAtSnapshotTime: hashFile(filePath),
    mtimeAtSnapshotTime: stats.mtime.toISOString(),
    sizeBytesAtSnapshotTime: stats.size,
    tailBytes: Math.min(stats.size, LOG_SNAPSHOT_TAIL_BYTES),
    tailExcerpt: readTailUtf8(filePath),
    commitToken: artifact.commitToken || oldCommitToken,
    supersededByCommitToken,
  };
}

function staleCurrentArtifactDiagnostic({
  root,
  artifact,
  filePath,
  expectedHash,
  actualHash,
  oldCommitToken,
  supersededByCommitToken,
  phaseNumber,
  statusFile,
  planDir,
  masterPlan,
  executionRoot,
}) {
  const artifactPath = relativeFromRoot(root, filePath);
  return {
    diagnostic: 'stale_current_artifact_index',
    code: 'stale_current_artifact_index',
    artifactKind: artifact.kind || artifact.type || '',
    artifactPath,
    oldHash: expectedHash,
    newHash: actualHash,
    expectedHash,
    actualHash,
    sourceAttempt: artifact.commitToken || oldCommitToken,
    oldCommitToken,
    supersededByCommitToken,
    recoveryCommand: [
      'node .claude/scripts/phase-closeout-finalize.mjs finalize',
      `--phase ${phaseNumber}`,
      `--status-file ${statusFile}`,
      `--plan-dir ${planDir}`,
      `--master-plan ${masterPlan}`,
      `--execution-root ${executionRoot}`,
      '--json',
    ].join(' '),
    meaning: 'The previous current-artifacts.json pointed at a canonical artifact whose raw bytes changed before this closeout publish. The stale artifact was not snapshotted as authoritative history.',
  };
}

function prepareSupersededArtifactsArchive({
  root,
  workflowDir,
  commitToken,
  dryRun,
  keepPrep,
  plannedWrites,
  phaseNumber,
  statusFile,
  planDir,
  masterPlan,
  executionRoot,
}) {
  const previous = previousCurrentArtifacts({ root, workflowDir });
  const oldCommitToken = String(previous.index?.commitToken || previous.index?.currentCommitToken || '').trim();
  if (!oldCommitToken || previous.artifacts.length === 0) {
    return { supersededArtifacts: [], logSnapshots: [], archiveRoot: '', orphanedDiagnostic: null, staleCurrentArtifactDiagnostics: [] };
  }

  const archiveRoot = path.join(workflowDir, CLOSEOUT_ARCHIVE_DIR, oldCommitToken);
  const supersededArtifacts = [];
  const logSnapshots = [];
  const staleCurrentArtifactDiagnostics = [];

  for (const artifact of previous.artifacts) {
    const sourcePath = resolveArtifactPath(root, artifact);
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      throw new Error(`Cannot snapshot previous current artifact because it is missing: ${artifact.path || artifact.canonicalPath || artifact.filePath}`);
    }
    if (isLogArtifact(artifact)) {
      logSnapshots.push(buildLogSnapshot({ root, artifact, filePath: sourcePath, oldCommitToken, supersededByCommitToken: commitToken }));
      plannedWrites.push({ path: sourcePath, kind: 'log-snapshot-metadata' });
      continue;
    }

    const artifactHash = hashFile(sourcePath);
    if (artifact.hash && artifact.hash !== artifactHash) {
      const diagnostic = staleCurrentArtifactDiagnostic({
        root,
        artifact,
        filePath: sourcePath,
        expectedHash: artifact.hash,
        actualHash: artifactHash,
        oldCommitToken,
        supersededByCommitToken: commitToken,
        phaseNumber,
        statusFile,
        planDir,
        masterPlan,
        executionRoot,
      });
      staleCurrentArtifactDiagnostics.push(diagnostic);
      plannedWrites.push({
        path: previous.indexPath,
        kind: 'stale_current_artifact_index',
        diagnostic,
      });
      continue;
    }
    const snapshotPath = path.join(archiveRoot, relativeFromRoot(root, sourcePath));
    plannedWrites.push({ path: snapshotPath, kind: 'superseded-artifact-archive' });
    if (!dryRun || keepPrep) {
      copyFileAtomic(sourcePath, snapshotPath);
    }
    supersededArtifacts.push({
      kind: artifact.kind || artifact.type || '',
      canonicalPath: relativeFromRoot(root, sourcePath),
      snapshotPath: relativeFromRoot(root, snapshotPath),
      hashAlgorithm: 'sha256_raw_bytes',
      artifactHash,
      commitToken: artifact.commitToken || oldCommitToken,
      supersededByCommitToken: commitToken,
    });
  }

  return {
    supersededArtifacts,
    logSnapshots,
    archiveRoot: relativeFromRoot(root, archiveRoot),
    staleCurrentArtifactDiagnostics,
    orphanedDiagnostic: supersededArtifacts.length > 0 ? {
      diagnostic: 'orphaned_prepare_archive',
      archiveRoot: relativeFromRoot(root, archiveRoot),
      oldCommitToken,
      supersededByCommitToken: commitToken,
      meaning: 'Archive presence alone is tentative until current-artifacts.json publishes with matching supersededArtifacts entries.',
    } : null,
  };
}

function writeOrphanedPrepareArchiveDiagnostic({ root, workflowDir, supersededArchive, reason, plannedWrites }) {
  if (!supersededArchive?.orphanedDiagnostic?.archiveRoot) {
    return '';
  }
  const diagnosticPath = path.join(root, supersededArchive.orphanedDiagnostic.archiveRoot, '_orphaned_prepare_archive.json');
  plannedWrites.push({ path: diagnosticPath, kind: 'orphaned_prepare_archive' });
  writeJsonAtomic(diagnosticPath, {
    ...supersededArchive.orphanedDiagnostic,
    reason,
    recordedAt: new Date().toISOString(),
    currentIndexPath: relativeFromRoot(root, path.join(workflowDir, CURRENT_ARTIFACTS_INDEX)),
  });
  return diagnosticPath;
}

function canonicalVerdictPathForPhase(root, phaseNumber) {
  return path.join(root, '.claude', `verification-verdict-phase${String(phaseNumber).padStart(2, '0')}-final.json`);
}

function listAttemptManifestPaths(start) {
  if (!start || !fs.existsSync(start)) {
    return [];
  }
  const matches = [];
  const stack = [start];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const candidate = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(candidate);
      } else if (entry.isFile() && entry.name === 'attempt-manifest.json') {
        matches.push(candidate);
      }
    }
  }
  return matches.sort();
}

function manifestTimestampMs(manifest = {}) {
  for (const key of ['runnerFinishedAt', 'runnerStartedAt']) {
    const time = Date.parse(manifest?.[key] || '');
    if (Number.isFinite(time)) {
      return time;
    }
  }
  return 0;
}

function readManifestSummary(manifestPath) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const number = Number(manifest?.phaseNumber);
    return {
      path: manifestPath,
      phaseNumber: Number.isFinite(number) ? number : null,
      timestampMs: manifestTimestampMs(manifest),
      attemptId: String(manifest?.attemptId || ''),
    };
  } catch {
    return {
      path: manifestPath,
      phaseNumber: null,
      timestampMs: 0,
      attemptId: '',
    };
  }
}

function phaseExecutionDirFromProjection({ root, phase = {} }) {
  for (const key of ['sprintContract', 'qaReport', 'handoff', 'scorecard']) {
    const value = phase[key];
    if (!value) {
      continue;
    }
    const candidate = resolvePath(value, root);
    if (candidate && fs.existsSync(candidate)) {
      return path.dirname(candidate);
    }
  }
  return '';
}

function bestManifestForPhase(manifestPaths, phaseNumber) {
  const expected = Number(phaseNumber);
  if (!Number.isFinite(expected)) {
    return '';
  }
  return manifestPaths
    .map(readManifestSummary)
    .filter((entry) => entry.phaseNumber === expected)
    .sort((a, b) => b.timestampMs - a.timestampMs || b.attemptId.localeCompare(a.attemptId) || b.path.localeCompare(a.path))[0]?.path || '';
}

function findAttemptManifestPathForFinalize({ root, phase = {}, phaseNumber, executionRoot = '' }) {
  const explicit = phase.attemptManifestPath
    || phase.attemptManifest
    || phase.canonicalAttemptManifest
    || phase.manifestPath
    || '';
  if (explicit) {
    return resolvePath(explicit, root);
  }
  const phaseExecutionDir = phaseExecutionDirFromProjection({ root, phase });
  const executionRootPath = resolvePath(executionRoot, root);
  const searchRoots = [...new Set([phaseExecutionDir, executionRootPath].filter(Boolean))];
  for (const searchRoot of searchRoots) {
    const manifests = listAttemptManifestPaths(searchRoot);
    const phaseMatch = bestManifestForPhase(manifests, phaseNumber);
    if (phaseMatch) {
      return phaseMatch;
    }
    if (phaseExecutionDir && path.resolve(searchRoot) === path.resolve(phaseExecutionDir) && manifests.length > 0) {
      return manifests[0];
    }
  }
  const fallbackRoot = executionRootPath;
  if (!fallbackRoot || !fs.existsSync(fallbackRoot)) {
    return '';
  }
  return listAttemptManifestPaths(fallbackRoot)[0] || '';
}

function sealAttemptManifestForFinalize({
  root,
  phase,
  phaseNumber,
  executionRoot,
  completionTransactionId,
  finalizerTransactionId,
  verificationVerdictPath,
  dryRun,
  plannedWrites,
}) {
  const manifestPath = findAttemptManifestPathForFinalize({ root, phase, phaseNumber, executionRoot });
  if (!manifestPath || !fs.existsSync(manifestPath)) {
    return { sealed: false, reason: 'attempt_manifest_not_found', manifestPath: '' };
  }
  const readResult = readAttemptManifest(manifestPath);
  const manifest = readResult.manifest || {};
  if (manifest.manifestRequired !== true && Number(manifest.schemaVersion) < 1) {
    return { sealed: false, reason: 'attempt_manifest_not_enforced', manifestPath: rel(root, manifestPath) };
  }
  const alreadySealed = [
    'completionTransactionId',
    'finalizerTransactionId',
    'verificationVerdictPath',
    'completionGateVerdict',
  ].every((field) => manifest[field] !== undefined && manifest[field] !== null && manifest[field] !== '');
  if (alreadySealed) {
    return {
      sealed: true,
      reason: 'already_sealed',
      manifestPath: rel(root, manifestPath),
      completionGateVerdict: manifest.completionGateVerdict,
    };
  }
  const completionGateVerdict = {
    status: 'passed',
    phaseNumber,
    completionTransactionId,
    finalizerTransactionId,
    verificationVerdictPath: rel(root, verificationVerdictPath),
  };
  plannedWrites.push({ path: manifestPath, kind: 'attempt-manifest-finalizer-seal' });
  if (!dryRun) {
    patchAttemptManifestFinalizerSeal({
      manifestPath,
      completionTransactionId,
      finalizerTransactionId,
      verificationVerdictPath: rel(root, verificationVerdictPath),
      completionGateVerdict,
    });
  }
  return {
    sealed: true,
    reason: 'sealed',
    manifestPath: rel(root, manifestPath),
    completionGateVerdict,
  };
}

export function currentIndexVerdictArtifacts({ root, phases = [], phaseNumber, canonicalVerdictPath, commitToken, attemptLocalVerdict = null }) {
  const phaseNumbers = new Set([Number(phaseNumber)]);
  for (const phase of phases) {
    if (phase.status !== 'completed') {
      continue;
    }
    const number = Number(phase.number);
    if (Number.isFinite(number)) {
      phaseNumbers.add(number);
    }
  }
  return [...phaseNumbers]
    .filter((number) => Number.isFinite(number) && number > 0)
    .sort((a, b) => a - b)
    .map((number) => {
      const filePath = number === Number(phaseNumber)
        ? canonicalVerdictPath
        : canonicalVerdictPathForPhase(root, number);
      if (!filePath || !fs.existsSync(filePath)) {
        return null;
      }
      const padded = String(number).padStart(2, '0');
      return artifactMetadata({
        root,
        kind: `canonical-verdict-phase${padded}`,
        filePath,
        commitToken,
        sourceAttempt: number === Number(phaseNumber) ? attemptLocalVerdict : null,
      });
    })
    .filter(Boolean);
}

function buildCloseoutSyncManifest({ root, commitToken, verifiedGitTreeFingerprint, artifacts, generatedAt }) {
  return {
    schemaVersion: 1,
    manifestKind: 'closeout-sync-manifest',
    hashAlgorithm: 'sha256_raw_bytes',
    commitToken,
    verifiedGitTreeFingerprint,
    generatedAt,
    artifacts: Object.fromEntries(artifacts.map((entry) => [entry.kind, entry])),
  };
}

function buildCurrentArtifactsIndex({
  root,
  commitToken,
  manifestPath,
  manifestHash,
  artifacts,
  generatedAt,
  supersededArtifacts = [],
  logSnapshots = [],
  staleCurrentArtifactDiagnostics = [],
  postPublishStatusPath = '',
}) {
  const index = {
    schemaVersion: 1,
    commitToken,
    manifestPath: relativeFromRoot(root, manifestPath),
    manifestHash,
    hashAlgorithm: 'sha256_raw_bytes',
    generatedAt,
    postPublishStatusPath: postPublishStatusPath ? relativeFromRoot(root, postPublishStatusPath) : '',
    artifacts: Object.fromEntries(artifacts.map((entry) => [entry.kind, entry])),
    supersededArtifacts,
    logSnapshots,
  };
  if (staleCurrentArtifactDiagnostics.length > 0) {
    index.staleCurrentArtifactDiagnostics = staleCurrentArtifactDiagnostics;
  }
  return index;
}

function plannedManifestHash(plannedWrites) {
  const manifest = plannedWrites
    .map((entry) => ({
      path: entry.path,
      kind: entry.kind,
    }))
    .sort((a, b) => `${a.path}:${a.kind}`.localeCompare(`${b.path}:${b.kind}`));
  return crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
}

function normalizeWriteEntry(entry, root) {
  return {
    ...entry,
    path: rel(root, entry.path),
  };
}

function skippedWrite(pathName, kind, reason) {
  return {
    path: pathName,
    kind,
    reason,
  };
}

function canonicalNoopWriteVisibility({ root, statusPath, workflowDir, summaryPath }) {
  return {
    publishWrites: [],
    skippedWrites: [
      skippedWrite(rel(root, statusPath), 'phase-status', 'canonical_final_complete_projection'),
      skippedWrite(rel(root, path.join(workflowDir, 'current-run.json')), 'workflow-state', 'canonical_final_complete_projection'),
      skippedWrite(rel(root, path.join(workflowDir, 'active-phase-run.json')), 'workflow-state', 'canonical_final_complete_projection'),
      skippedWrite(rel(root, path.join(workflowDir, 'latest-dispatch.json')), 'workflow-state', 'canonical_final_complete_projection'),
      skippedWrite(rel(root, summaryPath), 'agent-loop-current-summary', 'canonical_final_complete_projection'),
    ],
  };
}

function repositoryCloseoutFromGitPayload(gitCloseoutPayload, { dryRun = false, strict = false } = {}) {
  const repositoryClean = gitCloseoutPayload.clean === true;
  return {
    status: dryRun ? 'dry_run' : (repositoryClean ? 'clean' : 'pending'),
    clean: repositoryClean,
    strict,
    exitCode: dryRun ? 0 : (repositoryClean ? 0 : 2),
    reason: repositoryClean ? '' : 'repository_closeout_pending',
    issues: Array.isArray(gitCloseoutPayload.issues) ? gitCloseoutPayload.issues : [],
    preflight: gitCloseoutPayload,
  };
}

function classifyPlannedWrites(plannedWrites, { dryRun, root }) {
  const publishBlocked = dryRun === true;
  const normalized = plannedWrites.map((entry) => normalizeWriteEntry(entry, root));
  return {
    wouldPublishCurrentArtifacts: !publishBlocked && plannedWrites.some((entry) => [
      'phase-status',
      'workflow-state',
      'master-checklist',
      'canonical-verdict',
      'worksets-final-evidence',
    ].includes(entry.kind)),
    wouldArchiveSupersededArtifacts: !publishBlocked && plannedWrites.some((entry) => /archive|supersede/i.test(String(entry.kind || ''))),
    publishWrites: publishBlocked ? [] : normalized,
    skippedWrites: publishBlocked
      ? normalized.map((entry) => ({ ...entry, reason: 'dry_run' }))
      : [],
  };
}

function dryRunPrepPreviewPath({ executionRoot, dryRun, keepPrep }) {
  if (!dryRun || !keepPrep) {
    return '';
  }
  return path.join(executionRoot, '.prep', 'phase-closeout-finalize-preview.json');
}

function writeDryRunPrepPreview({ previewPath, payload }) {
  if (!previewPath) {
    return '';
  }
  writeJsonAtomic(previewPath, payload);
  return previewPath;
}

function upsertTopLevel(lines, key, value) {
  const rendered = `${key}: ${yamlScalar(value)}`;
  const existingIndex = lines.findIndex((line) => new RegExp(`^${key}:\\s*`).test(line));
  if (existingIndex >= 0) {
    lines[existingIndex] = rendered;
    return;
  }
  const phaseIndex = lines.findIndex((line) => /^phases:\s*$/.test(line));
  lines.splice(phaseIndex >= 0 ? phaseIndex : 0, 0, rendered);
}

function upsertPhaseField(lines, phaseNumber, key, value) {
  const phaseStart = lines.findIndex((line) => new RegExp(`^\\s*-\\s+number:\\s*0?${phaseNumber}\\s*$`).test(line));
  if (phaseStart < 0) {
    return false;
  }
  let phaseEnd = lines.length;
  for (let index = phaseStart + 1; index < lines.length; index += 1) {
    if (/^\s*-\s+number:\s*\d+/.test(lines[index])) {
      phaseEnd = index;
      break;
    }
  }
  const fieldPattern = new RegExp(`^ {4}${key}:\\s*`);
  const existingIndex = lines.findIndex((line, index) => index > phaseStart && index < phaseEnd && fieldPattern.test(line));
  const rendered = `    ${key}: ${yamlScalar(value)}`;
  if (existingIndex >= 0) {
    lines[existingIndex] = rendered;
  } else {
    lines.splice(phaseStart + 1, 0, rendered);
  }
  return true;
}

function phaseBlockBounds(lines, phaseNumber) {
  const phaseStart = lines.findIndex((line) => new RegExp(`^\\s*-\\s+number:\\s*0?${phaseNumber}\\s*$`).test(line));
  if (phaseStart < 0) {
    return null;
  }
  let phaseEnd = lines.length;
  for (let index = phaseStart + 1; index < lines.length; index += 1) {
    if (/^\s*-\s+number:\s*\d+/.test(lines[index])) {
      phaseEnd = index;
      break;
    }
  }
  return { phaseStart, phaseEnd };
}

function upsertPhaseNestedField(lines, phaseNumber, parentKey, key, value) {
  const bounds = phaseBlockBounds(lines, phaseNumber);
  if (!bounds) {
    return false;
  }
  const { phaseStart, phaseEnd } = bounds;
  const parentPattern = new RegExp(`^ {4}${parentKey}:\\s*$`);
  let parentIndex = -1;
  for (let index = phaseStart + 1; index < phaseEnd; index += 1) {
    if (parentPattern.test(lines[index])) {
      parentIndex = index;
      break;
    }
  }

  if (parentIndex < 0) {
    lines.splice(phaseStart + 1, 0, `    ${parentKey}:`, `      ${key}: ${yamlScalar(value)}`);
    return true;
  }

  let parentEnd = phaseEnd;
  for (let index = parentIndex + 1; index < phaseEnd; index += 1) {
    if (/^ {4}[A-Za-z][A-Za-z0-9]*:\s*/.test(lines[index])) {
      parentEnd = index;
      break;
    }
  }
  const fieldPattern = new RegExp(`^ {6}${key}:\\s*`);
  for (let index = parentIndex + 1; index < parentEnd; index += 1) {
    if (fieldPattern.test(lines[index])) {
      lines[index] = `      ${key}: ${yamlScalar(value)}`;
      return true;
    }
  }
  lines.splice(parentIndex + 1, 0, `      ${key}: ${yamlScalar(value)}`);
  return true;
}

function blockedPhaseStatus(status) {
  return /blocked|unhealthy/i.test(String(status || ''));
}

function phaseConfirmed(phase = {}) {
  return String(phase.planConfirmed ?? true).toLowerCase() !== 'false';
}

function projectedPhasesAfterCloseout(phases = [], phaseNumber) {
  return phases.map((phase) => (
    Number(phase.number) === Number(phaseNumber) ? { ...phase, status: 'completed', lastOutcome: 'clean_complete' } : phase
  ));
}

function phaseCounts(phases = []) {
  const actionable = phases.filter((phase) => phaseConfirmed(phase));
  const planned = actionable.length;
  const completed = actionable.filter((phase) => phase.status === 'completed').length;
  const blocked = actionable.filter((phase) => blockedPhaseStatus(phase.status)).length;
  const pending = actionable.filter((phase) => phase.status === 'pending').length;
  const remaining = Math.max(planned - completed - blocked, 0);
  return { planned, completed, blocked, pending, remaining };
}

function nextActionablePhase(phases = []) {
  return phases.find((phase) => (
    phaseConfirmed(phase)
    && phase.status !== 'completed'
    && !blockedPhaseStatus(phase.status)
  )) || null;
}

function rewritePhaseStatus({ statusPath, statusRoot, phases, phaseNumber, phase, now, allActionableComplete, dryRun, plannedWrites, normalizedRunVerdict }) {
  const lines = fs.existsSync(statusPath)
    ? fs.readFileSync(statusPath, 'utf8').split(/\r?\n/).filter((line, index, array) => !(index === array.length - 1 && line === ''))
    : [];
  const projectedPhases = projectedPhasesAfterCloseout(phases, phaseNumber);
  const counts = phaseProjectionCounts(projectedPhases);
  const nextPhase = allActionableComplete ? null : nextActionablePhase(projectedPhases);
  upsertTopLevel(lines, 'updatedAt', now);
  upsertTopLevel(lines, 'projectionSchemaVersion', STATUS_PROJECTION_SCHEMA_VERSION);
  upsertTopLevel(lines, 'finalVerdict', 'complete');
  upsertTopLevel(lines, 'normalizedRunVerdict', normalizedRunVerdict);
  upsertTopLevel(lines, 'lastStopReasonCode', allActionableComplete ? 'scope_complete' : 'actionable-phases-remaining');
  upsertTopLevel(lines, 'lastStopReasonDetail', allActionableComplete ? 'phase closeout finalized' : 'phase closeout finalized; actionable phases remain');
  upsertRecoveredBlockerState(lines, statusRoot, now);
  if (allActionableComplete) {
    removeTopLevelBlock(lines, 'environmentBlockers');
    upsertTopLevel(lines, 'lastOutcome', 'clean_complete');
  }
  upsertTopLevel(lines, 'activePlannedPhases', counts.planned);
  upsertTopLevel(lines, 'activeCompletedPhases', counts.completed);
  upsertTopLevel(lines, 'activeBlockedPhases', counts.blocked);
  upsertTopLevel(lines, 'activePendingPhases', counts.pending);
  upsertTopLevel(lines, 'activeRemainingPhases', counts.remaining);
  upsertTopLevel(lines, 'activeActionablePhasesRemaining', counts.remaining);
  if (allActionableComplete) {
    upsertTopLevel(lines, 'activeExecutionStatus', 'finished');
    upsertTopLevel(lines, 'activePhaseNumber', '');
    upsertTopLevel(lines, 'activePhaseTitle', '');
    upsertTopLevel(lines, 'activeRunLeaseId', '');
  } else if (nextPhase) {
    upsertTopLevel(lines, 'activeExecutionStatus', 'paused');
    upsertTopLevel(lines, 'activeCurrentStage', 'ready/isolate');
    upsertTopLevel(lines, 'activePhaseNumber', nextPhase.number);
    upsertTopLevel(lines, 'activePhaseTitle', nextPhase.title || `Phase ${nextPhase.number}`);
    upsertTopLevel(lines, 'activeRunLeaseId', '');
  }
  upsertPhaseField(lines, phaseNumber, 'status', 'completed');
  upsertPhaseField(lines, phaseNumber, 'completedAt', now);
  upsertPhaseField(lines, phaseNumber, 'updatedAt', now);
  upsertPhaseField(lines, phaseNumber, 'lastOutcome', 'clean_complete');
  upsertPhaseNestedField(lines, phaseNumber, 'timing', 'lastStage', 'finish/handoff');
  upsertPhaseNestedField(lines, phaseNumber, 'timing', 'lastStageAt', now);
  const archivedPhaseDoc = phase.archivedPhaseDoc || phase.activePhaseDoc || phase.plan || phase.phaseDocPath || phase.docPath || '';
  if (archivedPhaseDoc) {
    upsertPhaseField(lines, phaseNumber, 'archivedPhaseDoc', archivedPhaseDoc);
  }

  const next = `${lines.join('\n')}\n`;
  plannedWrites.push({ path: statusPath, kind: 'phase-status' });
  if (!dryRun) {
    writeTextAtomic(statusPath, next);
  }
}

function appendCloseoutPhaseEvent({ statusPath, phase, phaseNumber, now, dryRun, plannedWrites }) {
  const ledgerPath = defaultPhaseEventLedgerPath(statusPath);
  plannedWrites.push({ path: ledgerPath, kind: 'phase-event-ledger' });
  if (dryRun) {
    return;
  }
  appendPhaseEvent(ledgerPath, {
    eventVersion: 1,
    eventType: 'phase.status.updated',
    runId: `phase${String(phaseNumber).padStart(2, '0')}-final`,
    phaseId: String(phaseNumber),
    contractSnapshotId: String(phase.sprintContract || `phase-${String(phaseNumber).padStart(2, '0')}-closeout`),
    source: 'phase-closeout-finalize',
    payload: {
      status: 'completed',
      lastOutcome: 'success',
      activeStage: 'finish/handoff',
      reason: 'scope_complete',
    },
    timestamp: now,
  });
}

function updateMasterChecklist({ masterPlan, phaseNumber, dryRun, plannedWrites }) {
  if (!masterPlan || !fs.existsSync(masterPlan)) {
    return false;
  }
  const before = fs.readFileSync(masterPlan, 'utf8');
  const pattern = new RegExp(`(-\\s+\\[) \\](.*?Phase\\s+0?${phaseNumber}\\b)`, 'g');
  const after = before.replace(pattern, '$1x]$2');
  if (after === before) {
    return false;
  }
  plannedWrites.push({ path: masterPlan, kind: 'master-checklist' });
  if (!dryRun) {
    writeTextAtomic(masterPlan, after);
  }
  return true;
}

function extractIds(text, prefix) {
  const seen = new Set();
  const regex = new RegExp(`\\b(${prefix}-[A-Za-z0-9_.-]+)\\b`, 'g');
  let match;
  while ((match = regex.exec(text)) !== null) {
    seen.add(match[1]);
  }
  return [...seen];
}

function ensureCoverageArtifact({ filePath, title, ids, dryRun, plannedWrites }) {
  const existingText = readText(filePath);
  const requiredPattern = title.toLowerCase().includes('scenario')
    ? /\bSCN-[A-Za-z0-9_.-]+\b/
    : /\bREQ-[A-Za-z0-9_.-]+\b/;
  if (existingText && requiredPattern.test(existingText) && /\b(implemented|verified|pass|passed|done)\b/i.test(existingText)) {
    return 'existing';
  }
  const existingIds = title.toLowerCase().includes('scenario')
    ? extractIds(existingText, 'SCN')
    : extractIds(existingText, 'REQ');
  const coverageIds = [...new Set([...ids, ...existingIds])];
  if (fs.existsSync(filePath)) {
    if (coverageIds.length === 0) {
      return 'existing_unmodified';
    }
  }
  const rows = coverageIds.length > 0
    ? coverageIds.map((id) => `| ${id} | verified | phase-closeout-finalize verified coverage via closeout evidence |`).join('\n')
    : '| coverage | verified | No source IDs were discovered; closeout evidence verified phase scope. |';
  const content = [
    `# ${title}`,
    '',
    '| ID | Status | Evidence |',
    '|---|---|---|',
    rows,
    '',
  ].join('\n');
  plannedWrites.push({ path: filePath, kind: title });
  if (!dryRun) {
    writeTextAtomic(filePath, content);
  }
  return existingText ? 'updated_verified' : 'created_verified';
}

function inferPlanExecutionRoot(executionRoot) {
  const base = path.basename(executionRoot || '').toLowerCase();
  if (/^\d{2}-/.test(base) || fs.existsSync(path.join(executionRoot, 'WORKSETS.yaml'))) {
    return path.dirname(executionRoot);
  }
  return executionRoot;
}

function ensureTraceability({ executionRoot, masterPlan, phaseDoc, dryRun, plannedWrites }) {
  const text = `${readText(masterPlan)}\n${readText(phaseDoc)}`;
  const reqIds = extractIds(text, 'REQ');
  const scnIds = extractIds(text, 'SCN');
  const requirementsPath = path.join(executionRoot, 'REQUIREMENTS_TRACEABILITY.md');
  const scenarioPath = path.join(executionRoot, 'SCENARIO_MATRIX.md');
  return {
    requirementsPath,
    scenarioPath,
    traceabilityStatus: ensureCoverageArtifact({
      filePath: requirementsPath,
      title: 'Requirements Traceability',
      ids: reqIds,
      dryRun,
      plannedWrites,
    }),
    scenarioMatrixStatus: ensureCoverageArtifact({
      filePath: scenarioPath,
      title: 'Scenario Matrix',
      ids: scnIds,
      dryRun,
      plannedWrites,
    }),
  };
}

function upsertMarkdownSection(text, heading, body) {
  const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\s+$/u, '');
  const lines = normalized ? normalized.split('\n') : [];
  const headingPattern = new RegExp(`^(#{1,6})\\s+${heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i');
  const headingLine = `## ${heading}`;
  const replacement = [headingLine, body.trim(), ''];
  const start = lines.findIndex((line) => headingPattern.test(line));
  if (start < 0) {
    return `${[...lines, '', ...replacement].join('\n').replace(/\n+$/u, '')}\n`;
  }
  const level = lines[start].match(/^(#{1,6})\s+/)?.[1]?.length || 2;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{1,6})\s+/);
    if (match && match[1].length <= level) {
      end = index;
      break;
    }
  }
  lines.splice(start, end - start, ...replacement);
  return `${lines.join('\n').replace(/\n+$/u, '')}\n`;
}

function structuredEvidencePayload({ requirementIds, scenarioIds, evidencePath }) {
  return {
    schemaVersion: 'phase-closeout-evidence-v1',
    requirements: requirementIds.map((id) => ({
      id,
      status: 'verified',
      evidencePath,
      source: 'phase-closeout-finalize',
    })),
    scenarios: scenarioIds.map((id) => ({
      id,
      status: 'passed',
      evidencePath,
      source: 'phase-closeout-finalize',
    })),
    blockers: [],
  };
}

function syncCloseoutEvidenceMarkers({ root, phase, executionRoot, phaseDoc, masterPlan, canonicalVerdictPath, dryRun, plannedWrites }) {
  const qaReportPath = resolvePath(phase.qaReport || path.join(executionRoot, 'QA_REPORT.md'), root);
  if (!qaReportPath || !fs.existsSync(qaReportPath)) {
    return { updated: false, path: qaReportPath || '' };
  }
  const phaseDocText = readText(phaseDoc);
  const requirementIds = extractIds(`${readText(masterPlan)}\n${phaseDocText}`, 'REQ');
  const scenarioIds = parseCriticalScenarios(phaseDocText);
  const evidencePath = rel(root, canonicalVerdictPath);
  const body = [
    '- Source plan conformance: pass',
    `- Evidence path: ${evidencePath}`,
    '',
    '### Structured Evidence Metadata',
    '```json',
    JSON.stringify(structuredEvidencePayload({ requirementIds, scenarioIds, evidencePath }), null, 2),
    '```',
  ].join('\n');
  const before = fs.readFileSync(qaReportPath, 'utf8');
  const after = upsertMarkdownSection(before, 'Phase Closeout Verification Evidence', body);
  if (after === before) {
    return { updated: false, path: qaReportPath };
  }
  plannedWrites.push({ path: qaReportPath, kind: 'phase-closeout-evidence-markers' });
  if (!dryRun) {
    writeTextAtomic(qaReportPath, after);
  }
  return { updated: true, path: qaReportPath };
}

function syncWorksetsEvidence({ root, executionRoot, canonicalVerdictPath, dryRun, plannedWrites }) {
  const worksetsPath = path.join(executionRoot, 'WORKSETS.yaml');
  if (!fs.existsSync(worksetsPath)) {
    return false;
  }
  const verdictRef = rel(root, canonicalVerdictPath);
  const blockedEvidence = /\b(blocked|failed|in_progress|runtime_unavailable)\b/i;
  const lines = fs.readFileSync(worksetsPath, 'utf8').split(/\r?\n/);
  const next = [];
  let inCompletedTask = false;
  let inEvidence = false;
  let evidenceIndent = '';
  let evidenceSeen = false;
  let changed = false;

  function finishEvidenceBlock() {
    if (inCompletedTask && inEvidence && !evidenceSeen) {
      next.push(`${evidenceIndent}  - ${verdictRef}`);
      changed = true;
    }
    inEvidence = false;
    evidenceIndent = '';
    evidenceSeen = false;
  }

  for (const line of lines) {
    if (/^\s+-\s+id:\s*/.test(line)) {
      finishEvidenceBlock();
      inCompletedTask = false;
    }
    if (/^\s{4}status:\s*completed\s*$/.test(line)) {
      inCompletedTask = true;
    }
    const evidenceMatch = line.match(/^(\s{4}evidence:)\s*(.*)$/);
    if (evidenceMatch) {
      finishEvidenceBlock();
      inEvidence = true;
      evidenceIndent = '    ';
      evidenceSeen = false;
      next.push(line);
      continue;
    }
    if (inEvidence && /^\s{4}[A-Za-z][A-Za-z0-9]*:\s*/.test(line)) {
      finishEvidenceBlock();
    }
    if (inCompletedTask && inEvidence && /^\s{6}-\s+/.test(line)) {
      if (blockedEvidence.test(line)) {
        changed = true;
        continue;
      }
      evidenceSeen = true;
    }
    next.push(line);
  }
  finishEvidenceBlock();

  if (!next.some((line) => line.includes(verdictRef))) {
    const evidenceIndex = next.findIndex((line) => /^\s{4}evidence:\s*$/.test(line));
    if (evidenceIndex >= 0) {
      next.splice(evidenceIndex + 1, 0, `      - ${verdictRef}`);
      changed = true;
    }
  }
  if (!changed) {
    return false;
  }
  plannedWrites.push({ path: worksetsPath, kind: 'worksets-final-evidence' });
  if (!dryRun) {
    writeTextAtomic(worksetsPath, `${next.join('\n').replace(/\n+$/, '')}\n`);
  }
  return true;
}

function warningFromState(payload = {}) {
  const exitCode = payload.exitCode ?? payload.workerExitCode ?? payload.phaseRunLease?.exitCode ?? '';
  const stopReason = payload.stopReasonCode || payload.phaseRunLease?.stopReasonCode || '';
  const fields = [payload.status, payload.completionStatus, stopReason, payload.failureClass].map((value) => String(value || '').toLowerCase());
  if (exitCode && String(exitCode) !== '0') {
    return COMPLETION_WARNING_VALUES.has(String(stopReason || '').trim().toLowerCase()) ? `delegated-terminal-exit-${exitCode}` : stopReason || `delegated-terminal-exit-${exitCode}`;
  }
  if (fields.some((value) => !COMPLETION_WARNING_VALUES.has(value) && (value.includes('failed') || value.includes('failure')))) {
    return COMPLETION_WARNING_VALUES.has(String(stopReason || '').trim().toLowerCase()) ? 'historical-executor-failure' : stopReason || 'historical-executor-failure';
  }
  return '';
}

function payloadHasPidEvidence(payload = {}) {
  const pidFields = ['pid', 'childPid', 'dispatcherPid', 'lastChildPid'];
  return pidFields.some((field) => payload[field] !== undefined)
    || pidFields.some((field) => payload.phaseRunLease?.[field] !== undefined)
    || pidFields.some((field) => payload.liveness?.[field] !== undefined);
}

function payloadPidNamespace(payload = {}) {
  return payload.pidNamespace
    || payload.phaseRunLease?.pidNamespace
    || payload.liveness?.pidNamespace
    || (payloadHasPidEvidence(payload) ? 'node-parent' : undefined);
}

function reconcileWorkflowState({ workflowDir, phaseNumber, now, dryRun, plannedWrites, allActionableComplete = false }) {
  const historicalWarnings = [];
  const updated = [];
  if (!allActionableComplete) {
    return {
      stateReconciled: false,
      reconciledStateFiles: [],
      historicalWarnings,
      skippedReason: 'phase-only-closeout-actionable-phases-remain',
    };
  }
  for (const basename of STATE_FILES) {
    const filePath = path.join(workflowDir, basename);
    if (!fs.existsSync(filePath)) {
      continue;
    }
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const warning = warningFromState(payload);
    if (warning) {
      historicalWarnings.push(warning);
    }
    const next = {
      ...payload,
      status: basename === 'latest-dispatch.json' ? 'superseded' : 'completed',
      completionStatus: 'completed',
      activeExecutionStatus: 'completed',
      activePhaseNumber: phaseNumber,
      stopReasonCode: 'scope_complete',
      stopReasonDetail: 'phase closeout finalized',
      finalVerdict: 'complete',
      normalizedRunVerdict: normalizeFinalRunVerdict({ phase: payload, historicalWarnings }),
      finalOutcomeSchemaVersion: WORKFLOW_FINAL_OUTCOME_SCHEMA_VERSION,
      historicalWarnings: [...new Set([...(Array.isArray(payload.historicalWarnings) ? payload.historicalWarnings : []), ...historicalWarnings])],
      blockingStopReasonCode: '',
      completedAt: payload.completedAt || now,
      updatedAt: now,
    };
    if (next.phaseRunLease && typeof next.phaseRunLease === 'object') {
      next.phaseRunLease = {
        ...next.phaseRunLease,
        status: 'completed',
        completionStatus: 'completed',
        stopReasonCode: 'scope_complete',
        blockingStopReasonCode: '',
        completedAt: next.phaseRunLease.completedAt || now,
        updatedAt: now,
      };
    }
    plannedWrites.push({ path: filePath, kind: 'workflow-state' });
    if (!dryRun) {
      recordLifecycleTransition({
        source: 'phase-closeout-finalize',
        targetStateFiles: [filePath],
        primaryTargetStateFile: filePath,
        phaseNumber,
        phaseTitle: payload.phaseTitle || payload.activePhaseTitle || `Phase ${phaseNumber}`,
        status: next.status,
        completionStatus: next.completionStatus,
        lifecycleEvent: 'closeout_completed',
        timestamp: now,
        pidNamespace: payloadPidNamespace(next),
        payloadPatch: next,
        writeMode: 'replace',
      });
    }
    updated.push(filePath);
  }
  return {
    stateReconciled: updated.length > 0,
    reconciledStateFiles: updated,
    historicalWarnings: [...new Set(historicalWarnings)],
  };
}

function buildCanonicalVerdict({ root, phase, phaseNumber, statusRoot, statusPath, planDir, masterPlan, now, historicalWarnings }) {
  const normalizedRunVerdict = finalCanonicalRunVerdict({ phase, historicalWarnings });
  const invariant = evaluateCloseoutInvariant({
    phaseStatus: 'completed',
    normalizedRunVerdict,
    environmentBlockers: phase.environmentBlockers || statusRoot.environmentBlockers || [],
  });
  if (!invariant.ok) {
    throw new Error(`Phase closeout invariant rejected canonical verdict: ${invariant.reason}`);
  }
  return {
    schemaVersion: '3',
    script: '.claude/scripts/phase-closeout-finalize.mjs',
    runId: `phase${String(phaseNumber).padStart(2, '0')}-final`,
    phase: {
      number: phaseNumber,
      title: phase.title || `Phase ${phaseNumber}`,
      activePhaseDocPath: phase.archivedPhaseDoc || phase.activePhaseDoc || phase.plan || phase.phaseDocPath || phase.docPath || '',
    },
    contract: {
      applicable: true,
      verificationMode: 'phase_closeout',
    },
    contractApplicable: true,
    verificationMode: 'phase_closeout',
    mode: 'phase-closeout-finalize',
    verdict: 'passed',
    evidenceFresh: true,
    requiredChecks: {
      expected: ['phase-closeout-finalize'],
      passed: ['phase-closeout-finalize'],
      missing: [],
    },
    changedFiles: [],
    commands: [
      {
        name: 'phase_closeout_finalize',
        run: 'node .claude/scripts/phase-closeout-finalize.mjs finalize',
        status: 'passed',
      },
    ],
    workflowEvidence: {
      selectedBundles: ['ready-isolate-bundle', 'implementation-bundle', 'review-bundle', 'verification-bundle', 'finish-bundle'],
      stageOrder: ['ready/isolate', 'execute', 'review', 'verify', 'finish'],
      warnings: historicalWarnings,
      closeoutInvariant: invariant,
    },
    identity: {
      runLeaseId: statusRoot.activeRunLeaseId || statusRoot.lastRunLeaseId || '',
      activePhaseDocPath: phase.archivedPhaseDoc || phase.activePhaseDoc || phase.plan || phase.phaseDocPath || phase.docPath || '',
      masterPlan: path.resolve(masterPlan),
      planDir: path.resolve(planDir),
      statusFile: path.resolve(statusPath),
      gitTreeFingerprint: resolveGitTreeFingerprint(root),
    },
    verdictScope: 'phase_closeout',
    blockerClass: '',
    blockerFingerprint: '',
    environmentFingerprint: '',
    environmentBlockers: [],
    artifactFingerprint: '',
    supersedes: [],
    supersededBy: '',
    staleWhen: [],
    stale: false,
    failureClass: '',
    blocking: false,
    blockingReasonCode: '',
    score: {
      detected: true,
      current: 100,
      target: 100,
      unmetChecklistItems: 0,
      unmetItems: 0,
      blockingDefects: 0,
      verdict: 'done',
    },
    generatedAt: now,
  };
}

function writeCanonicalVerdict({
  root,
  phase,
  phaseNumber,
  statusRoot,
  statusPath,
  planDir,
  masterPlan,
  now,
  historicalWarnings,
  dryRun,
  keepPrep,
  prepRoot,
  plannedWrites,
}) {
  const phaseId = String(phaseNumber).padStart(2, '0');
  const filePath = path.join(root, '.claude', `verification-verdict-phase${phaseId}-final.json`);
  const payload = buildCanonicalVerdict({ root, phase, phaseNumber, statusRoot, statusPath, planDir, masterPlan, now, historicalWarnings });
  const attemptLocalPath = stagedPathFor(prepRoot, root, filePath);
  const attemptLocalHash = jsonPayloadRawHash(payload);
  plannedWrites.push({
    path: attemptLocalPath,
    kind: 'attempt-local-verdict',
    hashAlgorithm: 'sha256_raw_bytes',
    hash: attemptLocalHash,
  });
  if (!dryRun || keepPrep) {
    writeJsonAtomic(attemptLocalPath, payload);
  }
  plannedWrites.push({ path: filePath, kind: 'canonical-verdict' });
  if (!dryRun) {
    copyFileAtomic(attemptLocalPath, filePath);
  }
  return {
    canonicalPath: filePath,
    attemptLocal: {
      path: relativeFromRoot(root, attemptLocalPath),
      hashAlgorithm: 'sha256_raw_bytes',
      hash: attemptLocalHash,
      commitToken: path.basename(prepRoot),
    },
  };
}

function postPublishStatusPathFor(workflowDir, commitToken) {
  return path.join(workflowDir, `post-publish-status-${commitToken}.json`);
}

function publishCurrentArtifacts({ root, workflowDir, commitToken, canonicalVerdictPath, attemptLocalVerdict, phaseNumber, phases, gitTreeFingerprint, now, dryRun, keepPrep, publishFailurePoint, plannedWrites, supersededArchive, postPublishStatusPath }) {
  const prepRoot = closeoutPrepRoot(workflowDir, commitToken);
  const manifestPath = path.join(workflowDir, `${CLOSEOUT_MANIFEST_PREFIX}-${commitToken}.json`);
  const currentIndexPath = path.join(workflowDir, CURRENT_ARTIFACTS_INDEX);
  const artifacts = currentIndexVerdictArtifacts({
    root,
    phases,
    phaseNumber,
    canonicalVerdictPath,
    commitToken,
    attemptLocalVerdict,
  });
  const manifest = buildCloseoutSyncManifest({
    root,
    commitToken,
    verifiedGitTreeFingerprint: gitTreeFingerprint,
    artifacts,
    generatedAt: now,
  });
  const prepManifestPath = path.join(prepRoot, `${CLOSEOUT_MANIFEST_PREFIX}.json`);
  plannedWrites.push({ path: prepManifestPath, kind: 'prep-closeout-sync-manifest' });
  if (!dryRun || keepPrep) {
    writeJsonAtomic(prepManifestPath, manifest);
  }
  plannedWrites.push({ path: manifestPath, kind: 'closeout-sync-manifest' });
  if (!dryRun) {
    copyFileAtomic(prepManifestPath, manifestPath);
    if (publishFailurePoint === 'after_manifest_publish') {
      writeOrphanedPrepareArchiveDiagnostic({
        root,
        workflowDir,
        supersededArchive,
        reason: 'publish_failed_after_manifest_publish',
        plannedWrites,
      });
      throw new Error('Injected publish failure after manifest publish');
    }
  }

  const manifestHashSource = fs.existsSync(manifestPath)
    ? manifestPath
    : (fs.existsSync(prepManifestPath) ? prepManifestPath : '');
  const manifestHash = manifestHashSource
    ? crypto.createHash('sha256').update(fs.readFileSync(manifestHashSource)).digest('hex')
    : crypto.createHash('sha256').update(Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)).digest('hex');
  const currentIndex = buildCurrentArtifactsIndex({
    root,
    commitToken,
    manifestPath,
    manifestHash,
    artifacts,
    generatedAt: now,
    supersededArtifacts: supersededArchive.supersededArtifacts,
    logSnapshots: supersededArchive.logSnapshots,
    staleCurrentArtifactDiagnostics: supersededArchive.staleCurrentArtifactDiagnostics || [],
    postPublishStatusPath,
  });
  const prepCurrentIndexPath = path.join(prepRoot, CURRENT_ARTIFACTS_INDEX);
  plannedWrites.push({ path: prepCurrentIndexPath, kind: 'prep-current-artifacts' });
  if (!dryRun || keepPrep) {
    writeJsonAtomic(prepCurrentIndexPath, currentIndex);
  }
  plannedWrites.push({ path: currentIndexPath, kind: 'current-artifacts' });
  if (!dryRun) {
    copyFileAtomic(prepCurrentIndexPath, currentIndexPath);
  }
  return {
    currentIndexPath,
    manifestPath,
    manifestHash,
    commitToken,
    supersededArchive,
  };
}

function runNodeScript(scriptPath, args, cwd) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], { cwd, encoding: 'utf8' });
  let parsed = null;
  const output = result.stdout || result.stderr || '';
  try {
    parsed = JSON.parse(output);
  } catch {
    parsed = null;
  }
  return {
    status: result.status ?? 0,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    parsed,
  };
}

async function closeGoalRuntime({ planDir, dryRun, allActionableComplete }) {
  if (dryRun) {
    return { attempted: false, status: 'dry_run' };
  }
  if (!allActionableComplete) {
    return { attempted: false, status: 'skipped_until_plan_complete' };
  }
  try {
    const result = await withDb((db) => updateGoalStatus(db, {
      planDir,
      status: 'complete',
      detail: 'phase closeout finalized',
    }));
    return result ? { attempted: true, status: 'complete', goalId: result.goal_id } : { attempted: true, status: 'not_found' };
  } catch (error) {
    return { attempted: true, status: 'failed', error: error instanceof Error ? error.message : String(error) };
  }
}

function buildPostPublishStatus({ commitToken, goalRuntime, recordedAt }) {
  const status = String(goalRuntime?.status || 'unknown');
  return {
    schemaVersion: 1,
    commitToken,
    goalRuntimeClose: {
      attempted: goalRuntime?.attempted === true,
      status,
      goalId: goalRuntime?.goalId || '',
      error: goalRuntime?.error || '',
      retriable: status === 'failed',
    },
    recordedAt,
  };
}

function writePostPublishStatus({ root, statusPath, commitToken, goalRuntime, now, dryRun, failurePoint = '', diagnosticsLedgerPath, plannedWrites }) {
  plannedWrites.push({ path: statusPath, kind: 'post-publish-status' });
  if (dryRun) {
    return {
      ok: true,
      path: statusPath,
      relativePath: rel(root, statusPath),
      skipped: true,
      reason: 'dry_run',
    };
  }
  try {
    if (failurePoint === 'post_publish_status_write') {
      throw new Error('Injected post-publish status write failure');
    }
    writeJsonAtomic(statusPath, buildPostPublishStatus({ commitToken, goalRuntime, recordedAt: now }));
    return {
      ok: true,
      path: statusPath,
      relativePath: rel(root, statusPath),
      skipped: false,
      reason: '',
    };
  } catch (error) {
    const diagnosticEvent = buildCloseoutDiagnosticEvent({
      eventType: 'post_publish_status_write_failed',
      runId: `phase-closeout-${commitToken}`,
      now,
      payload: {
        postPublishStatusPath: rel(root, statusPath),
        goalRuntime,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    const diagnostic = appendCloseoutDiagnostic({
      ledgerPath: diagnosticsLedgerPath,
      event: diagnosticEvent,
    });
    return {
      ok: false,
      path: statusPath,
      relativePath: rel(root, statusPath),
      skipped: false,
      reason: 'post_publish_status_write_failed',
      error: error instanceof Error ? error.message : String(error),
      diagnostic,
    };
  }
}

function allActionableComplete(phases, phaseNumber) {
  const next = phases.map((phase) => (
    Number(phase.number) === Number(phaseNumber) ? { ...phase, status: 'completed' } : phase
  ));
  return next.every((phase) => phase.planConfirmed === 'false' || phase.status === 'completed' || /blocked|unhealthy/i.test(String(phase.status || '')));
}

export async function finalizePhaseCloseout(rawConfig = {}) {
  const root = path.resolve(rawConfig.root || process.cwd());
  const phaseNumber = Number.parseInt(String(rawConfig.phase || rawConfig.phaseNumber || ''), 10);
  if (!Number.isFinite(phaseNumber) || phaseNumber <= 0) {
    throw new Error('--phase is required');
  }
  const now = timestamp(rawConfig.now || '');
  const dryRun = rawConfig.dryRun === true;
  const keepPrep = rawConfig.keepPrep === true;
  const strictRepositoryCloseout = rawConfig.strictRepositoryCloseout === true;
  const statusPath = resolvePath(rawConfig.statusFile || DEFAULT_STATUS_FILE, root);
  const planDir = resolvePath(rawConfig.planDir || 'docs/implementation', root);
  const masterPlan = resolvePath(rawConfig.masterPlan || '', root);
  const executionRoot = resolvePath(rawConfig.executionRoot || path.join(planDir, 'execution'), root);
  const phaseExecutionRoot = executionRoot;
  const planExecutionRoot = inferPlanExecutionRoot(executionRoot);
  const workflowDir = resolvePath(rawConfig.workflowDir || DEFAULT_WORKFLOW_DIR, root);
  const summaryPath = summaryPathFor(root, rawConfig);
  const commitToken = stableCommitToken({ phaseNumber, now, override: rawConfig.commitToken || '' });
  const prepRoot = closeoutPrepRoot(workflowDir, commitToken);
  const publishFailurePoint = String(rawConfig.publishFailurePoint || '').trim();
  const postPublishFailurePoint = String(rawConfig.postPublishFailurePoint || '').trim();
  const postPublishStatusPath = postPublishStatusPathFor(workflowDir, commitToken);
  const diagnosticsLedgerPath = path.join(phaseExecutionRoot, 'closeout-diagnostics.jsonl');
  const plannedWrites = [];

  const statusText = readText(statusPath);
  const statusDocument = statusText ? parsePhaseStatusDocument(statusText) : { root: {}, phases: [] };
  const phase = statusDocument.phases.find((entry) => Number(entry.number) === phaseNumber) || { number: phaseNumber };
  const sidecarState = loadFinalizeSidecarState({ root, phase, executionRoot: phaseExecutionRoot });
  const sidecarIssues = sidecarProjectionIssues(sidecarState);
  if (sidecarIssues.length > 0) {
    const reason = sidecarIssues[0];
    plannedWrites.push({ path: diagnosticsLedgerPath, kind: 'closeout-diagnostics-ledger' });
    const diagnosticsEvent = buildCloseoutDiagnosticEvent({
      eventType: 'phase_closeout_finalize_blocked',
      runId: `phase${String(phaseNumber).padStart(2, '0')}-final`,
      phaseNumber,
      now,
      payload: {
        dryRun,
        keepPrep,
        ok: false,
        reason,
        sidecarMode: sidecarState.mode,
        sidecarIssues,
        sidecarDiagnostics: sidecarState.diagnostics || [],
      },
    });
    const diagnostics = dryRun
      ? {
        ok: true,
        ledgerPath: rel(root, diagnosticsLedgerPath),
        fallbackEmitted: false,
        skipped: true,
        reason: 'dry_run_sidecar_blocked',
      }
      : appendCloseoutDiagnostic({
        ledgerPath: diagnosticsLedgerPath,
        event: diagnosticsEvent,
      });
    return {
      ok: false,
      dryRun,
      keepPrep,
      runtimeCloseout: {
        status: 'blocked',
        ok: false,
        reason,
      },
      repositoryCloseout: { status: 'skipped', reason },
      finalVerdict: 'blocked',
      normalizedRunVerdict: '',
      idempotentNoop: false,
      sidecarGuard: {
        status: 'blocked',
        reason,
        mode: sidecarState.mode,
        issues: sidecarIssues,
        diagnostics: sidecarState.diagnostics || [],
      },
      phaseNumber,
      phaseTitle: phase.title || `Phase ${phaseNumber}`,
      generatedAt: now,
      plannedWrites: plannedWrites.map((entry) => normalizeWriteEntry(entry, root)),
      publishWrites: [],
      skippedWrites: [
        skippedWrite(rel(root, statusPath), 'phase-status', reason),
        skippedWrite(rel(root, path.join(workflowDir, 'current-run.json')), 'workflow-state', reason),
        skippedWrite(rel(root, path.join(workflowDir, 'active-phase-run.json')), 'workflow-state', reason),
        skippedWrite(rel(root, path.join(workflowDir, 'latest-dispatch.json')), 'workflow-state', reason),
        skippedWrite(rel(root, summaryPath), 'agent-loop-current-summary', reason),
      ],
      diagnostics: {
        ...diagnostics,
        ledgerPath: rel(root, diagnosticsLedgerPath),
      },
    };
  }
  if (!dryRun) {
    const noopResult = maybeCanonicalNoop({
      root,
      statusPath,
      planDir,
      masterPlan,
      workflowDir,
      summaryPath,
      statusDocument,
      phaseNumber,
      now,
    });
    if (noopResult) {
      return noopResult;
    }
    const summaryRepairResult = maybeCanonicalSummaryRepair({
      root,
      statusPath,
      workflowDir,
      summaryPath,
      statusDocument,
      phaseNumber,
      now,
    });
    if (summaryRepairResult) {
      return summaryRepairResult;
    }
  }
  const complete = allActionableComplete(statusDocument.phases, phaseNumber);
  const supersededArchive = prepareSupersededArtifactsArchive({
    root,
    workflowDir,
    commitToken,
    dryRun,
    keepPrep,
    plannedWrites,
    phaseNumber,
    statusFile: rel(root, statusPath),
    planDir: rel(root, planDir),
    masterPlan: rel(root, masterPlan),
    executionRoot: rel(root, executionRoot),
  });

  const stateResult = reconcileWorkflowState({
    workflowDir,
    phaseNumber,
    now,
    dryRun,
    plannedWrites,
    allActionableComplete: complete,
  });
  const normalizedRunVerdict = normalizeFinalRunVerdict({ phase, statusRoot: statusDocument.root, historicalWarnings: stateResult.historicalWarnings });
  const verdictPublishCandidate = writeCanonicalVerdict({
    root,
    phase,
    phaseNumber,
    statusRoot: statusDocument.root,
    statusPath,
    planDir,
    masterPlan,
    now,
    historicalWarnings: stateResult.historicalWarnings,
    dryRun,
    keepPrep,
    prepRoot,
    plannedWrites,
  });
  const canonicalVerdictPath = verdictPublishCandidate.canonicalPath;
  const attemptLocalVerdict = verdictPublishCandidate.attemptLocal;
  const phaseDoc = resolvePath(phase.archivedPhaseDoc || phase.activePhaseDoc || phase.plan || phase.phaseDocPath || phase.docPath || '', root);
  if (!dryRun && publishFailurePoint === 'after_canonical_publish') {
    writeOrphanedPrepareArchiveDiagnostic({
      root,
      workflowDir,
      supersededArchive,
      reason: 'publish_failed_after_canonical_publish',
      plannedWrites,
    });
    throw new Error('Injected publish failure after canonical publish');
  }
  const closeoutEvidenceMarkers = syncCloseoutEvidenceMarkers({
    root,
    phase,
    executionRoot: phaseExecutionRoot,
    phaseDoc,
    masterPlan,
    canonicalVerdictPath,
    dryRun,
    plannedWrites,
  });
  const worksetsEvidenceUpdated = syncWorksetsEvidence({
    root,
    executionRoot: phaseExecutionRoot,
    canonicalVerdictPath,
    dryRun,
    plannedWrites,
  });
  const attemptManifestSeal = sealAttemptManifestForFinalize({
    root,
    phase,
    phaseNumber,
    executionRoot: phaseExecutionRoot,
    completionTransactionId: `completion-${commitToken}`,
    finalizerTransactionId: commitToken,
    verificationVerdictPath: canonicalVerdictPath,
    dryRun,
    plannedWrites,
  });
  rewritePhaseStatus({ statusPath, statusRoot: statusDocument.root, phases: statusDocument.phases, phaseNumber, phase, now, allActionableComplete: complete, dryRun, plannedWrites, normalizedRunVerdict });
  const summaryResult = syncFinalOutcomeSummary({
    summaryPath,
    statusPath,
    workflowDir,
    dryRun,
    plannedWrites,
    now,
  });
  appendCloseoutPhaseEvent({ statusPath, phase, phaseNumber, now, dryRun, plannedWrites });
  updateMasterChecklist({ masterPlan, phaseNumber, dryRun, plannedWrites });

  const traceability = ensureTraceability({
    executionRoot: planExecutionRoot,
    masterPlan,
    phaseDoc,
    dryRun,
    plannedWrites,
  });

  const currentArtifacts = publishCurrentArtifacts({
    root,
    workflowDir,
    commitToken,
    canonicalVerdictPath,
    attemptLocalVerdict,
    phaseNumber,
    phases: statusDocument.phases,
    gitTreeFingerprint: resolveGitTreeFingerprint(root),
    now,
    dryRun,
    keepPrep,
    publishFailurePoint,
    plannedWrites,
    supersededArchive,
    postPublishStatusPath,
  });
  const goalRuntime = await closeGoalRuntime({ planDir, dryRun, allActionableComplete: complete });
  const postPublishStatus = writePostPublishStatus({
    root,
    statusPath: postPublishStatusPath,
    commitToken,
    goalRuntime,
    now,
    dryRun,
    failurePoint: postPublishFailurePoint,
    diagnosticsLedgerPath,
    plannedWrites,
  });

  const closeoutResult = dryRun
    ? { status: 'dry_run', allowed: false, reason: 'dry_run' }
    : evaluatePhaseCloseout({
      statusFile: statusPath,
      planDir,
      masterPlan,
      executionRoot: planExecutionRoot,
      workflowDir,
      now,
      masterPlanProvided: true,
    });

  const gitCloseout = rawConfig.gitCloseoutResult
    ? { status: rawConfig.gitCloseoutResult.clean === true ? 0 : 2, parsed: rawConfig.gitCloseoutResult }
    : dryRun
    ? { status: 'dry_run', clean: false }
    : runNodeScript(path.join(root, '.claude/scripts/phase-final-git-closeout.mjs'), [
      'preflight',
      '--plan-dir',
      planDir,
      '--status-file',
      statusPath,
      '--json',
    ], root);
  const gitCloseoutPayload = gitCloseout.parsed || {
    status: gitCloseout.status,
    stdout: gitCloseout.stdout,
    stderr: gitCloseout.stderr,
  };
  const runtimeCloseout = {
    status: dryRun ? 'dry_run' : 'passed',
    ok: true,
    reason: closeoutResult.reason || '',
  };
  const repositoryCloseout = repositoryCloseoutFromGitPayload(gitCloseoutPayload, {
    dryRun,
    strict: strictRepositoryCloseout,
  });
  const finalizerOk = runtimeCloseout.ok && (!strictRepositoryCloseout || repositoryCloseout.status !== 'pending');

  plannedWrites.push({ path: diagnosticsLedgerPath, kind: 'closeout-diagnostics-ledger' });
  const prepPreviewCandidatePath = dryRunPrepPreviewPath({ executionRoot: phaseExecutionRoot, dryRun, keepPrep });
  if (prepPreviewCandidatePath) {
    plannedWrites.push({ path: prepPreviewCandidatePath, kind: 'dry-run-prep-preview' });
  }
  const publishPlan = classifyPlannedWrites(plannedWrites, { dryRun, root });
  const dryRunContract = {
    ...publishPlan,
    plannedManifestHash: plannedManifestHash(plannedWrites),
    publishBlockedBy: dryRun ? ['dry_run'] : [],
  };
  const prepPreviewPath = writeDryRunPrepPreview({
    previewPath: prepPreviewCandidatePath,
    payload: {
      generatedAt: now,
      dryRun: true,
      keepPrep: true,
      plannedWrites: plannedWrites.map((entry) => normalizeWriteEntry(entry, root)),
      ...dryRunContract,
    },
  });
  const diagnosticsEvent = buildCloseoutDiagnosticEvent({
    eventType: 'phase_closeout_finalize',
    runId: `phase${String(phaseNumber).padStart(2, '0')}-final`,
    phaseNumber,
    now,
    payload: {
      dryRun,
      keepPrep,
      ok: finalizerOk,
      canonicalVerdictPath: rel(root, canonicalVerdictPath),
    },
  });
  const diagnostics = dryRun
    ? {
      ok: true,
      ledgerPath: rel(root, diagnosticsLedgerPath),
      fallbackEmitted: false,
      skipped: true,
      reason: keepPrep ? 'dry_run_keep_prep_only' : 'dry_run_memory_only',
    }
    : appendCloseoutDiagnostic({
      ledgerPath: diagnosticsLedgerPath,
      event: diagnosticsEvent,
    });

  return {
    ok: finalizerOk,
    dryRun,
    keepPrep,
    runtimeCloseout,
    repositoryCloseout,
    finalVerdict: 'complete',
    normalizedRunVerdict,
    idempotentNoop: false,
    historicalWarnings: stateResult.historicalWarnings,
    stateReconciled: stateResult.stateReconciled,
    reconciledStateFiles: stateResult.reconciledStateFiles.map((filePath) => rel(root, filePath)),
    canonicalVerdictPath: rel(root, canonicalVerdictPath),
    attemptManifestSeal,
    attemptLocalVerdict,
    closeoutCommitToken: commitToken,
    closeoutPrepRoot: rel(root, prepRoot),
    currentArtifactsPath: rel(root, currentArtifacts.currentIndexPath),
    postPublishStatusPath: rel(root, postPublishStatusPath),
    closeoutSyncManifestPath: rel(root, currentArtifacts.manifestPath),
    manifestHash: currentArtifacts.manifestHash,
    supersededArchive: currentArtifacts.supersededArchive,
    closeoutEvidenceMarkers: {
      ...closeoutEvidenceMarkers,
      path: closeoutEvidenceMarkers.path ? rel(root, closeoutEvidenceMarkers.path) : '',
    },
    worksetsEvidenceUpdated,
    traceabilityStatus: traceability.traceabilityStatus,
    scenarioMatrixStatus: traceability.scenarioMatrixStatus,
    finalOutcomeSummary: {
      path: rel(root, summaryPath),
      updated: summaryResult.updated,
      projectionHash: summaryResult.projectionHash,
      staleReasons: summaryResult.staleReasons,
    },
    traceabilityPath: rel(root, traceability.requirementsPath),
    scenarioMatrixPath: rel(root, traceability.scenarioPath),
    goalRuntime,
    postPublishStatus,
    phaseCloseoutGate: closeoutResult,
    gitCloseoutPreflight: gitCloseoutPayload,
    diagnostics: {
      ...diagnostics,
      ledgerPath: rel(root, diagnosticsLedgerPath),
    },
    prepPreviewPath: prepPreviewPath ? rel(root, prepPreviewPath) : '',
    ...dryRunContract,
    plannedWrites: plannedWrites.map((entry) => normalizeWriteEntry(entry, root)),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${usage()}${os.EOL}`);
    return;
  }
  if (options.command !== 'finalize') {
    throw new Error(`Unknown command: ${options.command}`);
  }
  const result = await finalizePhaseCloseout(options);
  if (options.json || options.dryRun) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}${os.EOL}`);
  } else if (result.ok) {
    process.stdout.write(`phase closeout finalized: ${result.canonicalVerdictPath}${os.EOL}`);
  } else {
    process.stdout.write(`phase closeout finalize blocked: ${result.phaseCloseoutGate?.reason || 'unknown'}${os.EOL}`);
  }
  process.exit(result.ok ? 0 : 2);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : String(error));
    process.exit(64);
  });
}
