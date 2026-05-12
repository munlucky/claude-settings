import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluatePidLiveness,
  evaluateWorkerIdentityLiveness,
  pidNamespacesCompatible,
} from './phase-liveness-checker.mjs';

test('namespace compatibility is exact for windows, wsl, and node-parent', () => {
  assert.equal(pidNamespacesCompatible('windows', 'windows'), true);
  assert.equal(pidNamespacesCompatible('wsl', 'wsl'), true);
  assert.equal(pidNamespacesCompatible('node-parent', 'node-parent'), true);
  assert.equal(pidNamespacesCompatible('windows', 'wsl'), false);
  assert.equal(pidNamespacesCompatible('node-parent', 'windows'), false);
});

test('missing namespace returns degraded evidence without stale child classification', () => {
  const result = evaluatePidLiveness({
    pid: 123,
    checkerNamespace: 'windows',
    staleNoProgress: true,
    livenessChecker: () => true,
  });

  assert.equal(result.degraded, true);
  assert.equal(result.reason, 'pid_namespace_missing');
  assert.equal(result.staleChild, false);
});

test('namespace mismatch returns degraded evidence without stale child classification', () => {
  const result = evaluatePidLiveness({
    pid: 123,
    pidNamespace: 'wsl',
    checkerNamespace: 'windows',
    staleNoProgress: true,
    livenessChecker: () => true,
  });

  assert.equal(result.degraded, true);
  assert.equal(result.reason, 'pid_namespace_mismatch');
  assert.equal(result.staleChild, false);
});

test('compatible alive stale child is classified as stale_child_no_progress', () => {
  const result = evaluatePidLiveness({
    pid: 123,
    pidNamespace: 'windows',
    checkerNamespace: 'windows',
    staleNoProgress: true,
    livenessChecker: () => true,
  });

  assert.equal(result.checked, true);
  assert.equal(result.childAlive, true);
  assert.equal(result.reason, 'stale_child_no_progress');
  assert.equal(result.staleChild, true);
});

test('compatible timeout distinguishes exited child from still-running child', () => {
  assert.equal(evaluatePidLiveness({
    pid: 123,
    pidNamespace: 'node-parent',
    checkerNamespace: 'node-parent',
    toolTimedOut: true,
    livenessChecker: () => true,
  }).reason, 'child_still_running');

  assert.equal(evaluatePidLiveness({
    pid: 123,
    pidNamespace: 'node-parent',
    checkerNamespace: 'node-parent',
    toolTimedOut: true,
    livenessChecker: () => false,
  }).reason, 'child_exited_without_closeout');
});

test('pid-reuse-not-worker-active rejects reused PID identity mismatches', () => {
  const manifest = {
    attemptId: 'attempt-original',
    childPid: 4242,
    childProcessStartTime: '2026-05-12T01:00:00.000Z',
    commandHash: 'sha256:command-a',
    manifestRequired: true,
    schemaVersion: 1,
  };
  const heartbeat = {
    attemptId: 'attempt-original',
    childPid: 4242,
    childProcessStartTime: '2026-05-12T01:00:00.000Z',
    commandHash: 'sha256:command-a',
  };

  assert.equal(evaluateWorkerIdentityLiveness({
    manifest,
    heartbeat,
    observedProcess: {
      childPid: 4242,
      childProcessStartTime: '2026-05-12T01:30:00.000Z',
      commandHash: 'sha256:command-a',
    },
  }).classification, 'controller_stale_worker_inactive');

  assert.equal(evaluateWorkerIdentityLiveness({
    manifest,
    heartbeat,
    observedProcess: {
      childPid: 4242,
      childProcessStartTime: '2026-05-12T01:00:00.000Z',
      commandHash: 'sha256:command-b',
    },
  }).classification, 'controller_stale_worker_inactive');

  assert.equal(evaluateWorkerIdentityLiveness({
    manifest,
    heartbeat: { ...heartbeat, attemptId: 'attempt-reused' },
    observedProcess: {
      childPid: 4242,
      childProcessStartTime: '2026-05-12T01:00:00.000Z',
      commandHash: 'sha256:command-a',
    },
  }).classification, 'controller_stale_worker_inactive');
});

test('child-start-time-missing-is-unknown', () => {
  const result = evaluateWorkerIdentityLiveness({
    manifest: {
      attemptId: 'attempt-start-time-unavailable',
      childPid: 4242,
      childProcessStartTime: null,
      commandHash: 'sha256:command-a',
      manifestRequired: true,
      schemaVersion: 1,
    },
    heartbeat: {
      attemptId: 'attempt-start-time-unavailable',
      childPid: 4242,
      commandHash: 'sha256:command-a',
    },
  });

  assert.equal(result.classification, 'worker_liveness_unknown');
  assert.equal(result.workerActive, false);
  assert.equal(result.completionEligible, false);
});

test('controller_stale_worker_active requires manifest and heartbeat identity match', () => {
  const result = evaluateWorkerIdentityLiveness({
    manifest: {
      attemptId: 'attempt-active',
      childPid: 4242,
      childProcessStartTime: '2026-05-12T01:00:00.000Z',
      commandHash: 'sha256:command-a',
      manifestRequired: true,
      schemaVersion: 1,
    },
    heartbeat: {
      attemptId: 'attempt-active',
      childPid: 4242,
      childProcessStartTime: '2026-05-12T01:00:00.000Z',
      commandHash: 'sha256:command-a',
    },
  });

  assert.equal(result.classification, 'controller_stale_worker_active');
  assert.equal(result.workerActive, true);
});
