import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

test('active heartbeat preserves same-attempt terminal projections without STATE.md pending transition', async () => {
  await withLeaseStore(async ({ statusFile, activeRunFile, currentRunFile, writeActiveLease }) => {
    const terminalPayload = {
      runLeaseId: 'lease-1',
      stateRunId: 'run-1',
      status: 'blocked',
      activeExecutionStatus: 'blocked',
      completionStatus: 'blocked',
      attemptOutcome: 'blocked',
      blockingStopReasonCode: 'verification_failed',
      stopReasonDetail: 'blocked before heartbeat',
      finalVerdict: 'blocked',
      normalizedRunVerdict: 'blocked',
    };
    writeJson(activeRunFile, terminalPayload);
    writeJson(currentRunFile, terminalPayload);

    writeActiveLease(statusFile, {
      runLeaseId: 'lease-1',
      stateRunId: 'run-1',
      status: 'active',
      completionStatus: '',
      currentStage: 'execute',
      phase: { number: 3, title: 'Phase 03' },
      planDir: 'docs/implementation/phase-runner-simple-state-board-2026-05-13',
      statusFile,
      executionRoot: 'execution/v1',
    });

    for (const target of [activeRunFile, currentRunFile]) {
      const payload = readJson(target);
      assert.equal(payload.status, 'blocked');
      assert.equal(payload.activeExecutionStatus, 'blocked');
      assert.equal(payload.completionStatus, 'blocked');
      assert.equal(payload.attemptOutcome, 'blocked');
      assert.equal(payload.blockingStopReasonCode, 'verification_failed');
      assert.equal(payload.finalVerdict, 'blocked');
    }

    assert.equal(
      fs.existsSync(path.join(process.cwd(), '.claude', 'logs', 'simple-run-state', 'run-1', 'STATE.md')),
      false,
    );
  });
});

test('active heartbeat rejects stateRunId mismatch before lease/current-run projection overwrite', async () => {
  await withLeaseStore(async ({ statusFile, activeRunFile, currentRunFile, writeActiveLease }) => {
    writeJson(activeRunFile, {
      runLeaseId: 'lease-1',
      stateRunId: 'run-1',
      status: 'active',
    });
    writeJson(currentRunFile, {
      runLeaseId: 'lease-1',
      stateRunId: 'run-1',
      status: 'active',
    });

    assert.throws(() => writeActiveLease(statusFile, {
      runLeaseId: 'lease-2',
      stateRunId: 'run-2',
      status: 'active',
      phase: { number: 3, title: 'Phase 03' },
      statusFile,
    }), /stateRunId mismatch rejected/);

    assert.equal(readJson(activeRunFile).stateRunId, 'run-1');
    assert.equal(readJson(currentRunFile).stateRunId, 'run-1');
  });
});

test('active heartbeat cannot preserve in-progress attempt outcome after terminal complete', async () => {
  await withLeaseStore(async ({ statusFile, activeRunFile, currentRunFile, writeActiveLease }) => {
    writeJson(activeRunFile, {
      runLeaseId: 'lease-complete',
      stateRunId: 'run-complete',
      status: 'finished',
      activeExecutionStatus: 'failed',
      completionStatus: 'completed',
      attemptOutcome: 'in_progress',
      childAlive: true,
      liveness: { childAlive: true },
      finalVerdict: 'complete',
      normalizedRunVerdict: 'complete',
    });
    writeJson(currentRunFile, {
      runLeaseId: 'lease-complete',
      stateRunId: 'run-complete',
      status: 'completed',
      activeExecutionStatus: 'failed',
      completionStatus: 'completed',
      attemptOutcome: 'in_progress',
      childAlive: true,
      liveness: { childAlive: true },
      finalVerdict: 'complete',
      normalizedRunVerdict: 'complete',
    });

    writeActiveLease(statusFile, {
      runLeaseId: 'lease-complete',
      stateRunId: 'run-complete',
      status: 'active',
      completionStatus: '',
      currentStage: 'execute',
      phase: { number: 1, title: 'Phase 01' },
      planDir: 'docs/implementation/phase-runner-projection-closeout-observability-2026-05-14',
      statusFile,
      executionRoot: 'execution/phase-01',
    });

    const activePayload = readJson(activeRunFile);
    assert.equal(activePayload.status, 'finished');
    assert.equal(activePayload.completionStatus, 'completed');
    assert.equal(activePayload.attemptOutcome, 'completed');
    assert.equal(activePayload.activeExecutionStatus, undefined);
    assert.equal(activePayload.childAlive, false);
    assert.notEqual(activePayload.liveness?.childAlive, true);
    assert.equal(activePayload.finalVerdict, 'complete');

    const currentPayload = readJson(currentRunFile);
    assert.equal(currentPayload.status, 'completed');
    assert.equal(currentPayload.completionStatus, 'completed');
    assert.equal(currentPayload.attemptOutcome, 'completed');
    assert.equal(currentPayload.activeExecutionStatus, undefined);
    assert.equal(currentPayload.childAlive, false);
    assert.notEqual(currentPayload.liveness?.childAlive, true);
    assert.equal(currentPayload.finalVerdict, 'complete');
  });
});

async function withLeaseStore(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-run-lease-store-'));
  const previousLogDir = process.env.WORKFLOW_ENFORCEMENT_LOG_DIR;
  process.env.WORKFLOW_ENFORCEMENT_LOG_DIR = path.join(root, 'workflow');
  try {
    const moduleUrl = new URL(`./phase-run-lease-store.mjs?test=${Date.now()}-${Math.random()}`, import.meta.url);
    const store = await import(moduleUrl.href);
    const statusFile = path.join(root, 'phase-status.yaml');
    const { activeRunFile, currentRunFile } = store.resolveLeaseFiles(statusFile);
    fs.mkdirSync(path.dirname(activeRunFile), { recursive: true });
    await callback({
      statusFile,
      activeRunFile,
      currentRunFile,
      writeActiveLease: store.writeActiveLease,
    });
  } finally {
    if (previousLogDir === undefined) {
      delete process.env.WORKFLOW_ENFORCEMENT_LOG_DIR;
    } else {
      process.env.WORKFLOW_ENFORCEMENT_LOG_DIR = previousLogDir;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
