import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCompletionGateReason, decideMissingEvidenceAction } from './agent-loop-phase-attempt.mjs';
import { evaluatePlanConformance } from './verify-plan-conformance.mjs';
import { evaluatePhaseCloseout } from './verify-phase-closeout.mjs';

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

test('phase closeout accepts explicitly superseded local fallback workflow state', () => {
  withFixture({ supersededLocalFallbackWorkflowState: true }, (root) => {
    const result = evaluatePhaseCloseout(config(root));

    assert.equal(result.allowed, true);
    assert.equal(result.status, 'pass');
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

test('phase closeout fails deterministically for timestamps beyond the injected clock tolerance', () => {
  withFixture({ futureTimestamp: true, fixedNow: '2026-05-08T12:00:00.000Z' }, (root) => {
    const result = evaluatePhaseCloseout({
      ...config(root),
      now: '2026-05-08T12:00:00.000Z',
    });

    assertCloseoutViolation(result, 'future-timestamp');
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
});

test('finish bundle missing uses exactly one artifact-only remediation before hard stop', () => {
  const first = decideMissingEvidence(1, 'workflow-finish-bundle-missing');
  const second = decideMissingEvidence(2, 'workflow-finish-bundle-missing');

  assert.equal(first.ACTION, 'finish-remediation');
  assert.equal(second.ACTION, 'stop-loop');
  assert.equal(second.SUMMARY, 'workflow-finish-bundle-missing');
});

function config(root) {
  return {
    statusFile: path.join(root, '.claude/docs/phase-status.yaml'),
    planDir: path.join(root, 'docs/implementation'),
    masterPlan: path.join(root, 'docs/implementation/00-master-plan-v1.md'),
  };
}

function withFixture(options, callback) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-closeout-'));
  const previousCwd = process.cwd();

  try {
    writeFixture(root, options);
    process.chdir(root);
    callback(root);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeFixture(root, options = {}) {
  const settings = {
    checklistChecked: true,
    archived: true,
    scenarioEvidence: true,
    traceability: true,
    qaExtra: '',
    inconsistentVerdict: false,
    incompleteWorksets: false,
    delegatedFailedLocalFallbackCompleted: false,
    currentRunFailedPhaseCompleted: false,
    activePhaseRunFailedPhaseCompleted: false,
    latestDispatchFailedPhaseCompleted: false,
    supersededLocalFallbackWorkflowState: false,
    staleActiveRunLeaseId: false,
    futureTimestamp: false,
    fixedNow: '2026-05-08T12:00:00.000Z',
    sessionTaskCompleteWorkflowFailed: false,
    environmentBlockedSmokePlanComplete: false,
    environmentBlockedNormalizedInProgress: false,
    ...options,
  };
  const docsDir = path.join(root, 'docs/implementation');
  const closeDir = path.join(docsDir, 'close');
  const executionDir = path.join(docsDir, 'execution/01-feature');
  const claudeDir = path.join(root, '.claude');

  fs.mkdirSync(closeDir, { recursive: true });
  fs.mkdirSync(executionDir, { recursive: true });
  fs.mkdirSync(path.join(claudeDir, 'docs'), { recursive: true });

  fs.writeFileSync(
    path.join(docsDir, '00-master-plan-v1.md'),
    [
      '# Master Plan',
      '',
      '## Phase Completion Checklist',
      `- [${settings.checklistChecked ? 'x' : ' '}] Phase 01 - Feature (\`docs/implementation/01-feature.md\`)`,
      '',
    ].join('\n')
  );

  const archivedPhaseDoc = 'docs/implementation/close/01-feature.md';
  if (settings.archived) {
    fs.writeFileSync(
      path.join(root, archivedPhaseDoc),
      [
        '# Phase 01: Feature',
        '',
        '## Critical Product Scenarios',
        '| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |',
        '|----|--------------------------|----------------------|-----------------|---------------|',
        '| SCN-01-1 | Rendered feature is visible | `npm test` | feature visible pass | `QA_REPORT.md` |',
        '',
        '## Exact Execution Targets',
        '| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |',
        '|----|-----------------|-----------------|---------------|----------|----------------------------|',
        '| P01-1 | `src/feature.ts` | none | `tests/feature.test.ts` | `npm test` | pass |',
        '',
      ].join('\n')
    );
  }

  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/feature.ts'), 'export const ok = true;\n');

  fs.writeFileSync(
    path.join(claudeDir, 'docs/phase-status.yaml'),
    [
      'schemaVersion: "1.0"',
      'masterPlan: "docs/implementation/00-master-plan-v1.md"',
      'planDir: "docs/implementation"',
      ...(settings.environmentBlockedNormalizedInProgress ? [
        'normalizedRunVerdict: complete_with_environment_blocker',
        'stopReasonClass: environment_blocker',
        'stopReasonExplanation: "external provider smoke credential blocked"',
        'environmentBlockers:',
        '  - check: external_provider_smoke',
        '    reason: "external provider smoke credential blocked"',
        '    evidencePath: ".claude/logs/workflow-enforcement/environment-blocked-smoke.json"',
        '    observedAt: "2026-05-08T12:00:00Z"',
      ] : []),
      ...(settings.staleActiveRunLeaseId ? ['activeRunLeaseId: "delegated-failed-run"'] : []),
      'phases:',
      '  - number: 1',
      '    title: "Phase 01: Feature"',
      `    status: ${settings.environmentBlockedNormalizedInProgress ? 'in_progress' : 'completed'}`,
      ...(settings.staleActiveRunLeaseId ? ['    activeRunLeaseId: "delegated-failed-run"'] : []),
      ...(settings.futureTimestamp ? ['    completedAt: "2026-05-08T12:00:05.001Z"'] : []),
      '    sprintContract: "docs/implementation/execution/01-feature/SPRINT_CONTRACT.md"',
      '    qaReport: "docs/implementation/execution/01-feature/QA_REPORT.md"',
      '    handoff: "docs/implementation/execution/01-feature/HANDOFF.md"',
      '    scorecard: "docs/implementation/execution/01-feature/SCORECARD.md"',
      `    archivedPhaseDoc: "${settings.archived ? archivedPhaseDoc : 'docs/implementation/close/missing.md'}"`,
      '',
    ].join('\n')
  );

  if (
    settings.delegatedFailedLocalFallbackCompleted
    || settings.currentRunFailedPhaseCompleted
    || settings.activePhaseRunFailedPhaseCompleted
    || settings.latestDispatchFailedPhaseCompleted
    || settings.supersededLocalFallbackWorkflowState
    || settings.sessionTaskCompleteWorkflowFailed
    || settings.environmentBlockedSmokePlanComplete
  ) {
    const workflowDir = path.join(claudeDir, 'logs/workflow-enforcement');
    fs.mkdirSync(workflowDir, { recursive: true });

    const failedPayload = {
        runId: 'delegated-failed-run',
        status: settings.currentRunFailedPhaseCompleted || settings.sessionTaskCompleteWorkflowFailed ? 'failed' : 'completed',
        failureClass: settings.delegatedFailedLocalFallbackCompleted ? 'delegated_terminal_failed' : undefined,
        fallbackRunId: settings.delegatedFailedLocalFallbackCompleted ? 'local-fallback-complete-run' : undefined,
        activeRunLeaseId: settings.staleActiveRunLeaseId ? 'delegated-failed-run' : undefined,
    };
    const supersededPayload = {
      runId: 'delegated-failed-run',
      status: 'superseded-by-local-fallback',
      completionStatus: 'completed-via-local-fallback',
      fallbackRunId: 'local-fallback-complete-run',
      supersededRunLeaseId: 'delegated-failed-run',
      localFallbackCompletion: {
        runId: 'local-fallback-complete-run',
        completionStatus: 'completed-via-local-fallback',
      },
    };
    const writeState = (basename, payload) => {
      fs.writeFileSync(path.join(workflowDir, basename), JSON.stringify(payload, null, 2));
    };

    if (settings.supersededLocalFallbackWorkflowState) {
      for (const basename of ['current-run.json', 'active-phase-run.json', 'latest-dispatch.json']) {
        writeState(basename, supersededPayload);
      }
    } else {
      writeState('current-run.json', failedPayload);
      if (settings.activePhaseRunFailedPhaseCompleted) {
        writeState('active-phase-run.json', {
          runId: 'active-failed-run',
          status: 'failed',
          completionStatus: 'failed',
        });
      }
      if (settings.latestDispatchFailedPhaseCompleted) {
        writeState('latest-dispatch.json', {
          runId: 'latest-failed-run',
          status: 'failed',
          completionStatus: 'failed',
        });
      }
    }

    if (settings.delegatedFailedLocalFallbackCompleted || settings.supersededLocalFallbackWorkflowState) {
      fs.writeFileSync(
        path.join(workflowDir, 'local-fallback-complete-run.json'),
        JSON.stringify({
          runId: 'local-fallback-complete-run',
          status: 'completed',
          completionBoundary: 'phase_only',
          completedAt: '2026-05-08T11:59:30.000Z',
        }, null, 2)
      );
    }

    if (settings.environmentBlockedSmokePlanComplete) {
      fs.writeFileSync(
        path.join(workflowDir, 'environment-blocked-smoke.json'),
        JSON.stringify({
          status: 'blocked',
          reason: 'runtime-health-blocked',
          evidenceDepth: 'smoke_only',
          planStatus: 'complete',
        }, null, 2)
      );
    }
  }

  if (settings.sessionTaskCompleteWorkflowFailed) {
    const sessionDir = path.join(claudeDir, 'sessions');
    fs.mkdirSync(sessionDir, { recursive: true });
    fs.writeFileSync(
      path.join(sessionDir, 'phase01.jsonl'),
      [
        JSON.stringify({ type: 'assistant', phase: 'commentary', event: 'task_complete', runId: 'delegated-failed-run' }),
        JSON.stringify({ type: 'workflow', status: 'failed', runId: 'delegated-failed-run' }),
        '',
      ].join('\n')
    );
  }

  fs.writeFileSync(
    path.join(executionDir, 'SPRINT_CONTRACT.md'),
    [
      '# Sprint Contract',
      '',
      '## Slice',
      '- Source phase doc: docs/implementation/close/01-feature.md',
      '',
      '## Source Plan Requirements Snapshot',
      '| P01-1 | `src/feature.ts` | none | `tests/feature.test.ts` | `npm test` | pass |',
      '',
      '## Spec Deviation Ledger',
      '- none',
      '',
    ].join('\n')
  );

  fs.writeFileSync(
    path.join(executionDir, 'QA_REPORT.md'),
    [
      '# QA Report',
      '',
      '## Verdict',
      '- Next path: clean_finish',
      '- Scope status: complete',
      '',
      '## Plan Conformance Review',
      '- Source plan conformance command: pass',
      settings.scenarioEvidence ? '- SCN-01-1: pass - rendered feature is visible.' : '- SCN-01-1: missing evidence.',
      settings.qaExtra,
      '',
      '## Finish Readiness',
      '- Remaining blockers before closeout: none',
      '',
    ].join('\n')
  );

  fs.writeFileSync(
    path.join(executionDir, 'SCORECARD.md'),
    [
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
    ].join('\n')
  );

  fs.writeFileSync(
    path.join(executionDir, 'HANDOFF.md'),
    [
      '# Handoff',
      '',
      '## Status',
      '- Required: no',
      '',
      '## Resume Trigger',
      '- Stop reason: clean_finish',
      '',
    ].join('\n')
  );

  if (settings.incompleteWorksets) {
    fs.writeFileSync(
      path.join(executionDir, 'WORKSETS.yaml'),
      [
        'schemaVersion: 1',
        'activeAtomicTask: AT-01',
        'atomicTasks:',
        '  - id: AT-01',
        '    title: "Feature work"',
        '    status: in_progress',
        '    ownedPaths: []',
        '    verificationCommands: []',
        '    evidence: []',
        '    completedAt: null',
        'worksets: []',
        '',
      ].join('\n')
    );
  }

  if (settings.traceability) {
    fs.writeFileSync(
      path.join(docsDir, 'execution/REQUIREMENTS_TRACEABILITY.md'),
      [
        '# Requirements Traceability',
        '',
        '| ID | Requirement | Evidence | Status |',
        '|----|-------------|----------|--------|',
        '| REQ-01-1 | Render feature | `QA_REPORT.md` | verified |',
        '',
      ].join('\n')
    );

    fs.writeFileSync(
      path.join(docsDir, 'execution/SCENARIO_MATRIX.md'),
      [
        '# Scenario Matrix',
        '',
        '| ID | Requirement | Scenario | Evidence | Status |',
        '|----|-------------|----------|----------|--------|',
        '| SCN-01-1 | REQ-01-1 | Rendered feature is visible | `QA_REPORT.md` | verified |',
        '',
      ].join('\n')
    );
  }

  fs.writeFileSync(
    path.join(claudeDir, 'verification-verdict-phase01-final.json'),
    JSON.stringify({
      verdict: 'passed',
      evidenceFresh: true,
      blocking: settings.inconsistentVerdict,
      score: { verdict: settings.inconsistentVerdict ? 'blocked' : 'done' },
    }, null, 2)
  );
}

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
