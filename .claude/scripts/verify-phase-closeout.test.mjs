import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCompletionGateReason, decideMissingEvidenceAction } from './agent-loop-phase-attempt.mjs';
import { setRootRunVerdict } from './agent-loop-phase-state.mjs';
import { evaluatePlanConformance } from './verify-plan-conformance.mjs';
import { evaluatePhaseCloseout } from './verify-phase-closeout.mjs';
import { writeAttemptManifestIntent } from './lib/phase-attempt-manifest.mjs';
import {
  appendPhaseEvent,
  defaultPhaseEventLedgerPath,
  replayPhaseEvents,
  validatePhaseEvent,
} from './lib/phase-event-ledger.mjs';
import { validateEvaluationTriggerPipelineEvidence } from './workflow-enforcement.mjs';
import { config, eventFixture, withFixture } from './verify-phase-closeout-fixtures.mjs';

function writePhase2CompletedFixture(root, options = {}) {
  const docsDir = path.join(root, 'docs/implementation');
  const phaseDoc = path.join(docsDir, 'close/02-completion-gate.md');
  const executionDir = path.join(docsDir, 'execution/02-completion-gate');
  fs.mkdirSync(path.dirname(phaseDoc), { recursive: true });
  fs.mkdirSync(executionDir, { recursive: true });
  fs.appendFileSync(
    path.join(docsDir, '00-master-plan-v1.md'),
    '- [x] Phase 02 - Completion Gate (`docs/implementation/close/02-completion-gate.md`)\n',
    'utf8',
  );
  fs.writeFileSync(phaseDoc, [
    '# Phase 02: Completion Gate',
    '',
    '## Critical Product Scenarios',
    '| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |',
    '|----|--------------------------|----------------------|-----------------|---------------|',
    '| SCN-02-1 | Manifest intent alone cannot complete a phase. | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | `incomplete_attempt_manifest` appears. | `QA_REPORT.md` |',
    '',
    '## Exact Execution Targets',
    '| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |',
    '|----|-----------------|-----------------|---------------|----------|----------------------------|',
    '| P02-1 | none | `.claude/scripts/verify-phase-closeout.mjs` | `.claude/scripts/verify-phase-closeout.test.mjs` | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | exit 0 |',
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(executionDir, 'SPRINT_CONTRACT.md'), [
    '# Sprint Contract',
    '',
    '## Source Plan Requirements Snapshot',
    '| P02-1 | none | `.claude/scripts/verify-phase-closeout.mjs` | `.claude/scripts/verify-phase-closeout.test.mjs` | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | exit 0 |',
    '',
    '## Spec Deviation Ledger',
    '- none',
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(executionDir, 'QA_REPORT.md'), [
    '# QA Report',
    '',
    '## Plan Conformance Review',
    '- Source plan conformance command: pass',
    '- SCN-02-1: pass - incomplete_attempt_manifest appears.',
    '',
    '## Finish Readiness',
    '- Remaining blockers before closeout: none',
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(executionDir, 'SCORECARD.md'), [
    '# Scorecard',
    '',
    '## Objective Checklist',
    '| OBJ-CONFORM | pass |',
    '',
    '## Score Summary',
    '- Verdict: done',
    '',
    '## Task-Level Status Adapter',
    '- Current task status: FULL',
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(executionDir, 'HANDOFF.md'), '# Handoff\n\n## Resume Trigger\n- Stop reason: clean_finish\n', 'utf8');
  fs.writeFileSync(path.join(executionDir, 'WORKSETS.yaml'), [
    'schemaVersion: 1',
    'activeAtomicTask: AT-01',
    'atomicTasks:',
    '  - id: AT-01',
    '    status: completed',
    '    taskStatus: completed',
    '    acceptanceCriterionId: "AC-001"',
    '    linkedRequirementIds: ["REQ-2.1"]',
    '    acVerdict: passed',
    '    verificationEvidence:',
    '      - "PASS: node --test .claude/scripts/verify-phase-closeout.test.mjs"',
    '    ownedPaths:',
    '      - ".claude/scripts/verify-phase-closeout.mjs"',
    '    verificationCommands:',
    '      - "node --test .claude/scripts/verify-phase-closeout.test.mjs"',
    '    evidence:',
    '      - "PASS: node --test .claude/scripts/verify-phase-closeout.test.mjs"',
    '    completedAt: "2026-05-08T11:59:30Z"',
    'worksets: []',
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(docsDir, 'execution/REQUIREMENTS_TRACEABILITY.md'), 'REQ-2.1 | verified | QA_REPORT.md\n', 'utf8');
  fs.writeFileSync(path.join(docsDir, 'execution/SCENARIO_MATRIX.md'), 'SCN-02-1 | passed | QA_REPORT.md\n', 'utf8');
  fs.appendFileSync(path.join(root, '.claude/docs/phase-status.yaml'), [
    '  - number: 2',
    '    title: "Phase 02: Completion Gate"',
    '    status: completed',
    '    sprintContract: "docs/implementation/execution/02-completion-gate/SPRINT_CONTRACT.md"',
    '    qaReport: "docs/implementation/execution/02-completion-gate/QA_REPORT.md"',
    '    handoff: "docs/implementation/execution/02-completion-gate/HANDOFF.md"',
    '    scorecard: "docs/implementation/execution/02-completion-gate/SCORECARD.md"',
    `    archivedPhaseDoc: "docs/implementation/close/02-completion-gate.md"`,
    ...(options.manifestPath ? [`    attemptManifestPath: "${options.manifestPath.replace(/\\/g, '/')}"`] : []),
    '    attempts:',
    '      total: 1',
    '      lastOutcome: clean_complete',
    '    timing:',
    '      lastStage: "finish/handoff"',
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(root, '.claude/verification-verdict-phase02-final.json'), JSON.stringify({
    verdict: 'passed',
    evidenceFresh: true,
    blocking: false,
    score: { verdict: 'done' },
    commands: [{ name: 'fixture', status: 'passed' }],
  }, null, 2), 'utf8');
}

function writeSidecarFixture(root, { status = 'open', manifestOnly = false } = {}) {
  const executionDir = path.join(root, 'docs/implementation/execution/01-feature');
  const blockerEvidencePath = path.join(executionDir, 'BLOCKER_EVIDENCE.jsonl');
  const attemptLedgerPath = path.join(executionDir, 'ATTEMPT_LEDGER.jsonl');
  const projectionManifestPath = path.join(executionDir, 'projection-manifest.json');
  if (!manifestOnly) {
    fs.writeFileSync(blockerEvidencePath, `${JSON.stringify({
      id: 'blocker-spawn-eperm',
      status,
      phaseNumber: 1,
      attemptId: 'attempt-phase-01-a',
      transactionId: 'txn-phase-01-a',
      blockerClass: 'verification_environment_unavailable',
      blockerCode: 'spawn_eperm',
      command: 'node --test .claude/scripts/verify-phase-closeout.test.mjs',
      stderr: 'Error: spawn EPERM',
      detail: 'node --test spawn EPERM blocked verifier execution',
      createdAt: '2026-05-08T11:59:00Z',
      updatedAt: '2026-05-08T11:59:00Z',
    })}\n`, 'utf8');
    fs.writeFileSync(attemptLedgerPath, `${JSON.stringify({
      attemptId: 'attempt-phase-01-a',
      transactionId: 'txn-phase-01-a',
      phaseNumber: 1,
      status: 'blocked',
      blockerEvidenceId: 'blocker-spawn-eperm',
      createdAt: '2026-05-08T11:59:00Z',
      updatedAt: '2026-05-08T11:59:00Z',
    })}\n`, 'utf8');
  }
  fs.writeFileSync(projectionManifestPath, `${JSON.stringify({
    schemaVersion: 'terminal-blocker-projection-manifest-v1',
    transactionId: 'txn-phase-01-a',
    attemptId: 'attempt-phase-01-a',
    phaseNumber: 1,
    blockerEvidenceIds: ['blocker-spawn-eperm'],
    attemptLedgerKeys: ['attempt-phase-01-a:txn-phase-01-a'],
  }, null, 2)}\n`, 'utf8');
}

test('phase closeout fails when a completed phase is unchecked in the master checklist', () => {
  withFixture({ checklistChecked: false }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'master-checklist-not-checked');
  });
});

test('phase closeout fails when no explicit master plan path is supplied', () => {
  withFixture({}, (root) => {
    const result = evaluatePhaseCloseout({
      statusFile: path.join(root, '.claude/docs/phase-status.yaml'),
      planDir: path.join(root, 'docs/implementation'),
    });

    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'master_plan_missing');
    assert.ok(result.violations.some((violation) => violation.code === 'master_plan_missing'));
    assert.ok(result.violations.some((violation) => violation.message.includes('default fallback is disabled')));
  });
});

test('phase event ledger rejects events missing required schema fields', () => {
  const validation = validatePhaseEvent({
    eventVersion: 1,
    eventType: 'phase.status.updated',
    phaseId: '1',
    source: 'test',
    payload: { status: 'completed' },
    timestamp: '2026-05-10T00:00:00Z',
  });

  assert.equal(validation.ok, false);
  assert.ok(validation.errors.some((error) => error.includes('missing runId')));
  assert.ok(validation.errors.some((error) => error.includes('missing contractSnapshotId')));
});

test('phase event ledger replay reconstructs lifecycle sequence', () => {
  const events = [
    eventFixture('contract.created', { contractPath: 'SPRINT_CONTRACT.md' }),
    eventFixture('workset.started', { taskId: 'AT-01' }),
    eventFixture('workset.completed', { taskId: 'AT-01' }),
    eventFixture('verification.passed', { verdictPath: '.claude/verification-verdict-phase01-final.json' }),
    eventFixture('closeout.normalized', { status: 'clean_finish' }),
    eventFixture('phase.status.updated', { status: 'completed' }),
  ];

  const replay = replayPhaseEvents(events, '1');

  assert.equal(replay.status, 'completed');
  assert.equal(replay.worksets.get('AT-01'), 'completed');
  assert.equal(replay.verificationVerdict, 'passed');
  assert.equal(replay.closeoutStatus, 'clean_finish');
});

test('phase closeout fails when event replay and phase status read model disagree', () => {
  withFixture({}, (root) => {
    appendPhaseEvent(defaultPhaseEventLedgerPath(path.join(root, '.claude/docs/phase-status.yaml')), eventFixture('phase.status.updated', {
      status: 'in_progress',
    }));

    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((violation) => violation.code === 'event-ledger-read-model-mismatch'));
  });
});

test('phase closeout fails when an explicit master plan path is missing', () => {
  withFixture({}, (root) => {
    const result = evaluatePhaseCloseout({
      statusFile: path.join(root, '.claude/docs/phase-status.yaml'),
      planDir: path.join(root, 'docs/implementation'),
      masterPlan: path.join(root, 'docs/implementation/missing-master-plan.md'),
      masterPlanProvided: true,
    });

    assert.equal(result.allowed, false);
    assert.equal(result.reason, 'master_plan_missing');
    assert.ok(result.violations.some((violation) => violation.code === 'master_plan_missing'));
    assert.ok(result.violations.some((violation) => violation.message.includes('missing-master-plan.md')));
  });
});

test('phase closeout fails when archivedPhaseDoc is missing', () => {
  withFixture({ archived: false }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((violation) => violation.code === 'artifact_path_missing'));
  });
});

