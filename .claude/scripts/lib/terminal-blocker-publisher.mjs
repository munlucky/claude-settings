import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { readBlockerSidecarState } from './blocker-sidecar-state.mjs';
import { resolvePhaseExecutionDir } from './phase-execution-paths.mjs';
import { recordLifecycleTransition } from './lifecycle-projection-writer.mjs';
import { resolveRunRoot, withStateTransition } from './simple-run-state.mjs';

const WORKFLOW_LOG_DIR = '.claude/logs/workflow-enforcement';

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function assertNonEmpty(value, field) {
  if (!String(value || '').trim()) {
    throw new TypeError(`terminal blocked publish requires ${field}`);
  }
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function stableId(parts) {
  return crypto.createHash('sha1').update(parts.map((part) => String(part || '')).join('\u0000')).digest('hex').slice(0, 16);
}

function appendJsonlIfMissing(filePath, record, predicate) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const existingLines = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter((line) => line.trim())
    : [];
  const exists = existingLines.some((line) => {
    try {
      return predicate(JSON.parse(line));
    } catch {
      return false;
    }
  });
  if (!exists) {
    fs.appendFileSync(filePath, `${JSON.stringify(record)}\n`, 'utf8');
  }
  return { appended: !exists, count: existingLines.length + (exists ? 0 : 1) };
}

function defaultProjectionFiles() {
  return [
    path.join(WORKFLOW_LOG_DIR, 'active-phase-run.json'),
    path.join(WORKFLOW_LOG_DIR, 'current-run.json'),
    path.join(WORKFLOW_LOG_DIR, 'latest-dispatch.json'),
  ];
}

function fileKind(filePath) {
  const base = path.basename(filePath);
  if (base === 'BLOCKER_EVIDENCE.jsonl') return 'blockerEvidence';
  if (base === 'ATTEMPT_LEDGER.jsonl') return 'attemptLedger';
  if (base === 'projection-manifest.json') return 'projectionManifest';
  return base.replace(/\.[^.]+$/, '');
}

function relativeOrAbsolute(filePath, root = process.cwd()) {
  const relative = path.relative(root, filePath).replace(/\\/g, '/');
  return relative && !relative.startsWith('..') ? relative : filePath.replace(/\\/g, '/');
}

function buildProjectionPayload({
  phaseNumber,
  phaseTitle,
  attemptId,
  transactionId,
  blockerEvidence,
  writtenAt,
}) {
  return {
    status: 'blocked',
    activeExecutionStatus: 'blocked',
    completionStatus: 'blocked',
    attemptOutcome: 'blocked',
    phaseNumber,
    phaseTitle,
    attemptId,
    transactionId,
    lifecycleEvent: 'terminal_blocked_published',
    lastLifecycleEventAt: writtenAt,
    dispatchStage: 'terminal_blocked',
    completionPath: 'terminal-blocker-publisher',
    returnBoundary: 'terminal-blocked',
    stopReasonCode: blockerEvidence.blockerCode,
    rawStopReasonCode: blockerEvidence.blockerCode,
    blockingStopReasonCode: blockerEvidence.blockerCode,
    stopReasonDetail: blockerEvidence.detail || blockerEvidence.stderr || '',
    finalVerdict: 'blocked',
    normalizedRunVerdict: 'complete_with_environment_blocker',
    blockerEvidenceId: blockerEvidence.id,
    lastHeartbeatAt: writtenAt,
    lastLogAt: writtenAt,
    updatedAt: writtenAt,
    blockedAt: writtenAt,
    liveness: {
      childAlive: false,
      degraded: false,
      reason: 'terminal_blocked_published',
      updatedAt: writtenAt,
    },
  };
}

function normalizeBlockerEvidence(input, { attemptId, transactionId, phaseNumber, writtenAt }) {
  const blockerCode = String(input.blockerCode || input.code || 'blocked').trim();
  const id = String(input.id || stableId([attemptId, transactionId, phaseNumber, blockerCode])).trim();
  return {
    id,
    status: 'open',
    phaseNumber,
    attemptId,
    transactionId,
    blockerClass: String(input.blockerClass || 'environment_blocker').trim(),
    blockerCode,
    command: String(input.command || '').trim(),
    exitCode: input.exitCode ?? null,
    stderr: String(input.stderr || '').trim(),
    detail: String(input.detail || input.stderr || blockerCode).trim(),
    runtime: String(input.runtime || '').trim(),
    rerunCommand: String(input.rerunCommand || input.command || '').trim(),
    createdAt: writtenAt,
    updatedAt: writtenAt,
  };
}

function normalizeAttemptLedgerRecord(input, { attemptId, transactionId, parentAttemptId, phaseNumber, writtenAt }) {
  return {
    attemptId,
    parentAttemptId: parentAttemptId || '',
    transactionId,
    phaseNumber,
    status: 'blocked',
    reason: String(input.reason || 'terminal_blocked_published').trim(),
    blockerEvidenceId: input.blockerEvidenceId,
    createdAt: writtenAt,
    updatedAt: writtenAt,
  };
}

function validateInput(input) {
  assertNonEmpty(input.planDir, 'planDir');
  assertNonEmpty(input.executionRoot, 'executionRoot');
  assertNonEmpty(input.phaseNumber, 'phaseNumber');
  assertNonEmpty(input.phaseTitle, 'phaseTitle');
  assertNonEmpty(input.attemptId, 'attemptId');
}

