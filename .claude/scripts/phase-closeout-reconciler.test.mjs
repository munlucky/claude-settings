import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('reconciler detects all six synthetic phase closeout drift defects', async () => {
  await withCloseoutDriftFixture(async (fixture) => {
    const { reconcilePhaseCloseout } = await import('./phase-closeout-reconciler.mjs');
    const result = await reconcilePhaseCloseout({
      root: fixture.root,
      statusFile: fixture.statusFile,
      workflowDir: fixture.workflowDir,
      sessionLog: fixture.sessionLog,
      now: fixture.fixedNow,
    });

    assert.equal(result.normalizedRunVerdict, 'blocked_by_closeout_drift');
    assert.equal(result.completionBoundary, 'phase_only');
    assert.equal(result.fallbackRunId, 'local-fallback-complete-run');
    assert.equal(result.supersededRunLeaseId, 'delegated-failed-run');
    assert.ok(result.supersededAt);

    assertDefect(result, 'delegated_failed_local_fallback_completed');
    assertDefect(result, 'current_run_failed_phase_status_completed');
    assertDefect(result, 'completed_status_stale_active_run_lease');
    assertDefect(result, 'future_timestamp_after_injected_now');
    assertDefect(result, 'session_task_complete_workflow_failed');
    assertDefect(result, 'environment_blocked_smoke_plan_complete');
  });
});

function assertDefect(result, code) {
  assert.ok(
    result.defects?.some((defect) => defect.code === code),
    `expected reconciler defect ${code}`
  );
}

async function withCloseoutDriftFixture(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-closeout-reconciler-'));
  const fixture = writeCloseoutDriftFixture(root);
  try {
    await callback(fixture);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeCloseoutDriftFixture(root) {
  const fixedNow = '2026-05-08T12:00:00.000Z';
  const statusFile = path.join(root, '.claude/docs/phase-status.yaml');
  const workflowDir = path.join(root, '.claude/logs/workflow-enforcement');
  const sessionLog = path.join(root, '.claude/sessions/phase01.jsonl');

  fs.mkdirSync(path.dirname(statusFile), { recursive: true });
  fs.mkdirSync(workflowDir, { recursive: true });
  fs.mkdirSync(path.dirname(sessionLog), { recursive: true });

  fs.writeFileSync(statusFile, [
    'schemaVersion: "1.0"',
    'activeRunLeaseId: "delegated-failed-run"',
    'phases:',
    '  - number: 1',
    '    status: completed',
    '    activeRunLeaseId: "delegated-failed-run"',
    '    completedAt: "2026-05-08T12:00:05.001Z"',
    '    completionBoundary: "plan"',
    '    verificationVerdict: "passed"',
    '',
  ].join('\n'));

  fs.writeFileSync(path.join(workflowDir, 'current-run.json'), JSON.stringify({
    runId: 'delegated-failed-run',
    status: 'failed',
    activeRunLeaseId: 'delegated-failed-run',
    completedAt: '2026-05-08T11:59:00.000Z',
    failureClass: 'delegated_terminal_failed',
    fallbackRunId: 'local-fallback-complete-run',
  }, null, 2));

  fs.writeFileSync(path.join(workflowDir, 'local-fallback-complete-run.json'), JSON.stringify({
    runId: 'local-fallback-complete-run',
    status: 'completed',
    completionBoundary: 'phase_only',
    completedAt: '2026-05-08T11:59:30.000Z',
  }, null, 2));

  fs.writeFileSync(path.join(workflowDir, 'environment-blocked-smoke.json'), JSON.stringify({
    status: 'blocked',
    reason: 'runtime-health-blocked',
    evidenceDepth: 'smoke_only',
    planStatus: 'complete',
  }, null, 2));

  fs.writeFileSync(sessionLog, [
    JSON.stringify({ type: 'assistant', phase: 'commentary', event: 'task_complete', runId: 'delegated-failed-run' }),
    JSON.stringify({ type: 'workflow', status: 'failed', runId: 'delegated-failed-run' }),
    '',
  ].join('\n'));

  return { root, fixedNow, statusFile, workflowDir, sessionLog };
}