test('phase closeout fails when critical scenario evidence is missing', () => {
  withFixture({ scenarioEvidence: false }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((violation) => violation.code === 'artifact_path_missing'));
  });
});

test('phase closeout fails when requirements traceability artifacts are missing', () => {
  withFixture({ traceability: false }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, false);
    assert.ok(result.violations.filter((violation) => violation.code === 'artifact_path_missing').length >= 2);
  });
});

test('phase closeout fails when completed phase WORKSETS still has in-progress atomic tasks', () => {
  withFixture({ incompleteWorksets: true }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((violation) => violation.code === 'atomic-tasks-incomplete'));
  });
});

test('phase closeout fails when completed phase has zero attempts', () => {
  withFixture({ zeroAttemptCompletion: true }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((violation) => violation.code === 'missing-phase-attempt-evidence'));
  });
});

test('phase closeout fails when completed phase attempt metadata is non-terminal', () => {
  withFixture({ missingTerminalAttemptOutcome: true, missingTerminalTimingStage: true }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((violation) => violation.code === 'completed-attempt-outcome-not-terminal'));
    assert.ok(result.violations.some((violation) => violation.code === 'completed-timing-stage-not-terminal'));
  });
});

test('phase closeout fails when completed phase lacks passing conformance evidence', () => {
  withFixture({ planConformanceEvidence: false }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((violation) => violation.code === 'plan-conformance-not-passed'));
  });
});

