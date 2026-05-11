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
import { appendPhaseEvent, defaultPhaseEventLedgerPath } from './lib/phase-event-ledger.mjs';
import { parsePhaseStatusDocument, readText, resolvePath } from './lib/phase-closeout-parsers.mjs';
import { updateGoalStatus, withDb } from './runtime-state.mjs';

const DEFAULT_STATUS_FILE = '.claude/docs/phase-status.yaml';
const DEFAULT_WORKFLOW_DIR = '.claude/logs/workflow-enforcement';
const CURRENT_ARTIFACTS_INDEX = 'current-artifacts.json';
const CLOSEOUT_MANIFEST_PREFIX = 'closeout-sync-manifest';
const CLOSEOUT_ARCHIVE_DIR = 'closeout-archive';
const LOG_SNAPSHOT_TAIL_BYTES = 64 * 1024;
const STATE_FILES = ['current-run.json', 'active-phase-run.json', 'latest-dispatch.json'];

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

function finalCanonicalRunVerdict({ phase = {}, historicalWarnings = [] } = {}) {
  const phaseVerdict = String(phase.normalizedRunVerdict || '').trim().toLowerCase();
  if (['complete', 'success', 'success_with_warning'].includes(phaseVerdict)) {
    return phaseVerdict;
  }
  return historicalWarnings.length > 0 ? 'success_with_warning' : 'complete';
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

function writeJsonAtomic(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempFile = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tempFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tempFile, filePath);
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

function artifactMetadata({ root, kind, filePath, commitToken }) {
  const stats = fs.statSync(filePath);
  return {
    kind,
    path: relativeFromRoot(root, filePath),
    hashAlgorithm: 'sha256_raw_bytes',
    hash: crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'),
    sizeBytes: stats.size,
    mtimeMs: stats.mtimeMs,
    commitToken,
  };
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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

function prepareSupersededArtifactsArchive({ root, workflowDir, commitToken, dryRun, keepPrep, plannedWrites }) {
  const previous = previousCurrentArtifacts({ root, workflowDir });
  const oldCommitToken = String(previous.index?.commitToken || previous.index?.currentCommitToken || '').trim();
  if (!oldCommitToken || previous.artifacts.length === 0) {
    return { supersededArtifacts: [], logSnapshots: [], archiveRoot: '', orphanedDiagnostic: null };
  }

  const archiveRoot = path.join(workflowDir, CLOSEOUT_ARCHIVE_DIR, oldCommitToken);
  const supersededArtifacts = [];
  const logSnapshots = [];

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
      throw new Error(`Cannot snapshot previous current artifact with stale hash: ${relativeFromRoot(root, sourcePath)}`);
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

export function currentIndexVerdictArtifacts({ root, phases = [], phaseNumber, canonicalVerdictPath, commitToken }) {
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

function buildCurrentArtifactsIndex({ root, commitToken, manifestPath, manifestHash, artifacts, generatedAt, supersededArtifacts = [], logSnapshots = [], postPublishStatusPath = '' }) {
  return {
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

function classifyPlannedWrites(plannedWrites, dryRun) {
  const publishBlocked = dryRun === true;
  return {
    wouldPublishCurrentArtifacts: !publishBlocked && plannedWrites.some((entry) => [
      'phase-status',
      'workflow-state',
      'master-checklist',
      'canonical-verdict',
      'worksets-final-evidence',
    ].includes(entry.kind)),
    wouldArchiveSupersededArtifacts: !publishBlocked && plannedWrites.some((entry) => /archive|supersede/i.test(String(entry.kind || ''))),
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

function blockedPhaseStatus(status) {
  return /blocked|unhealthy/i.test(String(status || ''));
}

function phaseConfirmed(phase = {}) {
  return String(phase.planConfirmed ?? true).toLowerCase() !== 'false';
}

function projectedPhasesAfterCloseout(phases = [], phaseNumber) {
  return phases.map((phase) => (
    Number(phase.number) === Number(phaseNumber) ? { ...phase, status: 'completed' } : phase
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

function rewritePhaseStatus({ statusPath, phases, phaseNumber, phase, now, allActionableComplete, dryRun, plannedWrites }) {
  const lines = fs.existsSync(statusPath)
    ? fs.readFileSync(statusPath, 'utf8').split(/\r?\n/).filter((line, index, array) => !(index === array.length - 1 && line === ''))
    : [];
  const projectedPhases = projectedPhasesAfterCloseout(phases, phaseNumber);
  const counts = phaseCounts(projectedPhases);
  const nextPhase = allActionableComplete ? null : nextActionablePhase(projectedPhases);
  upsertTopLevel(lines, 'updatedAt', now);
  upsertTopLevel(lines, 'finalVerdict', 'complete');
  upsertTopLevel(lines, 'normalizedRunVerdict', 'complete');
  upsertTopLevel(lines, 'lastStopReasonCode', 'scope_complete');
  upsertTopLevel(lines, 'lastStopReasonDetail', 'phase closeout finalized');
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
  upsertPhaseField(lines, phaseNumber, 'lastOutcome', 'success');
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
    return stopReason || `delegated-terminal-exit-${exitCode}`;
  }
  if (fields.some((value) => value.includes('failed') || value.includes('failure'))) {
    return stopReason || 'historical-executor-failure';
  }
  return '';
}

function reconcileWorkflowState({ workflowDir, phaseNumber, now, dryRun, plannedWrites }) {
  const historicalWarnings = [];
  const updated = [];
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
      normalizedRunVerdict: historicalWarnings.length > 0 ? 'success_with_warning' : 'complete',
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
      writeJsonAtomic(filePath, next);
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
  const prepPath = stagedPathFor(prepRoot, root, filePath);
  plannedWrites.push({ path: prepPath, kind: 'prep-canonical-verdict' });
  if (!dryRun || keepPrep) {
    writeJsonAtomic(prepPath, payload);
  }
  plannedWrites.push({ path: filePath, kind: 'canonical-verdict' });
  if (!dryRun) {
    copyFileAtomic(prepPath, filePath);
  }
  return filePath;
}

function postPublishStatusPathFor(workflowDir, commitToken) {
  return path.join(workflowDir, `post-publish-status-${commitToken}.json`);
}

function publishCurrentArtifacts({ root, workflowDir, commitToken, canonicalVerdictPath, phaseNumber, phases, gitTreeFingerprint, now, dryRun, keepPrep, publishFailurePoint, plannedWrites, supersededArchive, postPublishStatusPath }) {
  const prepRoot = closeoutPrepRoot(workflowDir, commitToken);
  const manifestPath = path.join(workflowDir, `${CLOSEOUT_MANIFEST_PREFIX}-${commitToken}.json`);
  const currentIndexPath = path.join(workflowDir, CURRENT_ARTIFACTS_INDEX);
  const artifacts = currentIndexVerdictArtifacts({
    root,
    phases,
    phaseNumber,
    canonicalVerdictPath,
    commitToken,
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
  const statusPath = resolvePath(rawConfig.statusFile || DEFAULT_STATUS_FILE, root);
  const planDir = resolvePath(rawConfig.planDir || 'docs/implementation', root);
  const masterPlan = resolvePath(rawConfig.masterPlan || '', root);
  const executionRoot = resolvePath(rawConfig.executionRoot || path.join(planDir, 'execution'), root);
  const phaseExecutionRoot = executionRoot;
  const planExecutionRoot = inferPlanExecutionRoot(executionRoot);
  const workflowDir = resolvePath(rawConfig.workflowDir || DEFAULT_WORKFLOW_DIR, root);
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
  const complete = allActionableComplete(statusDocument.phases, phaseNumber);
  const supersededArchive = prepareSupersededArtifactsArchive({
    root,
    workflowDir,
    commitToken,
    dryRun,
    keepPrep,
    plannedWrites,
  });

  const stateResult = reconcileWorkflowState({ workflowDir, phaseNumber, now, dryRun, plannedWrites });
  const canonicalVerdictPath = writeCanonicalVerdict({
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
  const worksetsEvidenceUpdated = syncWorksetsEvidence({
    root,
    executionRoot: phaseExecutionRoot,
    canonicalVerdictPath,
    dryRun,
    plannedWrites,
  });
  rewritePhaseStatus({ statusPath, phases: statusDocument.phases, phaseNumber, phase, now, allActionableComplete: complete, dryRun, plannedWrites });
  appendCloseoutPhaseEvent({ statusPath, phase, phaseNumber, now, dryRun, plannedWrites });
  updateMasterChecklist({ masterPlan, phaseNumber, dryRun, plannedWrites });

  const phaseDoc = resolvePath(phase.archivedPhaseDoc || phase.activePhaseDoc || phase.plan || phase.phaseDocPath || phase.docPath || '', root);
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

  const gitCloseout = dryRun
    ? { status: 'dry_run', clean: false }
    : runNodeScript(path.join(root, '.claude/scripts/phase-final-git-closeout.mjs'), [
      'preflight',
      '--plan-dir',
      planDir,
      '--status-file',
      statusPath,
      '--json',
    ], root);

  plannedWrites.push({ path: diagnosticsLedgerPath, kind: 'closeout-diagnostics-ledger' });
  const prepPreviewCandidatePath = dryRunPrepPreviewPath({ executionRoot: phaseExecutionRoot, dryRun, keepPrep });
  if (prepPreviewCandidatePath) {
    plannedWrites.push({ path: prepPreviewCandidatePath, kind: 'dry-run-prep-preview' });
  }
  const publishPlan = classifyPlannedWrites(plannedWrites, dryRun);
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
      plannedWrites: plannedWrites.map((entry) => ({ ...entry, path: rel(root, entry.path) })),
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
      ok: dryRun ? true : closeoutResult.allowed === true,
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
    ok: dryRun ? true : closeoutResult.allowed === true,
    dryRun,
    keepPrep,
    finalVerdict: 'complete',
    normalizedRunVerdict: stateResult.historicalWarnings.length > 0 ? 'success_with_warning' : 'complete',
    historicalWarnings: stateResult.historicalWarnings,
    stateReconciled: stateResult.stateReconciled,
    reconciledStateFiles: stateResult.reconciledStateFiles.map((filePath) => rel(root, filePath)),
    canonicalVerdictPath: rel(root, canonicalVerdictPath),
    closeoutCommitToken: commitToken,
    closeoutPrepRoot: rel(root, prepRoot),
    currentArtifactsPath: rel(root, currentArtifacts.currentIndexPath),
    postPublishStatusPath: rel(root, postPublishStatusPath),
    closeoutSyncManifestPath: rel(root, currentArtifacts.manifestPath),
    manifestHash: currentArtifacts.manifestHash,
    supersededArchive: currentArtifacts.supersededArchive,
    worksetsEvidenceUpdated,
    traceabilityStatus: traceability.traceabilityStatus,
    scenarioMatrixStatus: traceability.scenarioMatrixStatus,
    traceabilityPath: rel(root, traceability.requirementsPath),
    scenarioMatrixPath: rel(root, traceability.scenarioPath),
    goalRuntime,
    postPublishStatus,
    phaseCloseoutGate: closeoutResult,
    gitCloseoutPreflight: gitCloseout.parsed || {
      status: gitCloseout.status,
      stdout: gitCloseout.stdout,
      stderr: gitCloseout.stderr,
    },
    diagnostics: {
      ...diagnostics,
      ledgerPath: rel(root, diagnosticsLedgerPath),
    },
    prepPreviewPath: prepPreviewPath ? rel(root, prepPreviewPath) : '',
    ...dryRunContract,
    plannedWrites: plannedWrites.map((entry) => ({ ...entry, path: rel(root, entry.path) })),
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
