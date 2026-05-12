import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { reconcilePhaseCloseout } from './phase-closeout-reconciler.mjs';

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