test('phase closeout fails with a distinct code when AC verdict is incomplete', () => {
  withFixture({ incompleteAcWorksets: true }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((violation) => violation.code === 'atomic-task-ac-verdict-incomplete'));
    assert.ok(!result.violations.some((violation) => violation.code === 'atomic-tasks-incomplete'));
  });
});

test('phase closeout fails with a distinct code when AC verdict failed', () => {
  withFixture({ failedAcWorksets: true }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((violation) => violation.code === 'atomic-task-ac-verdict-failed'));
    assert.ok(!result.violations.some((violation) => violation.code === 'atomic-tasks-incomplete'));
  });
});

test('phase closeout keeps legacy completed WORKSETS compatible', () => {
  withFixture({ legacyCompletedWorksets: true }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, true);
    assert.equal(result.status, 'pass');
  });
});

test('phase closeout fails completed phase with canonical open sidecar blocker', () => {
  withFixture({ legacyCompletedWorksets: true }, (root) => {
    writeSidecarFixture(root, { status: 'open' });

    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((violation) => violation.code === 'sidecar-open-blocker'));
  });
});

test('phase closeout allows legacy verifier only when no sidecar or manifest exists', () => {
  withFixture({ legacyCompletedWorksets: true }, (root) => {
    writeSidecarFixture(root, { manifestOnly: true });

    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((violation) => violation.code === 'manifest-sidecar-missing'));
  });
});

test('phase closeout reports manifest id mismatch in sidecar canonical mode', () => {
  withFixture({ legacyCompletedWorksets: true }, (root) => {
    writeSidecarFixture(root, { status: 'resolved' });
    fs.writeFileSync(
      path.join(root, 'docs/implementation/execution/01-feature/projection-manifest.json'),
      `${JSON.stringify({
        blockerEvidenceIds: ['missing-blocker'],
        attemptLedgerKeys: ['attempt-phase-01-a:txn-phase-01-a'],
      }, null, 2)}\n`,
      'utf8',
    );

    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((violation) => violation.code === 'sidecar-manifest-mismatch'));
  });
});

test('phase closeout accepts resolved historical sidecar blocker', () => {
  withFixture({ legacyCompletedWorksets: true }, (root) => {
    writeSidecarFixture(root, { status: 'resolved' });

    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, true);
    assert.equal(result.status, 'pass');
  });
});

test('phase closeout ignores mutable compatibility projection hash drift in sidecar manifest', () => {
  withFixture({ legacyCompletedWorksets: true }, (root) => {
    writeSidecarFixture(root, { status: 'resolved' });
    const workflowDir = path.join(root, '.claude/logs/workflow-enforcement');
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.writeFileSync(path.join(workflowDir, 'current-run.json'), '{"status":"completed","completionStatus":"completed","childAlive":false}\n', 'utf8');
    fs.writeFileSync(
      path.join(root, 'docs/implementation/execution/01-feature/projection-manifest.json'),
      `${JSON.stringify({
        blockerEvidenceIds: ['blocker-spawn-eperm'],
        attemptLedgerKeys: ['attempt-phase-01-a:txn-phase-01-a'],
        files: [
          {
            path: '.claude/logs/workflow-enforcement/current-run.json',
            kind: 'current-run',
            sha256: 'intentionally-stale-mutable-projection-hash',
          },
        ],
      }, null, 2)}\n`,
      'utf8',
    );

    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, true);
    assert.equal(result.status, 'pass');
  });
});

