import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertNoGeneratedStalePhaseResidue,
  evaluateHarnessStateInvariants,
  assertProjectionHasActiveLog,
  evaluateCloseoutInvariant,
  evaluateSidecarCanonicalInvariant,
  workflowStateClass,
} from './harness-state-invariants.mjs';

function writeStateBoard(workflowDir, overrides = {}) {
  const state = {
    stateRunId: 'state-run-a',
    transitionId: 'transition-a',
    projectionStatus: 'committed',
    planDir: 'docs/implementation/example',
    statusFile: '.claude/docs/phase-status.yaml',
    status: 'active',
    phase: '4',
    attempt: 'attempt-a',
    owner: 'codex',
    reason: 'fixture',
    runRoot: '.claude/logs/workflow-enforcement/runs/state-run-a',
    updated: '2026-05-14T07:00:00Z',
    ...overrides,
  };
  const body = [
    '# Simple Run State',
    '',
    ...Object.entries(state).map(([key, value]) => `${key}: ${value}`),
    '',
  ].join('\n');
  fs.writeFileSync(path.join(workflowDir, 'STATE.md'), body, 'utf8');
}

function writeWorkflowProjection(workflowDir, basename, payload = {}) {
  fs.writeFileSync(path.join(workflowDir, basename), `${JSON.stringify({
    stateRunId: 'state-run-a',
    status: 'running',
    activeExecutionStatus: 'active',
    completionStatus: 'in_progress',
    attemptOutcome: 'in_progress',
    phaseNumber: 4,
    phaseTitle: 'Phase 04',
    ...payload,
  })}\n`, 'utf8');
}

test('projection invariant rejects final or blocked artifacts without an active log path', () => {
  assert.throws(
    () => assertProjectionHasActiveLog({ finish: { nextPath: 'clean_finish' }, logFile: '' }),
    /active log path/,
  );
  assert.throws(
    () => assertProjectionHasActiveLog({ runtime: { status: 'verification_blocked' }, logFile: '' }),
    /active log path/,
  );
  assert.deepEqual(
    assertProjectionHasActiveLog({ finish: { nextPath: 'retry_loop' }, logFile: '' }),
    { ok: true },
  );
  assert.deepEqual(
    assertProjectionHasActiveLog({ finish: { nextPath: 'clean_finish' }, logFile: '.claude/logs/agent-loop/phase-07.log' }),
    { ok: true },
  );
});

test('generated stale phase residue is rejected without banning free-form phase mentions', () => {
  assert.throws(
    () => assertNoGeneratedStalePhaseResidue({
      activePhaseNumber: 7,
      fields: { reason: 'out_of_scope_for_phase_03' },
    }),
    /stale phase residue/,
  );
  assert.throws(
    () => assertNoGeneratedStalePhaseResidue({
      activePhaseNumber: 7,
      fields: { evidence: ['generated token phase_03'] },
    }),
    /phase_03/,
  );
  assert.deepEqual(
    assertNoGeneratedStalePhaseResidue({
      activePhaseNumber: 7,
      fields: { note: 'Phase 03에서 이관된 항목' },
    }),
    { ok: true, violations: [] },
  );
});

test('closeout invariant covers complete, blocked, failed, superseded, and environment blocker states', () => {
  assert.equal(evaluateCloseoutInvariant({ phaseStatus: 'completed', normalizedRunVerdict: 'complete' }).ok, true);
  assert.equal(evaluateCloseoutInvariant({ phaseStatus: 'blocked', normalizedRunVerdict: 'blocked' }).ok, true);
  assert.equal(evaluateCloseoutInvariant({ phaseStatus: 'failed', normalizedRunVerdict: 'failed' }).ok, true);
  assert.equal(evaluateCloseoutInvariant({ phaseStatus: 'superseded', normalizedRunVerdict: 'superseded' }).ok, true);

  const environmentBlocked = evaluateCloseoutInvariant({
    phaseStatus: 'verification_blocked',
    normalizedRunVerdict: 'complete_with_environment_blocker',
    environmentBlockers: [{ code: 'verifier_unavailable' }],
  });
  assert.equal(environmentBlocked.ok, true);
  assert.equal(environmentBlocked.completionState, 'blocked_by_environment');

  const fakeClean = evaluateCloseoutInvariant({
    phaseStatus: 'completed',
    normalizedRunVerdict: 'complete_with_environment_blocker',
    environmentBlockers: [{ code: 'verifier_unavailable' }],
  });
  assert.equal(fakeClean.ok, false);
});

