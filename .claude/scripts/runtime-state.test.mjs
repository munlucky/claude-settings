import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { heartbeatLease, startLease, withDb } from './runtime-state.mjs';

function withTempRuntime(callback) {
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
    return callback({ root, statusFile });
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