test('manifest-intent-without-exit-is-incomplete', () => {
  withFixture({ legacyCompletedWorksets: true }, (root) => {
    const intent = writeAttemptManifestIntent({
      executionRoot: path.join(root, 'docs/implementation/execution/02-completion-gate'),
      phaseNumber: 2,
      phaseSlug: '02-completion-gate',
      attemptId: 'attempt-phase-02-a',
      runnerStartedAt: '2026-05-08T11:58:00Z',
      promptHash: 'prompt-hash',
      commandHash: 'command-hash',
      runnerLogPath: '.claude/logs/agent-loop/phase-2.log',
    });
    writePhase2CompletedFixture(root, { manifestPath: path.relative(root, intent.manifestPath) });

    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((violation) => violation.code === 'incomplete_attempt_manifest'));
  });
});

test('runner-log-without-manifest-rejected', () => {
  withFixture({ legacyCompletedWorksets: true }, (root) => {
    const workflowDir = path.join(root, '.claude/logs/workflow-enforcement');
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.writeFileSync(path.join(workflowDir, 'current-run.json'), JSON.stringify({
      runId: 'runner-log-only',
      status: 'completed',
      completionStatus: 'completed',
      activePhaseNumber: 2,
    }, null, 2), 'utf8');
    writePhase2CompletedFixture(root);

    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((violation) => violation.code === 'orphan_projection_completion'));
  });
});

test('phase-status-only-completion-rejected', () => {
  withFixture({ legacyCompletedWorksets: true }, (root) => {
    writePhase2CompletedFixture(root);

    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((violation) => violation.code === 'orphan_projection_completion'));
  });
});

test('direct-pass-only-completion-rejected', () => {
  withFixture({ legacyCompletedWorksets: true }, (root) => {
    writePhase2CompletedFixture(root);
    fs.appendFileSync(
      path.join(root, 'docs/implementation/execution/02-completion-gate/QA_REPORT.md'),
      '- Direct-pass artifact: pass without canonical attempt manifest.\n',
      'utf8',
    );

    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((violation) => violation.code === 'orphan_projection_completion'));
  });
});

test('adopted-but-unverified fixture fails completed gate', () => {
  withFixture({ legacyCompletedWorksets: true }, (root) => {
    writePhase2CompletedFixture(root);
    fs.writeFileSync(
      path.join(root, 'docs/implementation/execution/02-completion-gate/adoption-metadata.json'),
      `${JSON.stringify({
        schemaVersion: 1,
        adoptedBy: 'codex-test',
        adoptionReason: 'manual review of orphan projection',
        reconciledFrom: 'orphan_projection',
        sourceProjectionPaths: ['.claude/logs/workflow-enforcement/current-run.json'],
        reverificationCommands: [
          {
            command: 'node --test .claude/scripts/verify-phase-closeout.test.mjs',
            cwd: 'repository root',
            expectedSignal: 'exit 0',
          },
        ],
        completionStatus: 'adopted_but_unverified',
        verifierPassRequired: true,
      }, null, 2)}\n`,
      'utf8',
    );

    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((violation) => violation.code === 'adopted-but-unverified'));
  });
});

test('phase closeout allows explicit AC not_applicable without AC evidence', () => {
  withFixture({ notApplicableAcWorksets: true }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, true);
    assert.equal(result.status, 'pass');
  });
});

test('phase closeout fails when delegated terminal failed but local fallback completed', () => {
  withFixture({ delegatedFailedLocalFallbackCompleted: true }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assertCloseoutViolation(result, 'delegated-failed-local-fallback-completed');
  });
});

test('phase closeout fails when current-run is failed but phase-status is completed', () => {
  withFixture({ currentRunFailedPhaseCompleted: true }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assertCloseoutViolation(result, 'current-run-failed-phase-completed');
  });
});

test('phase closeout reads active and latest workflow state contradictions', () => {
  withFixture({ activePhaseRunFailedPhaseCompleted: true, latestDispatchFailedPhaseCompleted: true }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assertCloseoutViolation(result, 'active-phase-run-failed-phase-completed');
    assertCloseoutViolation(result, 'latest-dispatch-failed-phase-completed');
  });
});

test('phase closeout treats failed dispatch with final complete verdict as historical warning', () => {
  withFixture({ latestDispatchFailedButFinalComplete: true }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, true);
    assert.equal(result.status, 'pass');
    assert.ok(!result.violations.some((violation) => violation.code === 'latest-dispatch-failed-phase-completed'));
  });
});

test('phase closeout accepts explicitly superseded local fallback workflow state', () => {
  withFixture({ supersededLocalFallbackWorkflowState: true }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, true);
    assert.equal(result.status, 'pass');
  });
});

test('phase closeout fails when latest dispatch remains prepared after completion', () => {
  withFixture({ latestDispatchPreparedAfterCompletion: true }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assertCloseoutViolation(result, 'latest-dispatch-stale-after-completion');
    assert.ok(result.violations.some((violation) => violation.failureClass === 'harness-state'));
  });
});

test('phase closeout does not let an active blocked phase poison completed phase closeout', () => {
  withFixture({ activeBlockedWorkflowStateWithCompletedPhase: true }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, true);
    assert.equal(result.status, 'pass');
    assert.ok(!result.violations.some((violation) => violation.code === 'current-run-failed-phase-completed'));
    assert.ok(!result.violations.some((violation) => violation.code === 'active-phase-run-failed-phase-completed'));
    assert.ok(!result.violations.some((violation) => violation.code === 'latest-dispatch-running-phase-completed'));
    assert.ok(result.degradedEvidence.some((entry) => (
      entry.code === 'active_phase_blocked_workflow_state'
      && entry.phaseNumber === 2
      && entry.failureClass === 'verifier_unavailable'
    )));
  });
});

