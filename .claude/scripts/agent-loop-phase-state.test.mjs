import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { reconcilePhaseCloseout } from './phase-closeout-reconciler.mjs';

const phaseStateScriptPath = fileURLToPath(new URL('./agent-loop-phase-state.mjs', import.meta.url));

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeFailedProjection(workflowDir) {
  fs.mkdirSync(workflowDir, { recursive: true });
  for (const basename of ['current-run.json', 'active-phase-run.json', 'latest-dispatch.json']) {
    fs.writeFileSync(path.join(workflowDir, basename), JSON.stringify({
      runLeaseId: 'delegated-failed-run',
      status: 'failed',
      completionStatus: 'failed',
      executionMode: 'delegated-terminal',
      stopReasonCode: 'delegated-terminal-exit-1',
      stopReasonDetail: 'worker exited with code 1',
      exitCode: 1,
      phaseRunLease: {
        runLeaseId: 'delegated-failed-run',
        status: 'failed',
        completionStatus: 'failed',
        stopReasonCode: 'delegated-terminal-exit-1',
        stopReasonDetail: 'worker exited with code 1',
      },
    }, null, 2));
  }
}

async function withFixture(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-state-reconciliation-'));
  try {
    const statusFile = path.join(root, '.claude', 'docs', 'phase-status.yaml');
    const executionRoot = path.join(root, 'execution');
    fs.mkdirSync(path.dirname(statusFile), { recursive: true });
    fs.writeFileSync(statusFile, [
      'schemaVersion: "1.0"',
      'phases:',
      '  - number: 4',
      '    status: in_progress',
      '',
    ].join('\n'), 'utf8');
    return await callback({ root, statusFile, executionRoot });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('partial-reconciliation-not-success and next run resumes intent transaction', async () => {
  await withFixture(async ({ root, statusFile, executionRoot }) => {
    const workflowDir = path.join(root, '.claude', 'logs', 'workflow-enforcement');
    writeFailedProjection(workflowDir);
    const previousFailAfterIntent = process.env.PHASE_RECONCILER_TEST_FAIL_AFTER_INTENT;
    process.env.PHASE_RECONCILER_TEST_FAIL_AFTER_INTENT = '1';

    try {
      await assert.rejects(
        () => reconcilePhaseCloseout({
          root,
          statusFile,
          workflowDir,
          executionRoot,
          phaseNumber: 4,
          phaseSlug: '04-reconciliation-transaction-resume-v1',
          fallbackRunId: 'local-fallback-complete-run',
          reason: 'phase-04-test',
          now: '2026-05-13T00:00:00.000Z',
        }),
        /injected failure after reconciliation intent/,
      );
    } finally {
      if (previousFailAfterIntent === undefined) {
        delete process.env.PHASE_RECONCILER_TEST_FAIL_AFTER_INTENT;
      } else {
        process.env.PHASE_RECONCILER_TEST_FAIL_AFTER_INTENT = previousFailAfterIntent;
      }
    }

    const attemptDir = path.join(executionRoot, '04-reconciliation-transaction-resume-v1');
    const intentPath = path.join(attemptDir, 'reconciliation-intent.json');
    const partialPath = path.join(attemptDir, 'reconciliation-partial.json');
    assert.equal(readJson(intentPath).status, 'partial');
    assert.equal(readJson(partialPath).status, 'partial');
    assert.notEqual(readJson(partialPath).status, 'success');

    const transactionId = readJson(intentPath).transactionId;
    writeFailedProjection(workflowDir);
    fs.writeFileSync(path.join(workflowDir, 'local-fallback-complete-run.json'), JSON.stringify({
      runId: 'local-fallback-complete-run',
      status: 'completed',
      completionBoundary: 'phase_only',
    }, null, 2));

    const result = await reconcilePhaseCloseout({
      root,
      statusFile,
      workflowDir,
      executionRoot,
      phaseNumber: 4,
      phaseSlug: '04-reconciliation-transaction-resume-v1',
      fallbackRunId: 'local-fallback-complete-run',
      reason: 'phase-04-test',
      now: '2026-05-13T00:01:00.000Z',
    });

    assert.equal(result.resumed, true);
    assert.equal(result.intentStatus, 'success');
    assert.equal(result.transactionId, transactionId);
    assert.equal(readJson(intentPath).transactionId, transactionId);
    assert.equal(readJson(path.join(attemptDir, 'reconciliation-success.json')).transactionId, transactionId);
    assert.equal(readJson(path.join(workflowDir, 'current-run.json')).transactionId, transactionId);
  });
});

test('completed phase update forces terminal attempt outcome', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-state-terminal-outcome-'));
  try {
    const statusFile = path.join(root, 'phase-status.yaml');
    fs.writeFileSync(statusFile, [
      'schemaVersion: "1.0"',
      'activeExecutionStatus: running',
      'activeCurrentStage: finish/handoff',
      'activePhaseNumber: 3',
      'phases:',
      '  - number: 3',
      '    title: "Phase 03"',
      '    status: in_progress',
      '    planConfirmed: true',
      '    attempts:',
      '      total: 1',
      '      lastOutcome: running',
      '      lastUpdatedAt: "2026-05-14T00:00:00.000Z"',
      '    timing:',
      '      startedAt: "2026-05-14T00:00:00.000Z"',
      '      lastStage: "execute"',
      '      lastStageAt: "2026-05-14T00:00:00.000Z"',
      '',
    ].join('\n'), 'utf8');

    const result = spawnSync(process.execPath, [
      phaseStateScriptPath,
      'update-phase-state',
      statusFile,
      '3',
      'completed',
      '2026-05-14T00:01:00.000Z',
      'running',
      'false',
      '',
      '',
      '',
      '',
      '',
    ], { cwd: root, encoding: 'utf8' });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const text = fs.readFileSync(statusFile, 'utf8');
    assert.match(text, /status:\s+completed/);
    assert.match(text, /lastOutcome:\s+completed/);
    assert.doesNotMatch(text, /lastOutcome:\s+running/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('in-progress phase update moves root active phase pointer', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-state-active-pointer-'));
  try {
    const statusFile = path.join(root, 'phase-status.yaml');
    fs.writeFileSync(statusFile, [
      'schemaVersion: "1.0"',
      'activeExecutionStatus: active',
      'activeCurrentStage: finish/handoff',
      'activePhaseNumber: 2',
      'activePhaseTitle: "Phase 02"',
      'phases:',
      '  - number: 2',
      '    title: "Phase 02"',
      '    status: completed',
      '    planConfirmed: true',
      '    attempts:',
      '      total: 1',
      '      lastOutcome: clean_complete',
      '      lastUpdatedAt: "2026-05-14T00:00:00.000Z"',
      '  - number: 3',
      '    title: "Phase 03"',
      '    status: pending',
      '    planConfirmed: true',
      '    attempts:',
      '      total: 0',
      '      lastOutcome: pending',
      '      lastUpdatedAt: "2026-05-14T00:00:00.000Z"',
      '',
    ].join('\n'), 'utf8');

    const result = spawnSync(process.execPath, [
      phaseStateScriptPath,
      'update-phase-state',
      statusFile,
      '3',
      'in_progress',
      '2026-05-14T00:01:00.000Z',
      'running',
      'false',
      'docs/implementation/03-phase.md',
      '',
      '',
      '',
      '',
    ], { cwd: root, encoding: 'utf8' });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const text = fs.readFileSync(statusFile, 'utf8');
    assert.match(text, /activeExecutionStatus:\s+active/);
    assert.match(text, /activePhaseNumber:\s+3/);
    assert.match(text, /activePhaseTitle:\s+"Phase 03"/);
    assert.match(text, /artifacts:\n  activePhaseDocPath:\s+"docs\/implementation\/03-phase\.md"/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('blocked phase update moves root active pointer away from completed phase', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-state-blocked-pointer-'));
  try {
    const statusFile = path.join(root, 'phase-status.yaml');
    fs.writeFileSync(statusFile, [
      'schemaVersion: "1.0"',
      'activeExecutionStatus: active',
      'activeCurrentStage: finish/handoff',
      'activePhaseNumber: 2',
      'activePhaseTitle: "Phase 02"',
      'phases:',
      '  - number: 2',
      '    title: "Phase 02"',
      '    status: completed',
      '    planConfirmed: true',
      '    attempts:',
      '      total: 1',
      '      lastOutcome: clean_complete',
      '      lastUpdatedAt: "2026-05-14T00:00:00.000Z"',
      '  - number: 3',
      '    title: "Phase 03"',
      '    status: in_progress',
      '    planConfirmed: true',
      '    attempts:',
      '      total: 1',
      '      lastOutcome: running',
      '      lastUpdatedAt: "2026-05-14T00:00:00.000Z"',
      '',
    ].join('\n'), 'utf8');

    const result = spawnSync(process.execPath, [
      phaseStateScriptPath,
      'update-phase-state',
      statusFile,
      '3',
      'blocked',
      '2026-05-14T00:01:00.000Z',
      'blocked',
      'false',
      'docs/implementation/03-phase.md',
      '',
      '',
      '',
      '',
    ], { cwd: root, encoding: 'utf8' });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const text = fs.readFileSync(statusFile, 'utf8');
    assert.match(text, /activeExecutionStatus:\s+paused/);
    assert.match(text, /activePhaseNumber:\s+3/);
    assert.match(text, /activePhaseTitle:\s+"Phase 03"/);
    assert.doesNotMatch(text, /activePhaseNumber:\s+2/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
