import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { reconcilePhaseCloseout } from './phase-closeout-reconciler.mjs';

test('reconciler supersedes failed delegated workflow state and mirrors fallback completion', async () => {
  await withFixture(async (fixture) => {
    const result = await reconcilePhaseCloseout({
      root: fixture.root,
      statusFile: fixture.statusFile,
      workflowDir: fixture.workflowDir,
      fallbackRunId: 'local-fallback-complete-run',
      reason: 'phase-02-test',
      now: fixture.fixedNow,
    });

    assert.equal(result.completionStatus, 'completed-via-local-fallback');
    assert.equal(result.completionBoundary, 'phase_only');
    assert.equal(result.fallbackRunId, 'local-fallback-complete-run');
    assert.equal(result.supersededRunLeaseId, 'delegated-failed-run');
    assert.deepEqual(result.warnings, []);

    for (const basename of ['current-run.json', 'active-phase-run.json', 'latest-dispatch.json']) {
      const payload = readJson(path.join(fixture.workflowDir, basename));
      assert.equal(payload.status, 'superseded-by-local-fallback', basename);
      assert.equal(payload.completionStatus, 'completed-via-local-fallback', basename);
      assert.equal(payload.executionBoundary, 'delegated-terminal', basename);
      assert.equal(payload.returnBoundary, 'local-fallback', basename);
      assert.equal(payload.fallbackReason, 'phase-02-test', basename);
      assert.equal(payload.originalWorkerExitCode, '1', basename);
      assert.equal(payload.originalStopReason, 'delegated-terminal-exit-1', basename);
      assert.equal(payload.fallbackRunId, 'local-fallback-complete-run', basename);
      assert.equal(payload.supersededRunLeaseId, 'delegated-failed-run', basename);
      assert.equal(payload.supersededAt, fixture.fixedNow, basename);
      assert.equal(payload.completionBoundary, 'phase_only', basename);
      assert.equal(payload.rawStopReasonCode, 'delegated-terminal-exit-1', basename);
      assert.equal(payload.blockingStopReasonCode, '', basename);
      assert.equal(payload.recoveryStatus, 'recovered', basename);
      assert.equal(payload.completionPath, 'local-fallback', basename);
      assert.equal(payload.recoveryEvents.length, 1, basename);
      assert.equal(payload.recoveryEvents[0].blockingBeforeRecovery, true, basename);
      assert.equal(payload.recoveryEvents[0].toStatus, 'completed-via-local-fallback', basename);
      assert.equal(payload.residualFailures.length, 1, basename);
      assert.equal(payload.residualFailures[0].rawStopReasonCode, 'delegated-terminal-exit-1', basename);
      assert.equal(payload.localFallbackCompletion.completionStatus, 'completed-via-local-fallback', basename);
      assert.equal(payload.localFallbackCompletion.returnBoundary, 'local-fallback', basename);
    }

    const fallback = readJson(path.join(fixture.workflowDir, 'local-fallback-complete-run.json'));
    assert.equal(fallback.status, 'completed');
    assert.equal(fallback.completionStatus, 'completed-via-local-fallback');
    assert.equal(fallback.reason, 'phase-02-test');

    const debugLog = fs.readFileSync(path.join(fixture.root, '.claude/logs/agent-loop/debug.jsonl'), 'utf8');
    assert.match(debugLog, /phase-closeout-reconciler-summary/);
  });
});

test('reconciler warns for missing workflow state files without creating them', async () => {
  await withFixture(async (fixture) => {
    fs.rmSync(path.join(fixture.workflowDir, 'active-phase-run.json'));

    const result = await reconcilePhaseCloseout({
      root: fixture.root,
      statusFile: fixture.statusFile,
      workflowDir: fixture.workflowDir,
      fallbackRunId: 'local-fallback-complete-run',
      now: fixture.fixedNow,
    });

    assert.ok(result.warnings.some((warning) => warning.file.endsWith('active-phase-run.json')));
    assert.equal(fs.existsSync(path.join(fixture.workflowDir, 'active-phase-run.json')), false);
    assert.equal(readJson(path.join(fixture.workflowDir, 'current-run.json')).status, 'superseded-by-local-fallback');
    assert.equal(readJson(path.join(fixture.workflowDir, 'latest-dispatch.json')).status, 'superseded-by-local-fallback');
  });
});

test('reconciler returns deterministic summary JSON payload fields', async () => {
  await withFixture(async (fixture) => {
    const payload = await reconcilePhaseCloseout({
      root: fixture.root,
      statusFile: fixture.statusFile,
      workflowDir: fixture.workflowDir,
      fallbackRunId: 'local-fallback-complete-run',
      reason: 'cli-test',
      now: fixture.fixedNow,
    });

    assert.equal(payload.fallbackRunId, 'local-fallback-complete-run');
    assert.equal(payload.completionStatus, 'completed-via-local-fallback');
    assert.equal(payload.reconciledFiles.length, 3);
  });
});

test('missing adoption metadata blocks manual orphan reconcile', async () => {
  await withFixture(async (fixture) => {
    await assert.rejects(
      () => reconcilePhaseCloseout({
        root: fixture.root,
        command: 'reconcile',
        mode: 'manual',
        adoptOrphan: true,
        now: fixture.fixedNow,
      }),
      /missing_adoption_metadata/,
    );
  });
});