test('phase closeout allows the current in-progress phase to run while earlier phases are completed', () => {
  withFixture({ activeRunningWorkflowStateWithCompletedPhase: true }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, true);
    assert.equal(result.status, 'pass');
    assert.ok(!result.violations.some((violation) => violation.code === 'current-run-running-phase-completed'));
    assert.ok(!result.violations.some((violation) => violation.code === 'active-phase-run-running-phase-completed'));
    assert.ok(!result.violations.some((violation) => violation.code === 'latest-dispatch-running-phase-completed'));
  });
});

test('phase closeout records non-strict MemoryGraph unavailability as degraded evidence', () => {
  withFixture({ memorygraphUnavailable: true }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, true);
    assert.equal(result.status, 'pass');
    assert.equal(result.degradedEvidence.some((entry) => entry.code === 'memorygraph_unavailable'), true);
  });
});

test('phase closeout blocks strict MemoryGraph verification unavailability', () => {
  withFixture({ memorygraphUnavailable: true, memorygraphStrict: true }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assertCloseoutViolation(result, 'memorygraph-unavailable-strict');
    assert.ok(result.violations.some((violation) => violation.failureClass === 'environment-permission'));
  });
});

test('phase closeout supports an explicit workflowDir option', () => {
  withFixture({}, (root) => {
    const workflowDir = path.join(root, 'custom-workflow');
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.writeFileSync(path.join(workflowDir, 'current-run.json'), JSON.stringify({
      runId: 'custom-failed-run',
      status: 'failed',
      completionStatus: 'failed',
    }, null, 2));

    const result = evaluatePhaseCloseout({
      ...config(root),
      workflowDir,
    });

    assertCloseoutViolation(result, 'current-run-failed-phase-completed');
  });
});

test('phase closeout fails when completed status keeps a stale activeRunLeaseId', () => {
  withFixture({ staleActiveRunLeaseId: true }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assertCloseoutViolation(result, 'stale-active-run-lease');
  });
});

test('phase closeout allows root activeRunLeaseId for the next active phase', () => {
  withFixture({}, (root) => {
    const statusFile = path.join(root, '.claude/docs/phase-status.yaml');
    const statusText = fs.readFileSync(statusFile, 'utf8');
    fs.writeFileSync(
      statusFile,
      statusText
        .replace(
          'planDir: "docs/implementation"',
          [
            'planDir: "docs/implementation"',
            'activePhaseNumber: 2',
            'activeRunLeaseId: "active-phase-2-run"',
          ].join('\n'),
        )
        .replace(/\s*$/, '')
        + [
          '',
          '  - number: 2',
          '    title: "Phase 02: Next"',
          '    status: in_progress',
          '',
        ].join('\n'),
      'utf8',
    );

    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, true);
    assert.ok(!result.violations.some((violation) => violation.code === 'stale-active-run-lease'));
  });
});

test('phase closeout uses explicit legacy verdict mode before current pointer phase completes', () => {
  withFixture({}, (root) => {
    fs.rmSync(path.join(root, '.claude/logs/workflow-enforcement/current-artifacts.json'), { force: true });

    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, true);
    assert.equal(result.status, 'pass');
  });
});

test('phase closeout accepts workflow state for an active non-completed phase', () => {
  withFixture({}, (root) => {
    const statusFile = path.join(root, '.claude/docs/phase-status.yaml');
    const statusText = fs.readFileSync(statusFile, 'utf8');
    fs.writeFileSync(
      statusFile,
      statusText
        .replace(
          'planDir: "docs/implementation"',
          [
            'planDir: "docs/implementation"',
            'activePhaseNumber: 2',
            'activeRunLeaseId: "active-phase-2-run"',
          ].join('\n'),
        )
        .replace(/\s*$/, '')
        + [
          '',
          '  - number: 2',
          '    title: "Phase 02: Next"',
          '    status: in_progress',
          '',
        ].join('\n'),
      'utf8',
    );
    const workflowDir = path.join(root, '.claude/logs/workflow-enforcement');
    fs.writeFileSync(path.join(workflowDir, 'current-run.json'), JSON.stringify({
      runId: 'active-phase-2-run',
      status: 'completed',
      completionStatus: 'completed',
      activePhaseNumber: 1,
      activePhaseTitle: 'Phase 01: Feature',
      phaseRunLease: {
        phase: {
          number: '2',
          title: 'Phase 02: Next',
        },
      },
    }, null, 2));

    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, true);
    assert.ok(!result.violations.some((violation) => violation.code === 'harness-state-phase-id-mismatch'));
    assert.ok(!result.violations.some((violation) => violation.code === 'harness-state-phase-title-mismatch'));
  });
});

test('phase closeout fails when current-run is still running after phase completion', () => {
  withFixture({ currentRunRunningPhaseCompleted: true }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assertCloseoutViolation(result, 'current-run-running-phase-completed');
  });
});

test('phase closeout fails deterministically for timestamps beyond the injected clock tolerance', () => {
  withFixture({ futureTimestamp: true, fixedNow: '2026-05-08T12:00:00.000Z' }, (root) => {
    const result = evaluatePhaseCloseout({
      ...config(root),
      now: '2026-05-08T12:00:00.000Z',
    });

    assertCloseoutViolation(result, 'future-timestamp');
  });
});

test('phase closeout fails for future workflow timestamps', () => {
  withFixture({ workflowFutureTimestamp: true }, (root) => {
    const result = evaluatePhaseCloseout({
      ...config(root),
      now: '2026-05-08T12:00:00.000Z',
    });

    assertCloseoutViolation(result, 'future-timestamp');
  });
});

