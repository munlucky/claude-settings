import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { recordLifecycleTransition, validateLifecycleTransition } from './lifecycle-projection-writer.mjs';

test('validates required lifecycle event fields', () => {
  assert.throws(() => validateLifecycleTransition({}), /source/);
  assert.throws(() => validateLifecycleTransition(baseEvent({ targetStateFiles: [] })), /targetStateFiles/);
  assert.throws(() => validateLifecycleTransition(baseEvent({ phaseNumber: 'abc' })), /phaseNumber/);
  assert.throws(() => validateLifecycleTransition(baseEvent({ lifecycleEvent: 'lease_completed', completionStatus: '' })), /completionStatus/);
  assert.throws(() => validateLifecycleTransition(baseEvent({
    pidNamespace: '',
    payloadPatch: { dispatcherPid: 1234 },
  })), /pidNamespace/);
  assert.throws(() => validateLifecycleTransition(baseEvent({
    lifecycleEvent: 'dispatch_heartbeat',
  })), /attemptId/);
  assert.throws(() => validateLifecycleTransition(baseEvent({
    lifecycleEvent: 'dispatch_blocked',
    completionStatus: 'blocked',
    attemptId: 'attempt-1',
  })), /terminal_blocked_published/);
});

test('does not require pidNamespace for empty pid placeholders', () => {
  assert.doesNotThrow(() => validateLifecycleTransition(baseEvent({
    payloadPatch: { dispatcherPid: '', status: 'active' },
  })));
});

test('records merge lifecycle patch atomically', () => {
  withTempDir((root) => {
    const target = path.join(root, 'latest-dispatch.json');
    fs.writeFileSync(target, JSON.stringify({ status: 'prepared', keep: true }, null, 2) + '\n', 'utf8');

    const result = recordLifecycleTransition(baseEvent({
      primaryTargetStateFile: target,
      targetStateFiles: [target],
      source: 'moonshot-phase-dispatch',
      lifecycleEvent: 'dispatch_heartbeat',
      attemptId: 'attempt-1',
      payloadPatch: { childPid: 1234, status: 'prepared' },
      pidNamespace: 'node-parent',
    }));

    assert.deepEqual(result.written, [target]);
    assert.deepEqual(readJson(target), {
      status: 'prepared',
      keep: true,
      childPid: 1234,
    });
  });
});

test('records replace lifecycle payload for legacy projection compatibility', () => {
  withTempDir((root) => {
    const target = path.join(root, 'active-phase-run.json');
    fs.writeFileSync(target, JSON.stringify({ stale: true }, null, 2) + '\n', 'utf8');

    recordLifecycleTransition(baseEvent({
      primaryTargetStateFile: target,
      targetStateFiles: [target],
      source: 'phase-run-lease-store',
      lifecycleEvent: 'lease_started',
      status: 'active',
      payloadPatch: { runLeaseId: 'lease-1', status: 'active' },
      writeMode: 'replace',
    }));

    assert.deepEqual(readJson(target), {
      runLeaseId: 'lease-1',
      status: 'active',
    });
  });
});

