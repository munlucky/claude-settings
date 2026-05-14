import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { publishTerminalBlockedOutcome } from './terminal-blocker-publisher.mjs';
import { readState } from './simple-run-state.mjs';

function withTempDir(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-blocker-publisher-'));
  try {
    callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function jsonlRecords(filePath) {
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

function baseInput(root) {
  const planDir = path.join(root, 'docs', 'implementation', 'plan');
  const executionRoot = path.join(planDir, 'execution', 'run-v1');
  const phaseDir = path.join(executionRoot, '04-terminal-blocker-publisher-v1');
  fs.mkdirSync(phaseDir, { recursive: true });
  return {
    planDir,
    executionRoot,
    phaseNumber: 4,
    phaseSlug: 'terminal-blocker-publisher-v1',
    phaseTitle: 'Phase 04',
    attemptId: 'attempt-04',
    transactionId: 'tx-04',
    writtenAt: '2026-05-12T09:00:00Z',
    rootDir: root,
    stateRunId: 'state-run-04',
    projectionFiles: [
      path.join(root, 'active-phase-run.json'),
      path.join(root, 'current-run.json'),
      path.join(root, 'latest-dispatch.json'),
    ],
    blockerEvidence: {
      id: 'blocker-04',
      blockerClass: 'verification_environment_unavailable',
      blockerCode: 'spawn_eperm',
      command: 'node --test example.test.mjs',
      stderr: 'spawn EPERM',
      runtime: 'codex',
    },
  };
}

test('terminal blocked publisher is idempotent for sidecar appends', () => {
  withTempDir((root) => {
    const input = baseInput(root);
    const first = publishTerminalBlockedOutcome(input);
    const second = publishTerminalBlockedOutcome(input);

    assert.equal(first.blockerAppend.appended, true);
    assert.equal(second.blockerAppend.appended, false);
    assert.equal(first.attemptAppend.appended, true);
    assert.equal(second.attemptAppend.appended, false);

    const blockerRecords = jsonlRecords(path.join(
      input.executionRoot,
      '04-terminal-blocker-publisher-v1',
      'BLOCKER_EVIDENCE.jsonl',
    ));
    const attemptRecords = jsonlRecords(path.join(
      input.executionRoot,
      '04-terminal-blocker-publisher-v1',
      'ATTEMPT_LEDGER.jsonl',
    ));

    assert.equal(blockerRecords.length, 1);
    assert.equal(blockerRecords[0].id, 'blocker-04');
    assert.equal(attemptRecords.length, 1);
    assert.equal(attemptRecords[0].attemptId, 'attempt-04');
    assert.equal(attemptRecords[0].transactionId, 'tx-04');
  });
});

test('terminal blocked publisher leaves pending state when projection write fails', () => {
  withTempDir((root) => {
    const input = baseInput(root);
    const unwritableProjection = input.projectionFiles[0];
    fs.mkdirSync(unwritableProjection, { recursive: true });

    assert.throws(
      () => publishTerminalBlockedOutcome(input),
      /EISDIR|illegal operation/,
    );

    const recovered = readState({
      rootDir: input.rootDir,
      stateRunId: input.stateRunId,
    });
    assert.equal(recovered.exists, true);
    assert.equal(recovered.state.status, 'blocked');
    assert.equal(recovered.state.transitionId, 'tx-04');
    assert.equal(recovered.state.projectionStatus, 'pending');
    assert.equal(recovered.startupClassification, 'incomplete_transaction');
  });
});

test('terminal blocked publisher writes manifest and canonical lifecycle projections', () => {
  withTempDir((root) => {
    const input = baseInput(root);
    const result = publishTerminalBlockedOutcome(input);
    const manifest = readJson(result.manifestPath);

    assert.equal(manifest.transactionId, 'tx-04');
    assert.equal(manifest.attemptId, 'attempt-04');
    assert.equal(manifest.phaseNumber, 4);
    assert.equal(manifest.terminalOutcome, 'blocked');
    assert.deepEqual(manifest.blockerEvidenceIds, ['blocker-04']);
    assert.deepEqual(manifest.attemptLedgerKeys, ['attempt-04:tx-04']);
    assert.equal(manifest.files.length, 5);
    assert.equal(manifest.files.every((entry) => /^[a-f0-9]{64}$/.test(entry.sha256)), true);

    for (const projectionFile of input.projectionFiles) {
      const projection = readJson(projectionFile);
      assert.equal(projection.lifecycleEvent, 'terminal_blocked_published');
      assert.notEqual(projection.lifecycleEvent, 'lease_blocked');
      assert.equal(projection.activeExecutionStatus, 'blocked');
      assert.equal(projection.attemptId, 'attempt-04');
      assert.equal(projection.transactionId, 'tx-04');
      assert.equal(projection.completionStatus, 'blocked');
      assert.equal(projection.blockingStopReasonCode, 'spawn_eperm');
      assert.equal(projection.liveness.childAlive, false);
      assert.equal(projection.liveness.reason, 'terminal_blocked_published');
    }
  });
});

test('terminal blocked publisher clears stale running liveness during merge', () => {
  withTempDir((root) => {
    const input = baseInput(root);
    for (const projectionFile of input.projectionFiles) {
      fs.writeFileSync(projectionFile, JSON.stringify({
        status: 'running',
        activeExecutionStatus: 'running',
        dispatchStage: 'child_running',
        childPid: 1234,
        liveness: {
          childAlive: true,
          reason: 'progress_observed',
        },
      }, null, 2), 'utf8');
    }

    publishTerminalBlockedOutcome(input);

    for (const projectionFile of input.projectionFiles) {
      const projection = readJson(projectionFile);
      assert.equal(projection.status, 'blocked');
      assert.equal(projection.activeExecutionStatus, 'blocked');
      assert.equal(projection.dispatchStage, 'terminal_blocked');
      assert.equal(projection.liveness.childAlive, false);
      assert.equal(projection.liveness.reason, 'terminal_blocked_published');
    }
  });
});