test('phase closeout ignores stale verdict identity for older phase context', () => {
  withFixture({ staleVerdictIdentity: true }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assertCloseoutViolation(result, 'verification-verdict-stale');
  });
});

test('phase closeout allows completedAt timestamps inside the five-second clock tolerance', () => {
  withFixture({ futureTimestamp: true }, (root) => {
    const result = evaluatePhaseCloseout({
      ...config(root),
      now: '2026-05-08T12:00:00.001Z',
    });

    assert.equal(result.allowed, true);
    assert.equal(result.status, 'pass');
  });
});

test('phase closeout fails when session task_complete contradicts failed workflow state', () => {
  withFixture({ sessionTaskCompleteWorkflowFailed: true }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assertCloseoutViolation(result, 'session-task-complete-workflow-failed');
  });
});

test('phase closeout supports explicit session jsonl fixture path', () => {
  withFixture({ currentRunFailedPhaseCompleted: true }, (root) => {
    const sessionFile = path.join(root, 'custom-session.jsonl');
    fs.writeFileSync(sessionFile, `${JSON.stringify({ type: 'assistant', phase: 'commentary', event: 'task_complete' })}\n`);

    const result = evaluatePhaseCloseout({
      ...config(root),
      sessionFile,
    });

    assertCloseoutViolation(result, 'session-task-complete-workflow-failed');
  });
});

test('phase closeout fails when environment-blocked smoke evidence claims plan complete', () => {
  withFixture({ environmentBlockedSmokePlanComplete: true }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assertCloseoutViolation(result, 'environment-blocked-smoke-plan-complete');
  });
});

test('evaluation trigger pipeline blocks semantic pass over mechanical failure', () => {
  const violations = validateEvaluationTriggerPipelineEvidence([
    '## Verdict',
    '- Next path: clean_finish',
    '',
    '## Workflow Execution',
    '- Validation profile: workflow_core',
    '',
    '## Evaluation Trigger Evidence',
    '- Semantic triggers: ac ambiguity, scope drift, architecture risk, security risk, auth risk, payment risk, repeated failure, user value unclear',
    '- Consensus triggers: contract reinterpretation, high-risk security, high-risk architecture, evaluator disagreement',
    '- Mechanical checks: failed',
    '- Semantic evaluation: pass',
    '- Skipped mechanical checks: none',
    '- Verification override: allowlisted',
    '- QA backend matrix: browser optional available; a11y optional available; visual optional available; performance optional available',
  ].join('\n'), 'QA_REPORT.md');

  assert.ok(violations.some((violation) => violation.includes('mechanical failure cannot be converted')));
});

test('phase closeout requires evaluation trigger evidence when the phase declares the pipeline', () => {
  withFixture({ evaluationPipeline: true, evaluationEvidence: false }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assertCloseoutViolation(result, 'evaluation-trigger-evidence-missing');
  });
});

test('phase closeout accepts complete evaluation trigger evidence', () => {
  withFixture({ evaluationPipeline: true, evaluationEvidence: true }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, true);
    assert.equal(result.status, 'pass');
  });
});

test('phase closeout accepts in-progress environment-blocked normalized verdict with blocker payload', () => {
  withFixture({
    checklistChecked: false,
    environmentBlockedSmokePlanComplete: true,
    environmentBlockedNormalizedInProgress: true,
  }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, true);
    assert.equal(result.status, 'pass');
  });
});

test('phase status fixture records environmentBlockers for environment-blocked completion verdict', () => {
  withFixture({ checklistChecked: false, environmentBlockedNormalizedInProgress: true }, (root) => {
    const statusFile = path.join(root, '.claude/docs/phase-status.yaml');
    const text = fs.readFileSync(statusFile, 'utf8');
    assert.match(text, /normalizedRunVerdict:\s+complete_with_environment_blocker/);
    assert.match(text, /environmentBlockers:/);
    assert.match(text, /check:\s+external_provider_smoke/);
    assert.match(text, /reason:\s+"external provider smoke credential blocked"/);
  });
});

test('phase status root records verifier spawn EPERM blocker metadata', () => {
  withFixture({ checklistChecked: false }, (root) => {
    const statusFile = path.join(root, '.claude/docs/phase-status.yaml');
    setRootRunVerdict(
      statusFile,
      'blocked',
      'parent_reverify_required',
      'phase-status=verification_blocked | blocker=verifier_unavailable | command=node --test .claude/scripts/lib/current-artifacts-state.test.mjs | spawn EPERM',
      'verification-preflight-blocked',
      'runtime_fallback_or_handoff',
      'verification_environment_unavailable',
      'verification_environment_unavailable',
      'verification_environment_unavailable',
    );

    const text = fs.readFileSync(statusFile, 'utf8');
    assert.match(text, /normalizedRunVerdict:\s+blocked/);
    assert.match(text, /stopReasonClass:\s+parent_reverify_required/);
    assert.match(text, /parentReverifyStatus:\s+required/);
    assert.match(text, /rawStopReason:\s+verification-preflight-blocked/);
    assert.match(text, /blockerClass:\s+verification_environment_unavailable/);
    assert.match(text, /blockingReasonCode:\s+verification_environment_unavailable/);
    assert.match(text, /failureClass:\s+verification_environment_unavailable/);
    assert.match(text, /spawn EPERM/);
  });
});