export function publishTerminalBlockedOutcome(input = {}) {
  validateInput(input);

  const writtenAt = input.writtenAt || nowIso();
  const transactionId = String(input.transactionId || stableId([input.attemptId, input.phaseNumber, writtenAt])).trim();
  const attemptId = String(input.attemptId).trim();
  const phaseNumber = Number(input.phaseNumber);
  const phaseTitle = String(input.phaseTitle).trim();
  const resolved = resolvePhaseExecutionDir({
    planDir: input.planDir,
    executionRoot: input.executionRoot,
    phaseNumber,
    phaseSlug: input.phaseSlug,
    phaseDoc: input.phaseDoc,
  });
  const sidecarPaths = input.sidecarPaths || resolved.sidecarPaths;
  const projectionFiles = input.projectionFiles || defaultProjectionFiles();
  const stateRunId = String(input.stateRunId || stableId([attemptId, phaseNumber, 'terminal-blocked'])).trim();
  const runRoot = input.runRoot || resolveRunRoot(stateRunId, { rootDir: input.rootDir || process.cwd() });
  const stateOptions = {
    rootDir: input.rootDir || process.cwd(),
    stateRunId,
    runRoot,
    planDir: input.planDir,
    statusFile: input.statusFile || '.claude/docs/phase-status.yaml',
    phase: String(phaseNumber),
    attempt: attemptId,
    owner: input.owner || 'codex',
    reason: input.reason || input.blockerEvidence?.blockerCode || input.blockerCode || 'blocked',
    updated: writtenAt,
    committedAt: writtenAt,
  };
  const blockerEvidence = normalizeBlockerEvidence(input.blockerEvidence || input, {
    attemptId,
    transactionId,
    phaseNumber,
    writtenAt,
  });
  const attemptLedgerRecord = normalizeAttemptLedgerRecord({
    ...(input.attemptLedger || {}),
    blockerEvidenceId: blockerEvidence.id,
  }, {
    attemptId,
    parentAttemptId: input.parentAttemptId || input.attemptLedger?.parentAttemptId || '',
    transactionId,
    phaseNumber,
    writtenAt,
  });

  const transition = withStateTransition({
    stateRunId,
    transitionId: transactionId,
    status: 'blocked',
    phase: String(phaseNumber),
    attempt: attemptId,
    owner: stateOptions.owner,
    reason: blockerEvidence.blockerCode,
    planDir: input.planDir,
    statusFile: stateOptions.statusFile,
    runRoot,
    updated: writtenAt,
  }, stateOptions, () => {
    const blockerAppend = appendJsonlIfMissing(
      sidecarPaths.blockerEvidencePath,
      blockerEvidence,
      (record) => record.id === blockerEvidence.id,
    );
    const attemptAppend = appendJsonlIfMissing(
      sidecarPaths.attemptLedgerPath,
      attemptLedgerRecord,
      (record) => record.attemptId === attemptId && record.transactionId === transactionId,
    );

    const projectionPayload = buildProjectionPayload({
      phaseNumber,
      phaseTitle,
      attemptId,
      transactionId,
      blockerEvidence,
      writtenAt,
    });
    for (const targetFile of projectionFiles) {
      recordLifecycleTransition({
        source: 'terminal-blocker-publisher',
        targetStateFiles: [targetFile],
        primaryTargetStateFile: targetFile,
        phaseNumber,
        phaseTitle,
        status: 'blocked',
        completionStatus: 'blocked',
        lifecycleEvent: 'terminal_blocked_published',
        attemptId,
        timestamp: writtenAt,
        payloadPatch: projectionPayload,
        writeMode: 'merge',
      });
    }

    const sidecarState = readBlockerSidecarState(sidecarPaths);
    const manifest = {
      schemaVersion: 'terminal-blocker-projection-manifest-v1',
      transactionId,
      attemptId,
      phaseNumber,
      phaseTitle,
      writtenAt,
      terminalOutcome: 'blocked',
      blockerEvidenceIds: [blockerEvidence.id],
      attemptLedgerKeys: [`${attemptId}:${transactionId}`],
      sidecarMode: sidecarState.mode,
      sidecarDiagnostics: sidecarState.diagnostics,
      files: [
        sidecarPaths.blockerEvidencePath,
        sidecarPaths.attemptLedgerPath,
        ...projectionFiles,
      ].filter((filePath) => fs.existsSync(filePath)).map((filePath) => ({
        path: relativeOrAbsolute(filePath),
        kind: fileKind(filePath),
        sha256: sha256File(filePath),
      })),
    };
    fs.mkdirSync(path.dirname(sidecarPaths.projectionManifestPath), { recursive: true });
    fs.writeFileSync(sidecarPaths.projectionManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

    return {
      blockerAppend,
      attemptAppend,
      manifest,
    };
  });

  return {
    transactionId,
    attemptId,
    phaseNumber,
    blockerEvidenceId: blockerEvidence.id,
    blockerAppend: transition.projectionResult.blockerAppend,
    attemptAppend: transition.projectionResult.attemptAppend,
    manifestPath: sidecarPaths.projectionManifestPath,
    projectionFiles,
    manifest: transition.projectionResult.manifest,
    statePath: transition.statePath,
    stateRunId,
    transitionId: transition.transitionId,
  };
}