test('terminal completion fields take precedence over active status fields', () => {
  const blockedPayload = {
    status: 'active',
    activeExecutionStatus: 'active',
    completionStatus: 'blocked',
    attemptOutcome: 'blocked',
  };
  assert.equal(workflowStateClass(blockedPayload), 'terminal');

  const nestedBlockedPayload = {
    status: 'active',
    phaseRunLease: {
      completionStatus: 'blocked',
    },
  };
  assert.equal(workflowStateClass(nestedBlockedPayload), 'terminal');
});

test('completed phase invariant does not treat terminal blocked payload as running', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-state-invariants-'));
  try {
    const workflowDir = path.join(root, '.claude', 'logs', 'workflow-enforcement');
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.writeFileSync(path.join(workflowDir, 'current-run.json'), `${JSON.stringify({
      status: 'active',
      activeExecutionStatus: 'active',
      completionStatus: 'blocked',
      attemptOutcome: 'blocked',
      activePhaseNumber: 1,
      activePhaseTitle: 'Phase 01',
    })}\n`, 'utf8');

    const result = evaluateHarnessStateInvariants({
      statusRoot: { activePhaseNumber: 2 },
      phases: [{ number: 1, title: 'Phase 01', status: 'completed' }],
      statusPath: path.join(root, '.claude', 'docs', 'phase-status.yaml'),
      workflowDir,
    });

    assert.equal(result.violations.some((entry) => entry.code === 'current-run-running-phase-completed'), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('completed phase invariant allows running workflow state for the current open phase', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-state-invariants-'));
  try {
    const workflowDir = path.join(root, '.claude', 'logs', 'workflow-enforcement');
    fs.mkdirSync(workflowDir, { recursive: true });
    for (const basename of ['current-run.json', 'active-phase-run.json', 'latest-dispatch.json']) {
      fs.writeFileSync(path.join(workflowDir, basename), `${JSON.stringify({
        runId: 'lease-phase-4',
        status: basename === 'latest-dispatch.json' ? 'running' : 'active',
        activeExecutionStatus: 'active',
        phaseNumber: 4,
        phaseTitle: 'Phase 04',
      })}\n`, 'utf8');
    }

    const result = evaluateHarnessStateInvariants({
      statusRoot: {
        activeRunLeaseId: 'outer-dispatch-lease',
        activeExecutionStatus: 'active',
        activePhaseNumber: 4,
      },
      phases: [
        { number: 2, title: 'Phase 02', status: 'completed' },
        { number: 3, title: 'Phase 03', status: 'completed' },
        { number: 4, title: 'Phase 04', status: 'in_progress' },
      ],
      statusPath: path.join(root, '.claude', 'docs', 'phase-status.yaml'),
      workflowDir,
    });

    const codes = result.violations.map((entry) => entry.code);
    assert.equal(codes.includes('current-run-running-phase-completed'), false);
    assert.equal(codes.includes('active-phase-run-running-phase-completed'), false);
    assert.equal(codes.includes('latest-dispatch-running-phase-completed'), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('completed phase invariant allows failed workflow state for the current open phase', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-state-invariants-'));
  try {
    const workflowDir = path.join(root, '.claude', 'logs', 'workflow-enforcement');
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.writeFileSync(path.join(workflowDir, 'latest-dispatch.json'), `${JSON.stringify({
      runId: 'lease-phase-4',
      status: 'running',
      activeExecutionStatus: 'running',
      completionStatus: 'failed',
      blockingStopReasonCode: 'delegated-terminal-signal-no-closeout',
      phaseNumber: 4,
      phaseTitle: 'Phase 04',
    })}\n`, 'utf8');

    const result = evaluateHarnessStateInvariants({
      statusRoot: {
        activeRunLeaseId: 'lease-phase-4',
        activeExecutionStatus: 'active',
        activePhaseNumber: 4,
      },
      phases: [
        { number: 2, title: 'Phase 02', status: 'completed' },
        { number: 3, title: 'Phase 03', status: 'completed' },
        { number: 4, title: 'Phase 04', status: 'in_progress' },
      ],
      statusPath: path.join(root, '.claude', 'docs', 'phase-status.yaml'),
      workflowDir,
    });

    assert.equal(result.violations.some((entry) => entry.code === 'latest-dispatch-failed-phase-completed'), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('paused workflow invariant rejects live child evidence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-paused-invariants-'));
  try {
    const workflowDir = path.join(root, '.claude', 'logs', 'workflow-enforcement');
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.writeFileSync(path.join(workflowDir, 'current-run.json'), `${JSON.stringify({
      status: 'paused',
      activeExecutionStatus: 'paused',
      completionStatus: 'paused',
      childAlive: true,
      activePhaseNumber: 4,
    })}\n`, 'utf8');

    const result = evaluateHarnessStateInvariants({
      statusRoot: {
        activeExecutionStatus: 'paused',
        activePhaseNumber: 4,
      },
      phases: [{ number: 4, title: 'Phase 04', status: 'in_progress' }],
      statusPath: path.join(root, '.claude', 'docs', 'phase-status.yaml'),
      workflowDir,
    });

    assert.equal(result.violations.some((entry) => entry.code === 'paused-workflow-child-alive'), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('terminal latest-dispatch invariant rejects stale child-running liveness', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-terminal-dispatch-liveness-'));
  try {
    const workflowDir = path.join(root, '.claude', 'logs', 'workflow-enforcement');
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.writeFileSync(path.join(workflowDir, 'latest-dispatch.json'), `${JSON.stringify({
      stateRunId: 'state-run-terminal',
      status: 'superseded',
      completionStatus: 'completed',
      dispatchStage: 'child_running',
      childAlive: true,
      liveness: {
        childAlive: true,
        reason: 'child_running',
      },
      phaseNumber: 2,
      phaseTitle: 'Phase 02',
    })}\n`, 'utf8');

    const result = evaluateHarnessStateInvariants({
      statusRoot: {
        activeExecutionStatus: 'active',
        activePhaseNumber: 2,
      },
      phases: [{ number: 2, title: 'Phase 02', status: 'in_progress' }],
      statusPath: path.join(root, '.claude', 'docs', 'phase-status.yaml'),
      workflowDir,
    });

    const violation = result.violations.find((entry) => entry.code === 'latest-dispatch-terminal-child-alive');
    assert.ok(violation);
    assert.equal(violation.status, 'superseded');
    assert.equal(violation.completionStatus, 'completed');
    assert.equal(violation.dispatchStage, 'child_running');
    assert.equal(violation.childAlive, true);
    assert.equal(violation.nestedChildAlive, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('harness snapshot includes STATE.md board facts when present', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-state-board-snapshot-'));
  try {
    const workflowDir = path.join(root, '.claude', 'logs', 'workflow-enforcement');
    fs.mkdirSync(workflowDir, { recursive: true });
    writeStateBoard(workflowDir, { status: 'blocked' });

    const result = evaluateHarnessStateInvariants({
      statusRoot: { activePhaseNumber: 4 },
      phases: [{ number: 4, title: 'Phase 04', status: 'in_progress' }],
      statusPath: path.join(root, '.claude', 'docs', 'phase-status.yaml'),
      workflowDir,
    });

    assert.equal(result.boardState.exists, true);
    assert.equal(result.boardState.state.status, 'blocked');
    assert.equal(path.basename(result.boardState.statePath), 'STATE.md');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('state board blocked status rejects running compatibility projection', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-state-board-blocked-'));
  try {
    const workflowDir = path.join(root, '.claude', 'logs', 'workflow-enforcement');
    fs.mkdirSync(workflowDir, { recursive: true });
    writeStateBoard(workflowDir, { status: 'blocked' });
    writeWorkflowProjection(workflowDir, 'current-run.json');

    const result = evaluateHarnessStateInvariants({
      statusRoot: { activePhaseNumber: 4 },
      phases: [{ number: 4, title: 'Phase 04', status: 'in_progress' }],
      statusPath: path.join(root, '.claude', 'docs', 'phase-status.yaml'),
      workflowDir,
    });

    const violation = result.violations.find((entry) => entry.code === 'state-board-blocked-projection-running');
    assert.ok(violation);
    assert.equal(path.basename(violation.boardPath), 'STATE.md');
    assert.equal(path.basename(violation.projectionPath), 'current-run.json');
    assert.equal(violation.stateRunId, 'state-run-a');
    assert.equal(violation.boardStatus, 'blocked');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('state board complete status rejects active compatibility projection', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-state-board-complete-'));
  try {
    const workflowDir = path.join(root, '.claude', 'logs', 'workflow-enforcement');
    fs.mkdirSync(workflowDir, { recursive: true });
    writeStateBoard(workflowDir, { status: 'complete' });
    writeWorkflowProjection(workflowDir, 'active-phase-run.json', { status: 'active' });

    const result = evaluateHarnessStateInvariants({
      statusRoot: { activePhaseNumber: 4 },
      phases: [{ number: 4, title: 'Phase 04', status: 'in_progress' }],
      statusPath: path.join(root, '.claude', 'docs', 'phase-status.yaml'),
      workflowDir,
    });

    const violation = result.violations.find((entry) => entry.code === 'state-board-complete-projection-active');
    assert.ok(violation);
    assert.equal(path.basename(violation.boardPath), 'STATE.md');
    assert.equal(path.basename(violation.projectionPath), 'active-phase-run.json');
    assert.equal(violation.stateRunId, 'state-run-a');
    assert.equal(violation.boardStatus, 'complete');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('state board active status rejects terminal compatibility projection', () => {
  const terminalShapes = [
    {
      name: 'root finalVerdict complete',
      basename: 'current-run.json',
      payload: { finalVerdict: 'complete' },
    },
    {
      name: 'root completionStatus completed with completedAt',
      basename: 'current-run.json',
      payload: { completionStatus: 'completed', completedAt: '2026-05-14T07:30:00Z' },
    },
    {
      name: 'phaseRunLease finalVerdict complete and status finished',
      basename: 'current-run.json',
      payload: { phaseRunLease: { stateRunId: 'state-run-a', finalVerdict: 'complete', status: 'finished' } },
    },
  ];

  for (const { name, basename, payload } of terminalShapes) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-state-board-terminal-'));
    try {
      const workflowDir = path.join(root, '.claude', 'logs', 'workflow-enforcement');
      fs.mkdirSync(workflowDir, { recursive: true });
      writeStateBoard(workflowDir, { status: 'active' });
      writeWorkflowProjection(workflowDir, basename, payload);

      const result = evaluateHarnessStateInvariants({
        statusRoot: { activePhaseNumber: 4 },
        phases: [{ number: 4, title: 'Phase 04', status: 'in_progress' }],
        statusPath: path.join(root, '.claude', 'docs', 'phase-status.yaml'),
        workflowDir,
      });

      const violation = result.violations.find((entry) => entry.code === 'state-board-active-projection-terminal');
      assert.ok(violation, name);
      assert.equal(path.basename(violation.boardPath), 'STATE.md');
      assert.equal(path.basename(violation.projectionPath), basename);
      assert.equal(violation.stateRunId, 'state-run-a');
      assert.equal(violation.boardStatus, 'active');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('state board active status ignores non-concrete terminal-like projection fields', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-state-board-terminal-like-'));
  try {
    const workflowDir = path.join(root, '.claude', 'logs', 'workflow-enforcement');
    fs.mkdirSync(workflowDir, { recursive: true });
    writeStateBoard(workflowDir, { status: 'active' });
    writeWorkflowProjection(workflowDir, 'current-run.json', {
      completionStatus: 'completed',
      phaseRunLease: { stateRunId: 'state-run-a', finalVerdict: 'complete', status: 'active' },
    });

    const result = evaluateHarnessStateInvariants({
      statusRoot: { activePhaseNumber: 4 },
      phases: [{ number: 4, title: 'Phase 04', status: 'in_progress' }],
      statusPath: path.join(root, '.claude', 'docs', 'phase-status.yaml'),
      workflowDir,
    });

    assert.equal(result.violations.some((entry) => entry.code === 'state-board-active-projection-terminal'), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('state board pending projection status is reported as incomplete transition', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-state-board-pending-'));
  try {
    const workflowDir = path.join(root, '.claude', 'logs', 'workflow-enforcement');
    fs.mkdirSync(workflowDir, { recursive: true });
    writeStateBoard(workflowDir, { projectionStatus: 'pending', transitionId: 'transition-pending' });

    const result = evaluateHarnessStateInvariants({
      statusRoot: { activePhaseNumber: 4 },
      phases: [{ number: 4, title: 'Phase 04', status: 'in_progress' }],
      statusPath: path.join(root, '.claude', 'docs', 'phase-status.yaml'),
      workflowDir,
    });

    const violation = result.violations.find((entry) => entry.code === 'state-board-pending-transition');
    assert.ok(violation);
    assert.equal(path.basename(violation.boardPath), 'STATE.md');
    assert.equal(violation.stateRunId, 'state-run-a');
    assert.equal(violation.transitionId, 'transition-pending');
    assert.equal(violation.status, 'active');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('MemoryGraph invariant ignores superseded non-strict warning after recovery', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-memorygraph-recovered-'));
  try {
    const workflowDir = path.join(root, '.claude', 'logs', 'workflow-enforcement');
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.writeFileSync(path.join(workflowDir, 'current-run.json'), `${JSON.stringify({
      stateRunId: 'phase-05-run-a',
      status: 'running',
      activeExecutionStatus: 'active',
      phaseNumber: 5,
      unavailableCapabilities: [
        {
          capability: 'memorygraph',
          code: 'memorygraph_unavailable',
          strict: 'false',
          status: 'superseded',
          freshnessState: 'recovered',
          decayReason: 'healthy_probe',
          decayedAt: '2026-05-14T12:00:00Z',
          source: 'memorygraph.health',
        },
      ],
    })}\n`, 'utf8');

    const result = evaluateHarnessStateInvariants({
      statusRoot: { activePhaseNumber: 5 },
      phases: [{ number: 5, title: 'Phase 05', status: 'in_progress' }],
      statusPath: path.join(root, '.claude', 'docs', 'phase-status.yaml'),
      workflowDir,
    });

    assert.equal(result.degradedEvidence.some((entry) => entry.code === 'memorygraph_unavailable'), false);
    assert.equal(result.violations.some((entry) => entry.code === 'memorygraph-unavailable-strict'), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('strict MemoryGraph unavailable still blocks before recovery', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-memorygraph-strict-'));
  try {
    const workflowDir = path.join(root, '.claude', 'logs', 'workflow-enforcement');
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.writeFileSync(path.join(workflowDir, 'current-run.json'), `${JSON.stringify({
      stateRunId: 'phase-05-run-a',
      status: 'running',
      activeExecutionStatus: 'active',
      phaseNumber: 5,
      unavailableCapabilities: [
        {
          capability: 'memorygraph',
          code: 'memorygraph_unavailable',
          strict: 'true',
          status: 'unavailable',
          freshnessState: 'current',
          source: 'memorygraph.health',
        },
      ],
    })}\n`, 'utf8');

    const result = evaluateHarnessStateInvariants({
      statusRoot: { activePhaseNumber: 5 },
      phases: [{ number: 5, title: 'Phase 05', status: 'in_progress' }],
      statusPath: path.join(root, '.claude', 'docs', 'phase-status.yaml'),
      workflowDir,
    });

    assert.equal(result.violations.some((entry) => entry.code === 'memorygraph-unavailable-strict'), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('state board stateRunId mismatch with global compatibility projection is reported', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-state-board-run-id-'));
  try {
    const workflowDir = path.join(root, '.claude', 'logs', 'workflow-enforcement');
    fs.mkdirSync(workflowDir, { recursive: true });
    writeStateBoard(workflowDir, { stateRunId: 'state-run-board' });
    writeWorkflowProjection(workflowDir, 'latest-dispatch.json', { stateRunId: 'state-run-projection' });

    const result = evaluateHarnessStateInvariants({
      statusRoot: { activePhaseNumber: 4 },
      phases: [{ number: 4, title: 'Phase 04', status: 'in_progress' }],
      statusPath: path.join(root, '.claude', 'docs', 'phase-status.yaml'),
      workflowDir,
    });

    const violation = result.violations.find((entry) => entry.code === 'state-board-projection-run-id-mismatch');
    assert.ok(violation);
    assert.equal(path.basename(violation.boardPath), 'STATE.md');
    assert.equal(path.basename(violation.projectionPath), 'latest-dispatch.json');
    assert.equal(violation.boardStateRunId, 'state-run-board');
    assert.equal(violation.projectionStateRunId, 'state-run-projection');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('sidecar canonical invariant rejects manifest-only state without legacy fallback', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-sidecar-invariants-'));
  try {
    const paths = {
      blockerEvidencePath: path.join(root, 'BLOCKER_EVIDENCE.jsonl'),
      attemptLedgerPath: path.join(root, 'ATTEMPT_LEDGER.jsonl'),
      projectionManifestPath: path.join(root, 'projection-manifest.json'),
    };
    assert.equal(evaluateSidecarCanonicalInvariant(paths).ok, true);
    assert.equal(evaluateSidecarCanonicalInvariant(paths).mode, 'legacy_verifier');

    fs.writeFileSync(paths.projectionManifestPath, '{}\n', 'utf8');
    const manifestOnly = evaluateSidecarCanonicalInvariant(paths);
    assert.equal(manifestOnly.ok, false);
    assert.equal(manifestOnly.code, 'manifest_sidecar_missing');

    fs.writeFileSync(paths.blockerEvidencePath, '{}\n', 'utf8');
    const incomplete = evaluateSidecarCanonicalInvariant(paths);
    assert.equal(incomplete.ok, false);
    assert.equal(incomplete.code, 'manifest_sidecar_missing');

    fs.writeFileSync(paths.attemptLedgerPath, '{}\n', 'utf8');
    const canonical = evaluateSidecarCanonicalInvariant(paths);
    assert.equal(canonical.ok, true);
    assert.equal(canonical.mode, 'sidecar_canonical');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