test('parent reverify pass clears active verifier blocker and keeps historical warning', () => {
  withFixture({}, (root) => {
    const statusFile = path.join(root, '.claude/docs/phase-status.yaml');
    setRootRunVerdict(
      statusFile,
      'blocked',
      'parent_reverify_required',
      'phase-status=verification_blocked | command=node --test .claude/scripts/verify-phase-closeout.test.mjs | spawn EPERM',
      'verification-preflight-blocked',
      'runtime_fallback_or_handoff',
      'verification_environment_unavailable',
      'verification_environment_unavailable',
      'verification_environment_unavailable',
    );
    setRootRunVerdict(
      statusFile,
      'parent_reverify_passed',
      'parent_reverify_passed',
      'parent reverify passed in current session; verifier blocker retained as historical warning',
      '',
      'continue',
      '',
      '',
      '',
    );

    const text = fs.readFileSync(statusFile, 'utf8');
    assert.match(text, /normalizedRunVerdict:\s+parent_reverify_passed/);
    assert.match(text, /parentReverifyStatus:\s+passed/);
    assert.match(text, /nonBlockingWarnings:/);
    assert.match(text, /code:\s+verification_environment_unavailable/);
    assert.doesNotMatch(text, /^blockerClass:/m);
    assert.doesNotMatch(text, /^blockingReasonCode:/m);
    assert.doesNotMatch(text, /^failureClass:/m);

    const result = evaluatePhaseCloseout(config(root));
    assert.equal(result.allowed, true);
    assert.equal(result.status, 'pass');
  });
});

test('plan conformance fails on unapproved alternative implementation language', () => {
  withFixture({ qaExtra: '- Note: alternative implementation used for the renderer.' }, (root) => {
    const result = evaluatePlanConformance({
      phaseDocPath: path.join(root, 'docs/implementation/close/01-feature.md'),
      sprintContractPath: path.join(root, 'docs/implementation/execution/01-feature/SPRINT_CONTRACT.md'),
      qaReportPath: path.join(root, 'docs/implementation/execution/01-feature/QA_REPORT.md'),
      scorecardPath: path.join(root, 'docs/implementation/execution/01-feature/SCORECARD.md'),
      handoffPath: path.join(root, 'docs/implementation/execution/01-feature/HANDOFF.md'),
    });

    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((violation) => violation.code === 'unapproved-deferred-scope'));
  });
});

test('phase closeout passes when artifacts, verdict, score, archive, and scenarios agree', () => {
  withFixture({}, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, true);
    assert.equal(result.status, 'pass');
  });
});

test('phase closeout prefers structured evidence metadata over stale free-form markdown', () => {
  withFixture({
    traceability: false,
    markdownContradictsStructuredEvidence: true,
    structuredEvidenceMetadata: {
      schemaVersion: 'phase-closeout-evidence-v1',
      requirements: {
        'REQ-01-1': { status: 'verified', evidencePath: 'QA_REPORT.md' },
      },
      scenarios: {
        'SCN-01-1': { status: 'passed', evidencePath: 'QA_REPORT.md' },
      },
      blockers: [],
    },
  }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, true);
    assert.equal(result.status, 'pass');
  });
});

test('phase closeout does not let markdown pass override structured scenario failure', () => {
  withFixture({
    structuredEvidenceMetadata: {
      schemaVersion: 'phase-closeout-evidence-v1',
      requirements: {
        'REQ-01-1': { status: 'verified', evidencePath: 'QA_REPORT.md' },
      },
      scenarios: {
        'SCN-01-1': { status: 'failed', evidencePath: 'QA_REPORT.md' },
      },
      blockers: [],
    },
  }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((violation) => violation.message.includes('SCN-01-1')));
  });
});

test('phase closeout rejects remediation packet as the only structured scenario evidence', () => {
  withFixture({
    scenarioEvidence: false,
    structuredEvidenceMetadata: {
      schemaVersion: 'phase-closeout-evidence-v1',
      requirements: {
        'REQ-01-1': { status: 'verified', evidencePath: 'QA_REPORT.md' },
      },
      scenarios: {
        'SCN-01-1': { status: 'passed', evidencePath: 'docs/implementation/execution/01-feature/remediation-request.json' },
      },
      blockers: [],
    },
  }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((violation) => violation.message.includes('SCN-01-1')));
  });
});

test('phase closeout rejects remediation packet as the only markdown scenario evidence', () => {
  withFixture({
    scenarioEvidence: false,
    qaExtra: 'SCN-01-1 | passed | docs/implementation/execution/01-feature/remediation-request.json',
  }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((violation) => violation.message.includes('SCN-01-1')));
  });
});

test('phase closeout accepts expected_blocker_passed as fresh non-blocking verdict', () => {
  withFixture({ expectedBlockerPassedVerdict: true }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, true);
    assert.equal(result.status, 'pass');
  });
});

test('phase closeout blocks harness script changes without Harness Change Ledger', () => {
  withFixture({ harnessChangedPaths: ['.claude/scripts/fixture.mjs'] }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assertCloseoutViolation(result, 'harness-change-ledger-missing');
    assert.ok(result.violations.some((violation) => violation.message.includes('.claude/scripts/fixture.mjs')));
  });
});

test('phase closeout accepts harness script changes with plan Harness Change Ledger', () => {
  withFixture({
    harnessChangedPaths: ['.claude/scripts/fixture.mjs', '.claude/verification.contract.yaml'],
    harnessChangeLedger: true,
  }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, true);
    assert.equal(result.status, 'pass');
    assert.ok(!result.violations.some((violation) => violation.code === 'harness-change-ledger-missing'));
  });
});

