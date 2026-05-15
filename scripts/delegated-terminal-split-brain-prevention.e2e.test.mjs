import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { evaluateCompletionGateVerdict, evaluateDeclaredAlternateVerifierPolicy } from './lib/phase-closeout-verdict.mjs';
import { evaluateWorkerIdentityLiveness } from './lib/phase-liveness-checker.mjs';
import { validateAttemptManifest, writeAttemptManifestIntent } from './lib/phase-attempt-manifest.mjs';

const FIXTURE_PATH = 'tests/fixtures/scripts/delegated-terminal-split-brain-prevention/v4-scenarios.json';

function fixtureRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'delegated-terminal-split-brain-'));
}

function readFixture() {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
}

test('v4 fixture inventory covers every named scenario', () => {
  assert.deepEqual(readFixture().scenarios, [
    'manifest-created-before-spawn',
    'manifest-intent-without-exit-is-incomplete',
    'runner-log-without-manifest-rejected',
    'phase-status-only-completion-rejected',
    'delegated-loop-cannot-adopt-orphan',
    'partial-reconciliation-not-success',
    'pid-reuse-not-worker-active',
    'child-start-time-missing-is-unknown',
    'alternate-verifier-undeclared-rejected',
    'legacy-grandfathered-by-cutoff',
  ]);
});

test('manifest-created-before-spawn and intent without exit remain incomplete', () => {
  const root = fixtureRoot();
  try {
    const intent = writeAttemptManifestIntent({
      executionRoot: root,
      phaseNumber: 7,
      phaseSlug: '07-manifest-event-telemetry-fixtures-v1',
      attemptId: 'attempt-v4',
      runnerStartedAt: '2026-05-12T00:00:00.000Z',
      promptHash: 'sha256:prompt',
      commandHash: 'sha256:command',
      runnerLogPath: '.claude/logs/agent-loop/phase-7.log',
    });

    assert.equal(fs.existsSync(intent.manifestPath), true);
    assert.equal(validateAttemptManifest(intent.manifestPath).reason, 'incomplete_attempt_manifest');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('projection-only completion states after enforcement are rejected', () => {
  const phase = { status: 'completed', completionGateMode: 'attempt_manifest_required' };

  assert.equal(evaluateCompletionGateVerdict({ phaseNumber: 7, phase }).reason, 'orphan_projection_completion');
  assert.equal(evaluateCompletionGateVerdict({ phaseNumber: 7, phase: { ...phase, runnerLogPath: '.claude/logs/agent-loop/phase-7.log' } }).reason, 'orphan_projection_completion');
  assert.equal(evaluateCompletionGateVerdict({ phaseNumber: 7, phase: { ...phase, completionStatus: 'direct-pass' } }).reason, 'orphan_projection_completion');
});

test('legacy-grandfathered-by-cutoff is explicit and bounded', () => {
  const legacy = evaluateCompletionGateVerdict({
    phaseNumber: 1,
    phase: { status: 'completed' },
  });
  const postEnforcement = evaluateCompletionGateVerdict({
    phaseNumber: 1,
    phase: { status: 'completed', manifestRequired: true },
  });
  const schemaVersioned = evaluateCompletionGateVerdict({
    phaseNumber: 1,
    phase: { status: 'completed', schemaVersion: 1 },
  });

  assert.equal(legacy.ok, true);
  assert.equal(legacy.reason, readFixture().reasonCodes['legacy-grandfathered-by-cutoff']);
  assert.equal(postEnforcement.ok, false);
  assert.equal(postEnforcement.reason, readFixture().reasonCodes['post-enforcement-projection-only']);
  assert.equal(schemaVersioned.ok, false);
  assert.equal(schemaVersioned.reason, readFixture().reasonCodes['post-enforcement-projection-only']);
});

test('delegated-loop-cannot-adopt-orphan rejects automatic orphan adoption CLIs', () => {
  const autoReconcile = spawnSync(process.execPath, [
    '.claude/scripts/phase-closeout-reconciler.mjs',
    '--mode',
    'auto',
    '--adopt-orphan',
  ], { encoding: 'utf8' });

  assert.notEqual(autoReconcile.status, 0);
  assert.match(autoReconcile.stderr, /delegated_loop_cannot_adopt_orphan/);
});

test('partial-reconciliation-not-success records partial markers without success', () => {
  const root = fixtureRoot();
  try {
    const workflowDir = path.join(root, '.claude/logs/workflow-enforcement');
    fs.mkdirSync(workflowDir, { recursive: true });
    for (const basename of ['current-run.json', 'active-phase-run.json', 'latest-dispatch.json']) {
      fs.writeFileSync(path.join(workflowDir, basename), JSON.stringify({
        runLeaseId: 'delegated-failed-run',
        status: 'failed',
        completionStatus: 'failed',
        executionMode: 'delegated-terminal',
        failureClass: 'delegated_terminal_failed',
        stopReasonCode: 'delegated-terminal-exit-1',
      }, null, 2), 'utf8');
    }

    const result = spawnSync(process.execPath, [
      '.claude/scripts/phase-closeout-reconciler.mjs',
      '--root',
      root,
      '--workflow-dir',
      workflowDir,
      '--fallback-run-id',
      'fallback-partial',
      '--now',
      '2026-05-12T00:00:00.000Z',
    ], {
      encoding: 'utf8',
      env: { ...process.env, PHASE_RECONCILER_TEST_FAIL_AFTER_INTENT: '1' },
    });

    const partialPath = path.join(workflowDir, 'reconciliation-partial.json');
    const successPath = path.join(workflowDir, 'reconciliation-success.json');
    assert.notEqual(result.status, 0);
    assert.equal(fs.existsSync(partialPath), true);
    assert.equal(fs.existsSync(successPath), false);
    assert.equal(JSON.parse(fs.readFileSync(partialPath, 'utf8')).status, 'partial');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pid-reuse-not-worker-active and child-start-time-missing-is-unknown are non-completion states', () => {
  const manifest = {
    attemptId: 'attempt-original',
    childPid: 4242,
    childProcessStartTime: '2026-05-12T01:00:00.000Z',
    commandHash: 'sha256:command-a',
    manifestRequired: true,
    schemaVersion: 1,
  };

  assert.equal(evaluateWorkerIdentityLiveness({
    manifest,
    heartbeat: manifest,
    observedProcess: { ...manifest, childProcessStartTime: '2026-05-12T01:30:00.000Z' },
  }).classification, 'controller_stale_worker_inactive');

  assert.equal(evaluateWorkerIdentityLiveness({
    manifest: { ...manifest, childProcessStartTime: null },
    heartbeat: { ...manifest, childProcessStartTime: null },
  }).classification, 'worker_liveness_unknown');
});

test('alternate-verifier-undeclared-rejected keeps alternate evidence supporting-only', () => {
  const policy = evaluateDeclaredAlternateVerifierPolicy({
    verdict: 'expected_blocker_passed',
    evidenceFresh: true,
    blocking: false,
    score: { verdict: 'done' },
    verifierPolicy: {
      requiredVerifier: {
        id: 'phase-closeout',
        errorCode: 'EPERM',
        failureClass: 'verification_environment_unavailable',
      },
      alternateVerifier: {
        id: 'manual-node-test',
        requiredVerifierId: 'phase-closeout',
        status: 'passed',
        declared: false,
      },
    },
  });

  assert.equal(policy.allowed, false);
  assert.equal(policy.reason, 'alternate_verifier_undeclared');
});
