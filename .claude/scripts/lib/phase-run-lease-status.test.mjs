import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildCompositeMonitorCursor } from './phase-run-lease-status.mjs';
import { sha256RawBytes } from './current-artifacts-state.mjs';

test('composite monitor cursor changes when manifest changes without parent status movement', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-run-lease-status-'));
  try {
    const workflowDir = path.join(root, '.claude/logs/workflow-enforcement');
    const statusFile = path.join(root, '.claude/docs/phase-status.yaml');
    const verdictFile = path.join(root, '.claude/verification-verdict-phase08-final.json');
    const manifestFile = path.join(workflowDir, 'closeout-sync-manifest-phase08.json');
    fs.mkdirSync(path.dirname(statusFile), { recursive: true });
    fs.mkdirSync(path.dirname(verdictFile), { recursive: true });
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.writeFileSync(statusFile, 'phases:\n  - number: 8\n    status: in_progress\n', 'utf8');
    fs.writeFileSync(verdictFile, '{"verdict":"passed"}\n', 'utf8');
    fs.writeFileSync(path.join(workflowDir, 'latest-dispatch.json'), '{"status":"running"}\n', 'utf8');
    fs.writeFileSync(path.join(workflowDir, 'active-phase-run.json'), '{"runLeaseId":"lease-1","status":"active"}\n', 'utf8');
    fs.writeFileSync(path.join(workflowDir, 'current-run.json'), '{"status":"running"}\n', 'utf8');
    fs.writeFileSync(manifestFile, '{"commitToken":"phase08","round":1}\n', 'utf8');
    fs.writeFileSync(path.join(workflowDir, 'current-artifacts.json'), `${JSON.stringify({
      commitToken: 'phase08',
      manifestPath: '.claude/logs/workflow-enforcement/closeout-sync-manifest-phase08.json',
      manifestHash: sha256RawBytes(manifestFile),
      artifacts: {
        'canonical-verdict-phase08': {
          kind: 'canonical-verdict-phase08',
          path: '.claude/verification-verdict-phase08-final.json',
          hash: sha256RawBytes(verdictFile),
          commitToken: 'phase08',
        },
      },
    }, null, 2)}\n`, 'utf8');

    const before = buildCompositeMonitorCursor({ repoRoot: root, statusFile, workflowDir: path.relative(root, workflowDir) });
    fs.writeFileSync(manifestFile, '{"commitToken":"phase08","round":2}\n', 'utf8');
    const after = buildCompositeMonitorCursor({ repoRoot: root, statusFile, workflowDir: path.relative(root, workflowDir) });

    assert.notEqual(after.fingerprint, before.fingerprint);
    assert.equal(after.currentIndex.commitToken, 'phase08');
    assert.equal(after.workflowLogs.length, 3);
    assert.equal(after.activeVerdicts.length, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('lease current-run mirror preserves terminal blocker metadata during active heartbeat', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-run-lease-store-'));
  const previousWorkflowDir = process.env.WORKFLOW_ENFORCEMENT_LOG_DIR;
  try {
    process.env.WORKFLOW_ENFORCEMENT_LOG_DIR = path.join(root, 'workflow');
    const leaseStore = await import(`./phase-run-lease-store.mjs?case=${Date.now()}`);
    const statusFile = path.join(root, '.claude', 'docs', 'phase-status.yaml');
    fs.mkdirSync(path.dirname(statusFile), { recursive: true });
    fs.writeFileSync(statusFile, 'phases:\n  - number: 1\n    status: in_progress\n', 'utf8');

    const { currentRunFile } = leaseStore.resolveLeaseFiles(statusFile);
    fs.mkdirSync(path.dirname(currentRunFile), { recursive: true });
    fs.writeFileSync(currentRunFile, `${JSON.stringify({
      runLeaseId: 'lease-terminal',
      attemptId: 'attempt-terminal',
      status: 'blocked',
      completionStatus: 'blocked',
      attemptOutcome: 'blocked',
      blockingStopReasonCode: 'spawn_eperm',
      stopReasonDetail: 'node --test spawn EPERM',
      blockerEvidenceRef: 'blocker-1',
      transactionId: 'tx-1',
      finalVerdict: 'blocked',
      normalizedRunVerdict: 'complete_with_environment_blocker',
    }, null, 2)}\n`, 'utf8');

    leaseStore.writeActiveLease(statusFile, {
      runLeaseId: 'lease-terminal',
      attemptId: 'attempt-terminal',
      status: 'active',
      completionStatus: 'running',
      currentStage: 'execute',
      phase: { number: 1, title: 'Phase 01' },
      actionablePhasesRemaining: 1,
      blockingStopReasonCode: '',
      stopReasonDetail: '',
    });

    const projected = JSON.parse(fs.readFileSync(currentRunFile, 'utf8'));
    assert.equal(projected.status, 'blocked');
    assert.equal(projected.completionStatus, 'blocked');
    assert.equal(projected.attemptOutcome, 'blocked');
    assert.equal(projected.blockingStopReasonCode, 'spawn_eperm');
    assert.equal(projected.stopReasonDetail, 'node --test spawn EPERM');
    assert.equal(projected.blockerEvidenceRef, 'blocker-1');
    assert.equal(projected.transactionId, 'tx-1');
  } finally {
    if (previousWorkflowDir === undefined) {
      delete process.env.WORKFLOW_ENFORCEMENT_LOG_DIR;
    } else {
      process.env.WORKFLOW_ENFORCEMENT_LOG_DIR = previousWorkflowDir;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
});