test('records caller event fixtures for phase lifecycle projections', () => {
  withTempDir((root) => {
    const activeRun = path.join(root, 'active-phase-run.json');
    const currentRun = path.join(root, 'current-run.json');
    const latestDispatch = path.join(root, 'latest-dispatch.json');
    const phaseStatus = path.join(root, 'phase-status.json');
    const reconciled = path.join(root, 'reconciled-workflow.json');

    recordLifecycleTransition(baseEvent({
      source: 'phase-run-lease-store',
      primaryTargetStateFile: activeRun,
      targetStateFiles: [activeRun, currentRun],
      lifecycleEvent: 'lease_heartbeat',
      payloadPatch: { status: 'active', runLeaseId: 'lease-1' },
      targetPayloads: {
        [activeRun]: { status: 'active', runLeaseId: 'lease-1' },
        [currentRun]: { status: 'active', activePhaseNumber: 1 },
      },
      writeMode: 'replace',
    }));
    recordLifecycleTransition(baseEvent({
      source: 'moonshot-phase-dispatch',
      primaryTargetStateFile: latestDispatch,
      targetStateFiles: [latestDispatch],
      lifecycleEvent: 'dispatch_completed',
      attemptId: 'attempt-1',
      status: 'completed',
      completionStatus: 'completed',
      payloadPatch: { status: 'completed', completionStatus: 'completed' },
      writeMode: 'replace',
    }));
    recordLifecycleTransition(baseEvent({
      source: 'phase-closeout-finalize',
      primaryTargetStateFile: currentRun,
      targetStateFiles: [phaseStatus, currentRun, activeRun, latestDispatch],
      lifecycleEvent: 'closeout_completed',
      status: 'completed',
      completionStatus: 'completed',
      payloadPatch: { status: 'completed', completionStatus: 'completed' },
      writeMode: 'replace',
    }));
    recordLifecycleTransition(baseEvent({
      source: 'reconciler/local fallback',
      primaryTargetStateFile: reconciled,
      targetStateFiles: [reconciled, phaseStatus],
      lifecycleEvent: 'fallback_completed',
      status: 'completed',
      completionStatus: 'completed',
      payloadPatch: { status: 'completed', recoveryStatus: 'recovered' },
      writeMode: 'replace',
    }));

    assert.equal(readJson(activeRun).status, 'completed');
    assert.equal(readJson(currentRun).completionStatus, 'completed');
    assert.equal(readJson(latestDispatch).status, 'completed');
    assert.equal(readJson(phaseStatus).status, 'completed');
    assert.equal(readJson(reconciled).recoveryStatus, 'recovered');
  });
});

test('rejects lifecycle event values in latest dispatch status', () => {
  withTempDir((root) => {
    const latestDispatch = path.join(root, 'latest-dispatch.json');

    assert.throws(() => recordLifecycleTransition(baseEvent({
      source: 'moonshot-phase-dispatch',
      primaryTargetStateFile: latestDispatch,
      targetStateFiles: [latestDispatch],
      lifecycleEvent: 'dispatch_completed',
      attemptId: 'attempt-1',
      status: 'dispatch_completed',
      completionStatus: 'completed',
      payloadPatch: { status: 'dispatch_completed' },
      writeMode: 'replace',
    })), /latest-dispatch\.status/);
  });
});

test('preserves terminal attempt fields from same-attempt heartbeat patches', () => {
  withTempDir((root) => {
    const target = path.join(root, 'latest-dispatch.json');
    fs.writeFileSync(target, JSON.stringify({
      attemptId: 'attempt-1',
      status: 'blocked',
      completionStatus: 'blocked',
      attemptOutcome: 'blocked',
      blockingStopReasonCode: 'spawn_eperm',
      stopReasonDetail: 'node --test spawn EPERM',
      finalVerdict: 'blocked',
      normalizedRunVerdict: 'complete_with_environment_blocker',
    }, null, 2) + '\n', 'utf8');

    recordLifecycleTransition(baseEvent({
      source: 'moonshot-phase-dispatch',
      primaryTargetStateFile: target,
      targetStateFiles: [target],
      lifecycleEvent: 'dispatch_heartbeat',
      attemptId: 'attempt-1',
      status: 'running',
      payloadPatch: {
        attemptId: 'attempt-1',
        status: 'running',
        completionStatus: 'running',
        attemptOutcome: 'running',
        blockingStopReasonCode: '',
        stopReasonDetail: '',
      },
      writeMode: 'merge',
    }));

    assert.deepEqual(readJson(target), {
      attemptId: 'attempt-1',
      status: 'running',
      completionStatus: 'blocked',
      attemptOutcome: 'blocked',
      blockingStopReasonCode: 'spawn_eperm',
      stopReasonDetail: 'node --test spawn EPERM',
      finalVerdict: 'blocked',
      normalizedRunVerdict: 'complete_with_environment_blocker',
    });
  });
});

function baseEvent(overrides = {}) {
  return {
    source: 'phase-run-lease-store',
    targetStateFiles: ['state.json'],
    primaryTargetStateFile: 'state.json',
    phaseNumber: 1,
    phaseTitle: 'Phase 01',
    status: 'active',
    lifecycleEvent: 'lease_started',
    timestamp: '2026-05-12T00:00:00.000Z',
    payloadPatch: { status: 'active' },
    ...overrides,
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function withTempDir(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lifecycle-projection-writer-'));
  try {
    callback(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
