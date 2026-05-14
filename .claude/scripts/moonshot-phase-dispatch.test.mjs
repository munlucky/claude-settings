import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { recordLifecycleTransition } from './lib/lifecycle-projection-writer.mjs';

const FIXTURE_DIR = path.join('.claude', 'scripts', 'fixtures', 'latest-dispatch-lifecycle');
const ALLOWED_STATUS = new Set([
  'prepared',
  'running',
  'completed',
  'failed',
  'superseded',
  'superseded-by-local-fallback',
]);

test('latest-dispatch lifecycle fixtures keep lifecycle events out of status', () => {
  const requiredEvents = new Set(['preflight_passed', 'dispatch_started', 'dispatch_failed']);
  for (const basename of fs.readdirSync(FIXTURE_DIR).filter((item) => item.endsWith('.json'))) {
    const payload = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, basename), 'utf8'));
    assert.equal(ALLOWED_STATUS.has(payload.status), true, `${basename} status is compatible`);
    assert.notEqual(payload.status, payload.lifecycleEvent, `${basename} keeps lifecycle separate`);
    assert.equal(typeof payload.dispatchStage, 'string', `${basename} records dispatchStage`);
    assert.equal(typeof payload.lastLifecycleEventAt, 'string', `${basename} records transition timestamp`);
    requiredEvents.delete(payload.lifecycleEvent);
  }
  assert.deepEqual([...requiredEvents], []);
});

test('lifecycle writer rejects dispatch lifecycle events used as latest-dispatch status', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'latest-dispatch-lifecycle-'));
  try {
    const target = path.join(root, 'latest-dispatch.json');
    fs.writeFileSync(target, '{}\n', 'utf8');
    assert.throws(() => recordLifecycleTransition({
      source: 'moonshot-phase-dispatch',
      targetStateFiles: [target],
      primaryTargetStateFile: target,
      phaseNumber: 3,
      phaseTitle: 'Phase 03',
      status: 'dispatch_started',
      lifecycleEvent: 'dispatch_started',
      attemptId: 'attempt-3',
      payloadPatch: {
        attemptId: 'attempt-3',
        status: 'dispatch_started',
        lifecycleEvent: 'dispatch_started',
        dispatchStage: 'child_running',
        lastLifecycleEventAt: '2026-05-12T00:01:00Z',
      },
    }), /latest-dispatch\.status must not store lifecycleEvent values/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('dispatcher records preflight, start, heartbeat, and terminal lifecycle payload fields', () => {
  const source = fs.readFileSync('.claude/scripts/moonshot-phase-dispatch.mjs', 'utf8');
  for (const expected of [
    "lifecycleEvent: 'preflight_passed'",
    "lifecycleEvent: 'dispatch_prepared'",
    "lifecycleEvent: 'dispatch_started'",
    "lifecycleEvent: 'dispatch_heartbeat'",
    "'dispatch_completed'",
    "'dispatch_failed'",
  ]) {
    assert.match(source, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(source, /lastLifecycleEventAt/);
  assert.match(source, /dispatchStage/);
  assert.match(source, /LATEST_DISPATCH_STATUS_VALUES/);
});

test('dispatcher gates stale child classification through namespace-aware liveness helper', () => {
  const source = fs.readFileSync('.claude/scripts/moonshot-phase-dispatch.mjs', 'utf8');
  assert.match(source, /evaluatePidLiveness/);
  assert.match(source, /pidNamespace/);
  assert.match(source, /livenessProbe\.degraded/);
  assert.match(source, /stale_child_no_progress/);
});

test('dispatcher preflights stale active lease left by dead dispatcher pid', () => {
  const source = fs.readFileSync('.claude/scripts/moonshot-phase-dispatch.mjs', 'utf8');
  assert.match(source, /function cleanupPreviousDeadDispatchLease/);
  assert.match(source, /isPidAliveInCurrentNamespace\(Number\(existing\.dispatcherPid\)\)/);
  assert.match(source, /phase-run-lease-previous-dead-dispatch-cleanup/);
  assert.match(source, /cleanupPreviousDeadDispatchLease\(\);\s*if \(!runtimeState\.runLeaseId\) \{\s*runtimeState\.runLeaseId = generateRunLeaseId\(\);/s);
});

test('dispatcher exposes and forwards explicit --resume', () => {
  const help = spawnSync(process.execPath, ['.claude/scripts/moonshot-phase-dispatch.mjs', '--help'], {
    encoding: 'utf8',
  });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /--resume\s+Explicitly resume an existing phase run board/);

  const source = fs.readFileSync('.claude/scripts/moonshot-phase-dispatch.mjs', 'utf8');
  assert.match(source, /case '--resume':\s*state\.resume = true;/s);
  assert.match(source, /if \(state\.resume\) \{\s*cmd\.push\('--resume'\);/s);
  assert.match(source, /resume: \$\{state\.resume \? 'true' : 'false'\}/);
  assert.match(source, /function initializeDispatchRunIdentity\(\)/);
  assert.match(source, /readExistingDispatchRunIdentity\(\)/);
  assert.match(source, /resume-state-missing: --resume requires an existing stateRunId/);
  assert.match(source, /initializeDispatchRunIdentity\(\);\s*recordDispatchEvidence/s);
});

test('dispatcher guards latest-dispatch projection identity with stateRunId', () => {
  const source = fs.readFileSync('.claude/scripts/moonshot-phase-dispatch.mjs', 'utf8');
  assert.match(source, /stateRunId: patch\.stateRunId \|\| payload\.stateRunId \|\| runtimeState\.runLeaseId/);
  assert.match(source, /function assertProjectionStateRunId/);
  assert.match(source, /stateRunId mismatch rejected before projection overwrite/);
  assert.match(source, /assertProjectionStateRunId\(payload, next, latestFile\);/);
  assert.match(source, /const WORKFLOW_LOG_DIR = process\.env\.WORKFLOW_ENFORCEMENT_LOG_DIR/);
  assert.match(source, /function workflowLogFile\(basename\)/);
  assert.match(source, /workflowLogFile\('latest-dispatch\.json'\)/);
});
