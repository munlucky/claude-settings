import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  PHASE_ATTEMPT_MANIFEST_SCHEMA_VERSION,
  appendAttemptHeartbeatEvent,
  isAttemptManifestEnforced,
  patchAttemptManifestChildIdentity,
  patchAttemptManifestExit,
  patchAttemptManifestFinalizerSeal,
  readAttemptManifest,
  resolvePhaseAttemptManifestPaths,
  validateAttemptManifest,
  writeAttemptManifestIntent,
} from './phase-attempt-manifest.mjs';

function tempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'phase-attempt-manifest-'));
}

function intentInput(root, attemptId = 'attempt-test') {
  return {
    executionRoot: root,
    phaseNumber: '1',
    phaseSlug: '01-attempt-manifest-contract',
    attemptId,
    runnerStartedAt: '2026-05-12T00:00:00.000Z',
    promptHash: 'sha256:prompt',
    commandHash: 'sha256:command',
    runnerLogPath: '.claude/logs/agent-loop/phase-1.log',
  };
}

test('manifest-created-before-spawn', () => {
  const root = tempRoot();
  const input = intentInput(root);
  const paths = writeAttemptManifestIntent(input);
  const spawnObservedManifest = fs.existsSync(paths.manifestPath);

  assert.equal(PHASE_ATTEMPT_MANIFEST_SCHEMA_VERSION, 1);
  assert.equal(spawnObservedManifest, true);
  const read = readAttemptManifest(paths.manifestPath);
  assert.equal(read.ok, true);
  assert.equal(read.manifest.attemptId, input.attemptId);
  assert.equal(read.manifest.schemaVersion, 1);
  assert.equal(read.manifest.manifestRequired, true);
  assert.equal(read.manifest.childPid, undefined);
});

test('manifest enforcement is enabled by flag or schema version', () => {
  assert.equal(isAttemptManifestEnforced({ manifestRequired: true }), true);
  assert.equal(isAttemptManifestEnforced({ schemaVersion: 1 }), true);
  assert.equal(isAttemptManifestEnforced({ manifestRequired: false, schemaVersion: 0 }), false);
});

test('child-start-time-missing-is-unknown', () => {
  const root = tempRoot();
  const paths = writeAttemptManifestIntent(intentInput(root));
  patchAttemptManifestChildIdentity({
    manifestPath: paths.manifestPath,
    childPid: 1234,
    childProcessStartTime: null,
  });

  const validation = validateAttemptManifest(paths.manifestPath);
  assert.equal(validation.ok, false);
  assert.equal(validation.reason, 'worker_liveness_unknown');
});

test('missing child pid keeps the manifest incomplete', () => {
  const root = tempRoot();
  const paths = writeAttemptManifestIntent(intentInput(root));
  patchAttemptManifestChildIdentity({
    manifestPath: paths.manifestPath,
    childPid: null,
    childProcessStartTime: '2026-05-12T00:00:01.000Z',
  });

  const validation = validateAttemptManifest(paths.manifestPath);
  assert.equal(validation.ok, false);
  assert.equal(validation.reason, 'incomplete_attempt_manifest');
});

test('exit patch fields are present and immutable patch groups are rejected', () => {
  const root = tempRoot();
  const paths = writeAttemptManifestIntent(intentInput(root));
  patchAttemptManifestChildIdentity({
    manifestPath: paths.manifestPath,
    childPid: 1234,
    childProcessStartTime: '2026-05-12T00:00:01.000Z',
  });
  patchAttemptManifestExit({
    manifestPath: paths.manifestPath,
    runnerFinishedAt: '2026-05-12T00:00:03.000Z',
    runnerExitCode: 0,
  });

  const validation = validateAttemptManifest(paths.manifestPath);
  assert.equal(validation.ok, true);
  assert.equal(validation.manifest.runnerExitCode, 0);
  assert.throws(() => patchAttemptManifestExit({
    manifestPath: paths.manifestPath,
    runnerFinishedAt: '2026-05-12T00:00:04.000Z',
    runnerExitCode: 1,
  }), /attempt_manifest_field_immutable:runnerFinishedAt/);
});

test('finalizer seal fields are supported when downstream requires them', () => {
  const root = tempRoot();
  const paths = writeAttemptManifestIntent(intentInput(root));
  patchAttemptManifestChildIdentity({
    manifestPath: paths.manifestPath,
    childPid: 1234,
    childProcessStartTime: '2026-05-12T00:00:01.000Z',
  });
  patchAttemptManifestExit({
    manifestPath: paths.manifestPath,
    runnerFinishedAt: '2026-05-12T00:00:03.000Z',
    runnerExitCode: 0,
  });

  assert.equal(validateAttemptManifest(paths.manifestPath, { requireFinalizerSeal: true }).reason, 'incomplete_attempt_manifest');
  patchAttemptManifestFinalizerSeal({
    manifestPath: paths.manifestPath,
    completionTransactionId: 'completion-1',
    finalizerTransactionId: 'finalizer-1',
    verificationVerdictPath: '.claude/verification-verdict-phase01-final.json',
    completionGateVerdict: 'passed',
  });
  assert.equal(validateAttemptManifest(paths.manifestPath, { requireFinalizerSeal: true }).ok, true);
});

test('heartbeat events include attemptId and use resolver-owned path', () => {
  const root = tempRoot();
  const input = intentInput(root);
  const paths = resolvePhaseAttemptManifestPaths(input);
  appendAttemptHeartbeatEvent({
    ...input,
    eventType: 'start',
    payload: { stage: 'ready/isolate' },
  });

  const [line] = fs.readFileSync(paths.heartbeatPath, 'utf8').trim().split(/\r?\n/);
  const event = JSON.parse(line);
  assert.equal(event.attemptId, input.attemptId);
  assert.equal(event.eventType, 'start');
});