test('underrun reverification commands keep manual orphan adoption incomplete', async () => {
  await withFixture(async (fixture) => {
    const metadataPath = path.join(fixture.root, 'adoption-metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(validAdoptionMetadata({
      reverificationCommands: [],
    }), null, 2));

    await assert.rejects(
      () => reconcilePhaseCloseout({
        root: fixture.root,
        command: 'reconcile',
        mode: 'manual',
        adoptOrphan: true,
        adoptionMetadata: metadataPath,
        now: fixture.fixedNow,
      }),
      /adoption_metadata_invalid: reverificationCommands/,
    );
  });
});

test('valid manual orphan reconcile records pending adoption evidence only', async () => {
  await withFixture(async (fixture) => {
    const metadataPath = path.join(fixture.root, 'adoption-metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(validAdoptionMetadata(), null, 2));

    const result = await reconcilePhaseCloseout({
      root: fixture.root,
      command: 'reconcile',
      mode: 'manual',
      adoptOrphan: true,
      adoptionMetadata: metadataPath,
      now: fixture.fixedNow,
    });

    assert.equal(result.completionStatus, 'adopted_but_unverified');
    assert.equal(result.requiredVerifierPass, true);

    const metadata = readJson(metadataPath);
    assert.equal(metadata.reconciledFrom, 'orphan_projection');
    assert.equal(metadata.completionStatus, 'adopted_but_unverified');
    assert.equal(metadata.verifierPassRequired, true);
    assert.equal(metadata.adoptedAt, fixture.fixedNow);

    const capture = fs.readFileSync(path.join(fixture.root, 'reverification-commands.jsonl'), 'utf8').trim().split(/\r?\n/);
    assert.equal(capture.length, 1);
    assert.equal(JSON.parse(capture[0]).expectedSignal, 'exit 0');

    assert.equal(fs.existsSync(path.join(fixture.workflowDir, 'manual-adoption-run.json')), false);
  });
});

test('delegated-loop-cannot-adopt-orphan rejects automatic orphan adoption CLIs', async () => {
  await withFixture(async () => {
    const agentLoop = spawnSync(process.execPath, [
      '.claude/scripts/agent-loop.mjs',
      'docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12',
      '--adopt-orphan',
    ], { encoding: 'utf8' });
    assert.notEqual(agentLoop.status, 0);
    assert.match(agentLoop.stderr, /delegated_loop_cannot_adopt_orphan/);

    const phaseState = spawnSync(process.execPath, [
      '.claude/scripts/agent-loop-phase-state.mjs',
      'reconcile',
      '--adopt-orphan',
    ], { encoding: 'utf8' });
    assert.notEqual(phaseState.status, 0);
    assert.match(phaseState.stderr, /delegated_loop_cannot_adopt_orphan/);

    const autoReconcile = spawnSync(process.execPath, [
      '.claude/scripts/phase-closeout-reconciler.mjs',
      '--mode',
      'auto',
      '--adopt-orphan',
    ], { encoding: 'utf8' });
    assert.notEqual(autoReconcile.status, 0);
    assert.match(autoReconcile.stderr, /delegated_loop_cannot_adopt_orphan/);
  });
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function validAdoptionMetadata(overrides = {}) {
  return {
    adoptedBy: 'codex-test',
    adoptionReason: 'manual operator reviewed orphan projection evidence',
    reconciledFrom: 'orphan_projection',
    sourceProjectionPaths: ['.claude/logs/workflow-enforcement/current-run.json'],
    reverificationCommands: [
      {
        command: 'node --test .claude/scripts/phase-closeout-reconciler.test.mjs',
        cwd: 'repository root',
        expectedSignal: 'exit 0',
      },
    ],
    ...overrides,
  };
}

async function withFixture(callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-closeout-reconciler-'));
  const fixture = writeFixture(root);
  try {
    await callback(fixture);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeFixture(root) {
  const fixedNow = '2026-05-08T12:00:00.000Z';
  const statusFile = path.join(root, '.claude/docs/phase-status.yaml');
  const workflowDir = path.join(root, '.claude/logs/workflow-enforcement');

  fs.mkdirSync(path.dirname(statusFile), { recursive: true });
  fs.mkdirSync(workflowDir, { recursive: true });

  fs.writeFileSync(statusFile, [
    'schemaVersion: "1.0"',
    'activeRunLeaseId: "delegated-failed-run"',
    'phases:',
    '  - number: 2',
    '    status: completed',
    '',
  ].join('\n'));

  for (const basename of ['current-run.json', 'active-phase-run.json', 'latest-dispatch.json']) {
    fs.writeFileSync(path.join(workflowDir, basename), JSON.stringify({
      runLeaseId: 'delegated-failed-run',
      status: 'failed',
      completionStatus: 'failed',
      executionMode: 'delegated-terminal',
      failureClass: 'delegated_terminal_failed',
      stopReasonCode: 'delegated-terminal-exit-1',
      exitCode: 1,
      fallbackRunId: 'local-fallback-complete-run',
      phaseRunLease: {
        runLeaseId: 'delegated-failed-run',
        status: 'failed',
        completionStatus: 'failed',
        stopReasonCode: 'delegated-terminal-exit-1',
        exitCode: 1,
      },
    }, null, 2));
  }

  fs.writeFileSync(path.join(workflowDir, 'local-fallback-complete-run.json'), JSON.stringify({
    runId: 'local-fallback-complete-run',
    status: 'completed',
    completionBoundary: 'phase_only',
    completedAt: '2026-05-08T11:59:30.000Z',
  }, null, 2));

  return { root, fixedNow, statusFile, workflowDir };
}
