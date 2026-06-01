import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { finishLease, heartbeatLease, startLease, updateGoalStatus, withDb } from './runtime-state.mjs';

async function withTempRuntime(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-state-'));
  const previousDb = process.env.PHASE_RUNTIME_DB;
  try {
    process.env.PHASE_RUNTIME_DB = path.join(root, 'runtime-state.sqlite');
    const statusFile = path.join(root, '.claude', 'docs', 'phase-status.yaml');
    fs.mkdirSync(path.dirname(statusFile), { recursive: true });
    fs.writeFileSync(statusFile, [
      'planDir: "docs/implementation/example"',
      'phases:',
      '  - number: 1',
      '    title: "Phase 01"',
      '    status: pending',
      '    planConfirmed: true',
      '',
    ].join('\n'), 'utf8');
    return await callback({ root, statusFile });
  } finally {
    if (previousDb === undefined) {
      delete process.env.PHASE_RUNTIME_DB;
    } else {
      process.env.PHASE_RUNTIME_DB = previousDb;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writePhaseStatus(statusFile, phases) {
  fs.writeFileSync(statusFile, [
    'schemaVersion: "1.0"',
    'planDir: "docs/implementation/example"',
    'phases:',
    ...phases.flatMap((phase) => [
      `  - number: ${phase.number}`,
      `    title: "${phase.title}"`,
      `    status: ${phase.status}`,
      '    planConfirmed: true',
      '    attempts:',
      '      total: 0',
      '      lastOutcome: pending',
      '      lastUpdatedAt: ""',
    ]),
    '',
  ].join('\n'), 'utf8');
}

test('heartbeatLease preserves terminal completion_status and records heartbeat payload detail', async () => {
  await withTempRuntime(async ({ root, statusFile }) => {
    await withDb((db) => {
      startLease(db, {
        statusFile,
        leaseId: 'lease-terminal',
        executionBoundary: 'delegated-terminal',
        planDir: path.join(root, 'docs', 'implementation', 'example'),
        executionRoot: path.join(root, 'execution'),
        runtime: 'codex',
        masterPlan: path.join(root, 'docs', 'implementation', 'example', '00-master-plan.md'),
        dispatcherPid: '1234',
        objective: 'test terminal heartbeat preservation',
      });
      db.prepare(`
        UPDATE leases
        SET completion_status = 'blocked',
            stop_reason_code = 'spawn_eperm',
            stop_reason_detail = 'node --test spawn EPERM'
        WHERE lease_id = 'lease-terminal'
      `).run();

      const updated = heartbeatLease(db, {
        leaseId: 'lease-terminal',
        currentStage: 'execute',
        phaseNum: 1,
        phaseTitle: 'Phase 01',
        completionStatus: 'running',
      });
      assert.equal(updated.completion_status, 'blocked');

      const event = db.prepare(`
        SELECT detail FROM runtime_events
        WHERE lease_id = 'lease-terminal' AND event_type = 'LeaseHeartbeat'
        ORDER BY event_id DESC LIMIT 1
      `).get();
      const detail = JSON.parse(event.detail);
      assert.equal(detail.requestedCompletionStatus, 'running');
      assert.equal(detail.preservedCompletionStatus, 'blocked');
    });
  });
});

test('runtime state seeding prunes stale phases absent from current phase-status', async () => {
  await withTempRuntime(async ({ root, statusFile }) => {
    await withDb((db) => {
      const planDir = path.join(root, 'docs', 'implementation', 'example');
      writePhaseStatus(statusFile, [
        { number: 15, title: 'Phase 15 - Old Renderer', status: 'failed' },
        { number: 18, title: 'Phase 18 - Old UAT', status: 'in_progress' },
      ]);
      startLease(db, {
        statusFile,
        leaseId: 'lease-old',
        executionBoundary: 'delegated-terminal',
        planDir,
        executionRoot: path.join(root, 'execution-old'),
        runtime: 'codex',
        masterPlan: path.join(planDir, '00-master-plan-v3.md'),
        dispatcherPid: '1234',
        objective: 'test stale phase pruning',
      });

      writePhaseStatus(statusFile, [
        { number: 19, title: 'Phase 19 - Readiness', status: 'blocked' },
        { number: 20, title: 'Phase 20 - Runtime', status: 'pending' },
      ]);
      startLease(db, {
        statusFile,
        leaseId: 'lease-new',
        executionBoundary: 'delegated-terminal',
        planDir,
        executionRoot: path.join(root, 'execution-new'),
        runtime: 'codex',
        masterPlan: path.join(planDir, '00-master-plan-v4.md'),
        dispatcherPid: '1234',
        objective: 'test stale phase pruning',
      });

      const phaseNumbers = db.prepare('SELECT phase_number FROM phase_runs ORDER BY phase_number')
        .all()
        .map((row) => row.phase_number);
      assert.deepEqual(phaseNumbers, [19, 20]);
    });
  });
});

test('finish lease does not complete goal when blocked phase prevents progress', async () => {
  await withTempRuntime(async ({ root, statusFile }) => {
    await withDb((db) => {
      const planDir = path.join(root, 'docs', 'implementation', 'example');
      writePhaseStatus(statusFile, [
        { number: 19, title: 'Phase 19 - Readiness', status: 'blocked' },
        { number: 20, title: 'Phase 20 - Runtime', status: 'pending' },
      ]);
      startLease(db, {
        statusFile,
        leaseId: 'lease-blocked',
        executionBoundary: 'delegated-terminal',
        planDir,
        executionRoot: path.join(root, 'execution'),
        runtime: 'codex',
        masterPlan: path.join(planDir, '00-master-plan-v4.md'),
        dispatcherPid: '1234',
        objective: 'test blocked phase finish',
      });

      const lease = finishLease(db, {
        leaseId: 'lease-blocked',
        returnBoundary: 'phase_boundary',
        stopReasonCode: 'blocked',
        stopReasonDetail: 'phase 19 is blocked',
        completionStatus: 'blocked',
      });

      const goal = db.prepare('SELECT status, current_lease_id, last_event FROM workflow_goals WHERE goal_id = ?')
        .get(lease.goal_id);
      assert.equal(goal.status, 'paused');
      assert.equal(goal.current_lease_id, null);
      assert.equal(goal.last_event, 'GoalPaused');
    });
  });
});

test('lease finish events preserve reconciliation transaction id and stale history detail', async () => {
  await withTempRuntime(async ({ root, statusFile }) => {
    await withDb((db) => {
      startLease(db, {
        statusFile,
        leaseId: 'lease-reconciled',
        executionBoundary: 'delegated-terminal',
        planDir: path.join(root, 'docs', 'implementation', 'example'),
        executionRoot: path.join(root, 'execution'),
        runtime: 'codex',
        masterPlan: path.join(root, 'docs', 'implementation', 'example', '00-master-plan.md'),
        dispatcherPid: '1234',
        objective: 'test reconciliation transaction propagation',
        transactionId: 'reconciliation-test-transaction',
      });

      finishLease(db, {
        leaseId: 'lease-reconciled',
        returnBoundary: 'local-fallback',
        stopReasonCode: 'delegated-terminal-exit-1',
        stopReasonDetail: 'original blocker detail',
        completionStatus: 'completed-via-local-fallback',
        transactionId: 'reconciliation-test-transaction',
      });

      const events = db.prepare(`
        SELECT event_type, detail, transaction_id FROM runtime_events
        WHERE lease_id = 'lease-reconciled'
        ORDER BY event_id
      `).all();
      assert.ok(events.length >= 2);
      assert.ok(events.every((event) => event.transaction_id === 'reconciliation-test-transaction'));

      const finished = events.find((event) => event.event_type === 'LeaseFinished');
      assert.equal(JSON.parse(finished.detail).transactionId, 'reconciliation-test-transaction');

      const lease = db.prepare('SELECT stop_reason_code, stop_reason_detail, completion_status FROM leases WHERE lease_id = ?')
        .get('lease-reconciled');
      assert.equal(lease.stop_reason_code, 'delegated-terminal-exit-1');
      assert.equal(lease.stop_reason_detail, 'original blocker detail');
      assert.equal(lease.completion_status, 'completed-via-local-fallback');
    });
  });
});

test('stale lease finish pauses active goal and clears current lease pointer', async () => {
  await withTempRuntime(async ({ root, statusFile }) => {
    await withDb((db) => {
      startLease(db, {
        statusFile,
        leaseId: 'lease-stale',
        executionBoundary: 'delegated-terminal',
        planDir: path.join(root, 'docs', 'implementation', 'example'),
        executionRoot: path.join(root, 'execution'),
        runtime: 'codex',
        masterPlan: path.join(root, 'docs', 'implementation', 'example', '00-master-plan.md'),
        dispatcherPid: '1234',
        objective: 'test stale lease goal pause',
      });

      const lease = finishLease(db, {
        leaseId: 'lease-stale',
        returnBoundary: 'stale-lease-cleanup',
        stopReasonCode: 'dead-dispatcher-pid',
        stopReasonDetail: 'dispatcher process no longer exists',
        completionStatus: 'stale',
        finalStatus: 'stale',
      });
      assert.equal(lease.status, 'stale');

      const goal = db.prepare('SELECT status, current_lease_id, last_event FROM workflow_goals WHERE goal_id = ?')
        .get(lease.goal_id);
      assert.equal(goal.status, 'paused');
      assert.equal(goal.current_lease_id, null);
      assert.equal(goal.last_event, 'GoalPaused');
    });
  });
});

test('manual pause clears stale current lease pointer', async () => {
  await withTempRuntime(async ({ root, statusFile }) => {
    await withDb((db) => {
      const started = startLease(db, {
        statusFile,
        leaseId: 'lease-paused',
        executionBoundary: 'delegated-terminal',
        planDir: path.join(root, 'docs', 'implementation', 'example'),
        executionRoot: path.join(root, 'execution'),
        runtime: 'codex',
        masterPlan: path.join(root, 'docs', 'implementation', 'example', '00-master-plan.md'),
        dispatcherPid: '1234',
        objective: 'test manual pause pointer cleanup',
      });

      const paused = updateGoalStatus(db, {
        planDir: path.join(root, 'docs', 'implementation', 'example'),
        status: 'paused',
        detail: 'manual pause for test',
        expectedGoalId: started.goal_id,
      });
      assert.equal(paused.status, 'paused');
      assert.equal(paused.current_lease_id, null);
      assert.equal(paused.last_event, 'GoalPaused');
    });
  });
});
