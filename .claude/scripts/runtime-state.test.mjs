import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { finishLease, heartbeatLease, startLease, withDb } from './runtime-state.mjs';

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
