import assert from 'node:assert/strict';
import test from 'node:test';

import {
  evaluatePidLiveness,
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
