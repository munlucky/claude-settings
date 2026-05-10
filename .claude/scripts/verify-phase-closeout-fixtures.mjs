import fs from 'node:fs';
import path from 'node:path';

function writableTempRoot() {
  const candidates = [
    process.env.CODEX_TMPDIR,
    process.env.TMP,
    process.env.TEMP,
    process.platform === 'win32' ? 'C:\\tmp' : '/tmp',
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      fs.mkdirSync(candidate, { recursive: true });
      fs.accessSync(candidate, fs.constants.W_OK);
      return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  return process.cwd();
}

export function config(root) {
  return {
    statusFile: path.join(root, '.claude/docs/phase-status.yaml'),
    planDir: path.join(root, 'docs/implementation'),
    masterPlan: path.join(root, 'docs/implementation/00-master-plan-v1.md'),
  };
}

export function eventFixture(eventType, payload) {
  return {
    eventVersion: 1,
    eventType,
    runId: 'run-1',
    phaseId: '1',
    contractSnapshotId: 'contract-1',
    source: 'test-fixture',
    payload,
    timestamp: '2026-05-10T00:00:00Z',
  };
}

export function withFixture(options, callback) {
  const root = fs.mkdtempSync(path.join(writableTempRoot(), 'phase-closeout-'));
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
    incompleteAcWorksets: false,
    failedAcWorksets: false,
    notApplicableAcWorksets: false,
    legacyCompletedWorksets: false,
    delegatedFailedLocalFallbackCompleted: false,
    currentRunFailedPhaseCompleted: false,
    activePhaseRunFailedPhaseCompleted: false,
    latestDispatchFailedPhaseCompleted: false,
    supersededLocalFallbackWorkflowState: false,
    currentRunRunningPhaseCompleted: false,
    staleActiveRunLeaseId: false,
    futureTimestamp: false,
    workflowFutureTimestamp: false,
    staleVerdictIdentity: false,
    fixedNow: '2026-05-08T12:00:00.000Z',
    sessionTaskCompleteWorkflowFailed: false,
    environmentBlockedSmokePlanComplete: false,
    environmentBlockedNormalizedInProgress: false,
    latestDispatchPreparedAfterCompletion: false,
    memorygraphUnavailable: false,
    memorygraphStrict: false,
    evaluationPipeline: false,
    evaluationEvidence: false,
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
        settings.evaluationPipeline ? '# Phase 06: Evaluation Trigger Pipeline (v1)' : '# Phase 01: Feature',
        '',
        ...(settings.evaluationPipeline ? [
          '## Scope',
          '- Define semantic evaluation triggers and consensus triggers.',
          '- Add mechanical skip policy, verification override allowlist, and QA backend matrix.',
          '',
        ] : []),
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
      ...(settings.workflowFutureTimestamp ? ['updatedAt: "2026-05-08T12:00:06.000Z"'] : []),
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
    || settings.currentRunRunningPhaseCompleted
    || settings.workflowFutureTimestamp
    || settings.sessionTaskCompleteWorkflowFailed
    || settings.environmentBlockedSmokePlanComplete
    || settings.latestDispatchPreparedAfterCompletion
    || settings.memorygraphUnavailable
  ) {
    const workflowDir = path.join(claudeDir, 'logs/workflow-enforcement');
    fs.mkdirSync(workflowDir, { recursive: true });

    const failedPayload = {
        runId: 'delegated-failed-run',
        status: settings.currentRunRunningPhaseCompleted ? 'running' : (settings.currentRunFailedPhaseCompleted || settings.sessionTaskCompleteWorkflowFailed ? 'failed' : 'completed'),
        updatedAt: settings.workflowFutureTimestamp ? '2026-05-08T12:00:06.000Z' : undefined,
        lastHeartbeatAt: settings.workflowFutureTimestamp ? '2026-05-08T12:00:06.000Z' : undefined,
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
      if (settings.latestDispatchPreparedAfterCompletion) {
        writeState('latest-dispatch.json', {
          runId: 'prepared-dispatch-run',
          status: 'prepared',
          completionStatus: 'prepared',
          planDir: 'docs/implementation',
          statusFile: path.join(root, '.claude/docs/phase-status.yaml'),
        });
      }
      if (settings.memorygraphUnavailable) {
        writeState('current-run.json', {
          runId: 'memorygraph-degraded-run',
          status: 'completed',
          completionStatus: 'completed',
          planDir: 'docs/implementation',
          statusFile: path.join(root, '.claude/docs/phase-status.yaml'),
          unavailableCapabilities: [{
            code: 'memorygraph_unavailable',
            source: 'memorygraph.health',
            evidencePath: '.claude/logs/agent-loop/debug.jsonl',
            strict: settings.memorygraphStrict ? 'true' : 'false',
          }],
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
      ...(settings.evaluationEvidence ? [
        '',
        '## Workflow Execution',
        '- Validation profile: workflow_core',
        '',
        '## Evaluation Trigger Evidence',
        '- Semantic triggers: ac ambiguity, scope drift, architecture risk, security risk, auth risk, payment risk, repeated failure, user value unclear',
        '- Consensus triggers: contract reinterpretation, high-risk security, high-risk architecture, evaluator disagreement',
        '- Mechanical checks: passed',
        '- Semantic evaluation: not_required',
        '- Consensus evaluation: not_required',
        '- Skipped mechanical checks: none',
        '- Verification override: allowlisted',
        '- QA backend matrix: browser optional available; a11y optional available; visual optional available; performance optional available',
      ] : []),
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

  if (settings.incompleteAcWorksets || settings.failedAcWorksets || settings.notApplicableAcWorksets || settings.legacyCompletedWorksets) {
    const acLines = settings.legacyCompletedWorksets
      ? [
        'schemaVersion: 1',
        'activeAtomicTask: AT-01',
        'atomicTasks:',
        '  - id: AT-01',
        '    title: "Feature work"',
        '    status: completed',
        '    ownedPaths:',
        '      - "src/feature.ts"',
        '    verificationCommands:',
        '      - "npm test"',
        '    evidence:',
        '      - "PASS: npm test"',
        '    completedAt: "2026-05-08T11:59:30Z"',
        'worksets: []',
        '',
      ]
      : [
        'schemaVersion: 1',
        'activeAtomicTask: AT-01',
        'atomicTasks:',
        '  - id: AT-01',
        '    title: "Feature work"',
        '    status: completed',
        '    taskStatus: completed',
        '    acceptanceCriterionId: "AC-001"',
        '    linkedRequirementIds: ["REQ-001"]',
        `    acVerdict: ${settings.failedAcWorksets ? 'failed' : settings.notApplicableAcWorksets ? 'not_applicable' : 'pending'}`,
        ...(settings.notApplicableAcWorksets ? [
          '    verificationEvidence: []',
        ] : [
          '    verificationEvidence:',
          '      - "PASS: npm test"',
        ]),
        '    ownedPaths:',
        '      - "src/feature.ts"',
        '    verificationCommands:',
        '      - "npm test"',
        '    evidence:',
        '      - "PASS: npm test"',
        '    completedAt: "2026-05-08T11:59:30Z"',
        'worksets: []',
        '',
      ];
    fs.writeFileSync(path.join(executionDir, 'WORKSETS.yaml'), acLines.join('\n'));
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
      ...(settings.staleVerdictIdentity ? {
        identity: {
          runLeaseId: 'old-run',
          planDir: path.join(root, 'docs/old-implementation'),
          statusFile: path.join(root, '.claude/docs/phase-status.yaml'),
        },
      } : {}),
    }, null, 2)
  );
}