test('phase closeout blocks strict harness changes without structured CRG QA evidence', () => {
  withFixture({
    harnessChangedPaths: ['.claude/scripts/fixture.mjs'],
    harnessChangeLedger: true,
    qaExtra: [
      '## Workflow Execution',
      '- Validation profile: workflow_core',
    ].join('\n'),
  }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assertCloseoutViolation(result, 'code-review-graph-evidence-missing');
  });
});

test('phase closeout blocks duplicate CRG QA marker blocks in strict mode', () => {
  const marker = [
    '# code-review-graph-stage:begin',
    'analysisContext:',
    '  codeReviewGraph:',
    '    graphStatus: fresh',
    '    stageCoverage: finish',
    '    evidenceCarrier: phase',
    '    adapterRunId: crg-fixture',
    '    adapterArtifact: docs/implementation/execution/01-feature/evidence/code-review-graph/crg-fixture.json',
    '    adapterArtifactDigest: abc123',
    '    updatedAt: 2026-05-13T12:00:00Z',
    '# code-review-graph-stage:end',
  ].join('\n');
  withFixture({
    harnessChangedPaths: ['.claude/scripts/fixture.mjs'],
    harnessChangeLedger: true,
    qaExtra: [
      '## Workflow Execution',
      '- Validation profile: workflow_core',
      marker,
      marker,
    ].join('\n'),
  }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assertCloseoutViolation(result, 'code-review-graph-evidence-invalid');
  });
});

test('phase closeout fails when a structured verdict contradicts itself', () => {
  withFixture({ inconsistentVerdict: true }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, false);
    assert.ok(result.violations.some((violation) => violation.code === 'verification-verdict-inconsistent'));
  });
});

test('completion gate taxonomy classifies review, finish, verification, environment, and score gaps', () => {
  assertGateClassification('review-incomplete', {
    category: 'review_closeout_missing',
    stopReason: 'missing-review-evidence',
    remediationStage: 'review',
    retryPolicy: 'writer_only',
  });
  assertGateClassification('missing-finish-closeout', {
    category: 'finish_closeout_missing',
    stopReason: 'missing-finish-closeout',
    remediationStage: 'finish/handoff',
    retryPolicy: 'writer_only',
  });
  assertGateClassification('missing-fresh-verification-evidence', {
    category: 'verification_missing',
    stopReason: 'missing-fresh-verification-evidence',
    remediationStage: 'verify',
    retryPolicy: 'verification_remediation',
  });
  assertGateClassification('scorecard-score-below-target', {
    category: 'score_incomplete',
    stopReason: 'missing-fresh-verification-evidence',
    remediationStage: 'verify',
    retryPolicy: 'limited_retry',
  });
  assertGateClassification('blocked:verification-preflight-blocked', {
    category: 'environment_blocked',
    stopReason: 'blocked:verification-preflight-blocked',
    remediationStage: 'verify',
    retryPolicy: 'stop_loop',
  });
  assertGateClassification('scorecard-verdict=blocked', {
    category: 'terminal_blocked',
    stopReason: 'blocked:scorecard-verdict-blocked',
    remediationStage: 'finish/handoff',
    retryPolicy: 'stop_loop',
  });
  assertGateClassification('scorecard-verdict=retry', {
    category: 'score_incomplete',
    stopReason: 'missing-fresh-verification-evidence',
    remediationStage: 'verify',
    retryPolicy: 'limited_retry',
  });
  const verifierScorecard = classifyCompletionGateReason('scorecard-verdict=blocked', {
    blockingReasonCode: 'verification_environment_unavailable',
  });
  assert.equal(verifierScorecard.category, 'environment_blocked');
  assert.equal(verifierScorecard.stopReason, 'blocked:verification_environment_unavailable');
  assert.equal(verifierScorecard.retryPolicy, 'stop_loop');

  const verifierRetryScorecard = classifyCompletionGateReason('scorecard-verdict=retry', {
    blockingReasonCode: 'node-test-spawn-eperm',
    blockerClass: 'verifier_unavailable',
    failureClass: 'environment',
  });
  assert.equal(verifierRetryScorecard.category, 'environment_blocked');
  assert.equal(verifierRetryScorecard.stopReason, 'blocked:verification_environment_unavailable');
  assert.equal(verifierRetryScorecard.retryPolicy, 'stop_loop');
});

test('finish bundle missing uses exactly one artifact-only remediation before hard stop', () => {
  const first = decideMissingEvidence(1, 'workflow-finish-bundle-missing');
  const second = decideMissingEvidence(2, 'workflow-finish-bundle-missing');

  assert.equal(first.ACTION, 'finish-remediation');
  assert.equal(second.ACTION, 'stop-loop');
  assert.equal(second.SUMMARY, 'workflow-finish-bundle-missing');
});

function assertGateClassification(reason, expected) {
  const result = classifyCompletionGateReason(reason);
  assert.equal(result.category, expected.category);
  assert.equal(result.stopReason, expected.stopReason);
  assert.equal(result.remediationStage, expected.remediationStage);
  assert.equal(result.retryPolicy, expected.retryPolicy);
}

function decideMissingEvidence(autoFixCount, reason) {
  return decideMissingEvidenceAction({
    autoFixCount,
    maxAutoFixAttempts: 3,
    autonomousMode: true,
    advanceOnFailure: false,
    finalStopReason: reason,
  });
}

function assertCloseoutViolation(result, code) {
  assert.equal(result.allowed, false);
  assert.ok(
    result.violations.some((violation) => violation.code === code),
    `expected closeout violation ${code}; got ${result.violations.map((violation) => violation.code).join(', ')}`
  );
}
