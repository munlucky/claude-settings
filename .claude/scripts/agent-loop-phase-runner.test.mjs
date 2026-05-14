import { strict as assert } from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  assessWorkerSpawnStateGuard,
  buildPhaseLoopShadowSignal,
  classifyRunnerStartup,
  computeControllerEnforcedGateAction,
  computePhaseLoopShadowDecision,
  finalizeCompletion,
  publishRunnerBlockedCloseout,
  resolveRunnerReconciliationIntentOptions,
  writeTerminalCompleteSimpleRunState,
  writeActiveSimpleRunState,
} from './agent-loop-phase-runner.mjs';
import { readState, resolveReconciliationIntentPath, resolveRunRoot, writeState } from './lib/simple-run-state.mjs';
import {
  buildRemediationPacket,
  formatRemediationPacketForPrompt,
  readFreshRemediationPacket,
  writeRemediationPacket,
} from './lib/phase-remediation-packet.mjs';

function writeFixtureRunState(root, stateRunId, status = 'active') {
  const runRoot = resolveRunRoot(stateRunId, { rootDir: root });
  writeState({
    stateRunId,
    runRoot,
    status,
    phase: '2',
    attempt: 'attempt-01',
    owner: 'test',
    reason: 'fixture',
    planDir: 'docs/implementation/phase-runner-simple-state-board-2026-05-13',
    statusFile: '.claude/docs/phase-status.yaml',
  }, { rootDir: root, stateRunId, runRoot });
  return runRoot;
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function writeRunnerReconciliationIntentFromPublish(root, publishResult) {
  const intentPath = resolveReconciliationIntentPath(publishResult.stateRunId, { rootDir: root });
  writeJson(intentPath, {
    intent: 'resume_blocked_attempt',
    resumeReason: 'blocker_resolved',
    stateRunId: publishResult.stateRunId,
    attemptId: 'attempt-01',
    transactionId: publishResult.transactionId,
    blockerEvidenceId: publishResult.blockerEvidenceId,
    projectionManifestSha256: sha256File(publishResult.guardMirror.projectionManifestPath),
  });
  return intentPath;
}

function appendResolvedBlockerEvidence(publishResult) {
  fs.appendFileSync(
    publishResult.guardMirror.blockerEvidencePath,
    `${JSON.stringify({
      id: publishResult.blockerEvidenceId,
      status: 'resolved',
      transactionId: publishResult.transactionId,
      attemptId: 'attempt-01',
      stateRunId: publishResult.stateRunId,
    })}\n`,
    'utf8',
  );
}

test('shadow adapter converts review, verify, finish, checkpoint, and pass cases', () => {
  const cases = [
    {
      input: { phaseNumber: '2', attemptNumber: '1', stage: 'review', result: 'failed', failureClass: 'code_change_required' },
      expected: { stage: 'review', result: 'fail', failureClass: 'code_change_required' },
    },
    {
      input: { phaseNumber: '2', attemptNumber: '1', stage: 'verify', result: 'failed', failureClass: 'missing_verification_evidence' },
      expected: { stage: 'verify', result: 'fail', failureClass: 'missing_verification_evidence' },
    },
    {
      input: { phaseNumber: '2', attemptNumber: '1', stage: 'finish', result: 'failed', failureClass: 'projection_state_inconsistency' },
      expected: { stage: 'finish', result: 'fail', failureClass: 'projection_state_inconsistency' },
    },
    {
      input: { phaseNumber: '2', attemptNumber: '1', stage: 'checkpoint', result: 'partial', failureClass: 'stale_projection' },
      expected: { stage: 'checkpoint', result: 'partial', failureClass: 'stale_projection' },
    },
    {
      input: { phaseNumber: '2', attemptNumber: '1', stage: 'finish', result: 'passed', evidenceRefs: ['.claude/verification-verdict-phase02-final.json'] },
      expected: { stage: 'finish', result: 'pass', failureClass: '' },
    },
  ];

  for (const { input, expected } of cases) {
    const signal = buildPhaseLoopShadowSignal(input);
    assert.equal(signal.phaseNumber, 2);
    assert.equal(signal.attemptNumber, 1);
    assert.equal(signal.stage, expected.stage);
    assert.equal(signal.result, expected.result);
    assert.equal(signal.failureClass, expected.failureClass);
    assert.equal(Array.isArray(signal.failedCases), true);
    assert.equal(Array.isArray(signal.evidenceRefs), true);
    assert.equal(Array.isArray(signal.blockers), true);
    assert.equal(Object.hasOwn(signal, 'previousRemediation'), true);
  }
});

test('finalizer failure codes map to controller-routable normalized signals', () => {
  const expectedSignals = new Map([
    ['verification-verdict-not-passed', { failureClass: 'missing_verification_evidence', stage: 'verify' }],
    ['review-evidence-missing', { failureClass: 'missing_review_evidence', stage: 'review' }],
    ['phase-status-inconsistent', { failureClass: 'projection_state_inconsistency', stage: 'finish' }],
    ['current-artifacts-stale', { failureClass: 'projection_state_inconsistency', stage: 'finish' }],
    ['workflow-state-failed', { failureClass: 'projection_state_inconsistency', stage: 'finish' }],
    ['tool-unavailable', { failureClass: 'environment_unavailable', stage: 'finish' }],
    ['spawn EPERM', { failureClass: 'environment_unavailable', stage: 'finish' }],
  ]);

  for (const [code, expected] of expectedSignals) {
    const signal = buildPhaseLoopShadowSignal({
      phaseNumber: 2,
      attemptNumber: 3,
      finalizerFailureCode: code,
      evidenceRef: 'QA_REPORT.md',
    });
    assert.equal(signal.stage, expected.stage);
    assert.equal(signal.failureClass, expected.failureClass);
    assert.equal(signal.failedCases[0].class, expected.failureClass);
    assert.equal(signal.failedCases[0].message, code);
  }
});

test('unknown finalizer failure gives controller enough context to block without retry', () => {
  const shadow = computePhaseLoopShadowDecision({
    legacyDecision: 'blocked',
    phaseNumber: 2,
    attemptNumber: 4,
    finalizerFailureCode: 'unexpected-finalizer-code',
  });

  assert.equal(shadow.signal.stage, 'finish');
  assert.equal(shadow.signal.failureClass, 'unknown_finalizer_failure');
  assert.equal(shadow.controllerDecision, 'blocked');
  assert.equal(shadow.decision.retryRecommended, false);
  assert.equal(shadow.decision.failedCases[0].class, 'unknown_finalizer_failure');
});

test('shadow mismatch is observable before controller enforcement consumes the controller decision', () => {
  const shadow = computePhaseLoopShadowDecision({
    legacyDecision: 'rerun_verify',
    phaseNumber: 2,
    attemptNumber: 5,
    stage: 'review',
    result: 'failed',
    failureClass: 'code_change_required',
    evidenceRefs: ['QA_REPORT.md#review'],
  });

  assert.equal(shadow.controllerDecision, 'continue_execute');
  assert.equal(shadow.legacyDecision, 'rerun_verify');
  assert.equal(shadow.mismatch, true);
  assert.deepEqual(Object.keys(shadow.mismatchLog), [
    'legacyDecision',
    'controllerDecision',
    'phaseNumber',
    'attemptNumber',
    'stage',
    'failureClass',
    'evidenceRefs',
  ]);
  assert.equal(shadow.mismatchLog.legacyDecision, 'rerun_verify');
});

test('controller-enforced gate action routes review, verify, repair, and blocked outcomes', () => {
  const cases = [
    {
      input: { stage: 'review', failureClass: 'code_change_required' },
      expected: { decision: 'continue_execute', action: 'auto-fix' },
    },
    {
      input: { finalizerFailureCode: 'review-evidence-missing' },
      expected: { decision: 'rerun_review', action: 'review-remediation' },
    },
    {
      input: { finalizerFailureCode: 'verification-verdict-not-passed' },
      expected: { decision: 'rerun_verify', action: 'verification-remediation' },
    },
    {
      input: { finalizerFailureCode: 'phase-status-inconsistent' },
      expected: { decision: 'repair_required', action: 'stop-repair-required' },
    },
    {
      input: { finalizerFailureCode: 'unexpected-finalizer-code' },
      expected: { decision: 'blocked', action: 'stop-blocked' },
    },
  ];

  for (const { input, expected } of cases) {
    const result = computeControllerEnforcedGateAction({
      phaseNumber: 3,
      attemptNumber: 1,
      result: 'fail',
      ...input,
    });
    assert.equal(result.controllerDecision, expected.decision);
    assert.equal(result.action, expected.action);
  }
});

test('controller-enforced gate action blocks verifier environment failures instead of execute retry', () => {
  const result = computeControllerEnforcedGateAction({
    phaseNumber: 4,
    attemptNumber: 5,
    stage: 'verify',
    result: 'blocked',
    failureClass: 'verification_environment_unavailable',
    evidenceRefs: ['.claude/verification-verdict-phase04-blocked.json'],
  });

  assert.equal(result.controllerDecision, 'blocked');
  assert.equal(result.action, 'stop-blocked');
  assert.equal(result.decision.retryRecommended, false);
});

test('no_implicit_resume_sources', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-runner-resume-'));
  try {
    writeFixtureRunState(root, 'run-active', 'blocked');
    const workflowDir = path.join(root, '.claude', 'logs', 'workflow-enforcement');
    fs.mkdirSync(workflowDir, { recursive: true });
    fs.writeFileSync(path.join(workflowDir, 'active-phase-run.json'), '{"stateRunId":"run-active"}\n', 'utf8');
    fs.writeFileSync(path.join(workflowDir, 'reconciliation.json'), '{"present":true}\n', 'utf8');
    process.env.PHASE_RUN_LEASE_ID = 'lease-env-value';
    process.env.PHASE_STATE_RUN_ID = 'env-state-value';

    const result = classifyRunnerStartup({
      resume: false,
      rootDir: root,
      stateRunId: process.env.PHASE_RUN_LEASE_ID,
    });

    assert.equal(result.classification, 'resume-required');
    assert.equal(result.stateRunId, 'run-active');
  } finally {
    delete process.env.PHASE_RUN_LEASE_ID;
    delete process.env.PHASE_STATE_RUN_ID;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('explicit resume requires an existing active or blocked board', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-runner-resume-missing-'));
  try {
    assert.equal(classifyRunnerStartup({ resume: true, rootDir: root }).classification, 'resume-state-missing');
    writeFixtureRunState(root, 'run-active', 'active');
    const result = classifyRunnerStartup({ resume: true, rootDir: root });
    assert.equal(result.classification, 'resume_allowed');
    assert.equal(result.stateRunId, 'run-active');
    const mismatch = classifyRunnerStartup({ resume: true, rootDir: root, stateRunId: 'other-run' });
    assert.equal(mismatch.classification, 'resume-state-missing');
    assert.equal(mismatch.stateRunId, 'other-run');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('pending projection residue blocks startup before status-based resume classification', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-runner-pending-projection-'));
  try {
    const stateRunId = 'run-pending-terminal';
    const runRoot = writeFixtureRunState(root, stateRunId, 'complete');
    writeState({
      stateRunId,
      runRoot,
      projectionStatus: 'pending',
      status: 'complete',
      phase: '3',
      attempt: 'attempt-01',
      owner: 'test',
      reason: 'fixture',
      planDir: 'docs/implementation/phase-runner-state-board-closeout-remediation-2026-05-14',
      statusFile: '.claude/docs/phase-status.yaml',
    }, { rootDir: root, stateRunId, runRoot });

    const nonResume = classifyRunnerStartup({ resume: false, rootDir: root });
    assert.equal(nonResume.classification, 'incomplete_transaction');
    assert.equal(nonResume.stateRunId, stateRunId);

    const implicitResume = classifyRunnerStartup({ resume: true, rootDir: root });
    assert.equal(implicitResume.classification, 'incomplete_transaction');
    assert.equal(implicitResume.stateRunId, stateRunId);

    const explicitResume = classifyRunnerStartup({ resume: true, rootDir: root, stateRunId });
    assert.equal(explicitResume.classification, 'incomplete_transaction');
    assert.equal(explicitResume.stateRunId, stateRunId);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('worker spawn guard rejects same-attempt terminal and pending state boards', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-runner-spawn-guard-'));
  try {
    writeFixtureRunState(root, 'run-blocked', 'blocked');
    const blocked = readState({
      rootDir: root,
      stateRunId: 'run-blocked',
      runRoot: resolveRunRoot('run-blocked', { rootDir: root }),
    });
    const blockedGuard = assessWorkerSpawnStateGuard(blocked, { attemptId: 'attempt-01' });
    assert.equal(blockedGuard.allowed, false);
    assert.equal(blockedGuard.reason, 'same_attempt_terminal_blocked');

    const pendingRunRoot = writeFixtureRunState(root, 'run-pending', 'active');
    writeState({
      stateRunId: 'run-pending',
      runRoot: pendingRunRoot,
      projectionStatus: 'pending',
      status: 'active',
      phase: '2',
      attempt: 'attempt-02',
      owner: 'test',
      reason: 'fixture',
      planDir: 'docs/implementation/phase-runner-simple-state-board-2026-05-13',
      statusFile: '.claude/docs/phase-status.yaml',
    }, { rootDir: root, stateRunId: 'run-pending', runRoot: pendingRunRoot });
    const pending = readState({
      rootDir: root,
      stateRunId: 'run-pending',
      runRoot: pendingRunRoot,
    });
    const pendingGuard = assessWorkerSpawnStateGuard(pending, { attemptId: 'attempt-02' });
    assert.equal(pendingGuard.allowed, false);
    assert.equal(pendingGuard.reason, 'incomplete_transaction');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('worker spawn guard allows same-attempt blocked resume only with production publisher evidence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-runner-reconcile-'));
  const originalCwd = process.cwd();
  try {
    process.chdir(root);
    const stateRunId = 'run-reconcile';
    const planDir = path.join(root, 'docs', 'implementation', 'blocked-plan');
    const executionRoot = path.join(planDir, 'execution');
    const phaseExecutionDir = path.join(executionRoot, '02-reconciliation-evidence-path-unification-v1');
    fs.mkdirSync(phaseExecutionDir, { recursive: true });
    const publishResult = publishRunnerBlockedCloseout({ phaseExecutionDir }, {
      detail: 'operator resolved blocker',
      stopReason: 'blocked:operator-reconciliation-required',
      attemptId: 'attempt-01',
      runnerState: {
        planDir,
        statusFile: '.claude/docs/phase-status.yaml',
        executionRoot,
        runtime: 'codex',
        phaseNum: '2',
        phaseTitle: 'Phase 02: Reconciliation Evidence Path Unification (v1)',
        phaseDoc: path.join(planDir, '02-reconciliation-evidence-path-unification-v1.md'),
        stateRunId,
      },
    });
    const blocked = readState({ rootDir: root, stateRunId });
    writeRunnerReconciliationIntentFromPublish(root, publishResult);
    const reconciliationIntentOptions = resolveRunnerReconciliationIntentOptions(
      stateRunId,
      publishResult.runRoot,
      { resume: true, attemptId: 'attempt-01' },
    );

    assert.ok(reconciliationIntentOptions);
    assert.equal(reconciliationIntentOptions.attemptId, 'attempt-01');
    assert.equal(reconciliationIntentOptions.transactionId, publishResult.transactionId);
    assert.equal(reconciliationIntentOptions.blockerEvidenceId, publishResult.blockerEvidenceId);
    assert.equal(reconciliationIntentOptions.projectionManifestPath, publishResult.guardMirror.projectionManifestPath);

    const openOnlyRejected = assessWorkerSpawnStateGuard(blocked, {
      attemptId: 'attempt-01',
      reconciliationIntentOptions,
    });
    assert.equal(openOnlyRejected.allowed, false);
    assert.equal(openOnlyRejected.reason, 'reconciliation_intent_invalid');
    assert.equal(openOnlyRejected.detailCode, 'reconciliation_intent_blocker_not_resolved');

    appendResolvedBlockerEvidence(publishResult);
    const allowed = assessWorkerSpawnStateGuard(blocked, {
      attemptId: 'attempt-01',
      reconciliationIntentOptions,
    });
    assert.equal(allowed.allowed, true);
    assert.equal(allowed.reason, 'state_board_allows_reconciliation_resume');

    writeJson(resolveReconciliationIntentPath(stateRunId, { rootDir: root }), {
      intent: 'resume',
      resumeReason: 'blocker_resolved',
      stateRunId,
      attemptId: 'attempt-01',
      transactionId: publishResult.transactionId,
      blockerEvidenceId: publishResult.blockerEvidenceId,
      projectionManifestSha256: sha256File(publishResult.guardMirror.projectionManifestPath),
    });
    const rejected = assessWorkerSpawnStateGuard(blocked, {
      attemptId: 'attempt-01',
      reconciliationIntentOptions,
    });
    assert.equal(rejected.allowed, false);
    assert.equal(rejected.reason, 'reconciliation_intent_invalid');
    assert.equal(rejected.detailCode, 'reconciliation_intent_type_mismatch');
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runner active state start writes a committed board directly without a no-op transition', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-runner-active-direct-'));
  const originalCwd = process.cwd();
  try {
    process.chdir(root);
    const result = writeActiveSimpleRunState({
      stateRunId: 'run-active-direct',
      phaseNum: '3',
      attempt: 'attempt-active-direct',
      planDir: 'docs/implementation/phase-runner-state-board-runtime-contract-fixes-2026-05-14',
      statusFile: '.claude/docs/phase-status.yaml',
    });
    const recovered = readState({ rootDir: root, stateRunId: result.stateRunId, runRoot: result.runRoot });

    assert.equal(recovered.exists, true);
    assert.equal(recovered.state.status, 'active');
    assert.equal(recovered.state.projectionStatus, 'committed');
    assert.equal(recovered.state.reason, 'start');
    assert.equal(recovered.state.attempt, 'attempt-active-direct');
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(root, { recursive: true, force: true });
  }

  const source = fs.readFileSync('.claude/scripts/agent-loop-phase-runner.mjs', 'utf8');

  assert.doesNotMatch(source, /function writeActiveSimpleRunState[\s\S]*withStateTransition\(nextState, options,/);
});

test('stopBlockedPhase publishes terminal state before legacy phase status alignment', () => {
  const source = fs.readFileSync('.claude/scripts/agent-loop-phase-runner.mjs', 'utf8');
  const match = source.match(/function stopBlockedPhase\([\s\S]*?\n\}/);

  assert.ok(match);
  assert.match(match[0], /appendQaRuntimeUpdate[\s\S]*appendHandoffUpdate[\s\S]*publishRunnerBlockedCloseout[\s\S]*updatePhaseState/);
});

test('runner blocked closeout publisher commits blocked state board through production boundary', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-runner-blocked-publish-'));
  const originalCwd = process.cwd();
  try {
    process.chdir(root);
    const planDir = path.join(root, 'docs', 'implementation', 'blocked-plan');
    const executionRoot = path.join(planDir, 'execution');
    const phaseExecutionDir = path.join(executionRoot, '01-terminal-blocked-board-publish-wiring-v1');
    fs.mkdirSync(phaseExecutionDir, { recursive: true });

    const result = publishRunnerBlockedCloseout({ phaseExecutionDir }, {
      detail: 'capability preflight blocked phase start',
      stopReason: 'verification-preflight-blocked',
      attemptId: 'attempt-01',
      runnerState: {
        planDir,
        statusFile: '.claude/docs/phase-status.yaml',
        executionRoot,
        runtime: 'codex',
        phaseNum: '1',
        phaseTitle: 'Phase 01: Terminal Blocked Board Publish Wiring (v1)',
        phaseDoc: path.join(planDir, '01-terminal-blocked-board-publish-wiring-v1.md'),
        stateRunId: 'state-run-01',
      },
    });

    const recovered = readState({ rootDir: root, stateRunId: 'state-run-01' });
    assert.equal(recovered.exists, true);
    assert.equal(recovered.state.status, 'blocked');
    assert.equal(recovered.state.projectionStatus, 'committed');
    assert.equal(recovered.state.attempt, 'attempt-01');
    assert.equal(result.statePath, recovered.statePath);
    assert.equal(fs.existsSync(path.join(phaseExecutionDir, 'BLOCKER_EVIDENCE.jsonl')), true);
    assert.equal(fs.existsSync(path.join(phaseExecutionDir, 'ATTEMPT_LEDGER.jsonl')), true);
    assert.equal(fs.existsSync(path.join(phaseExecutionDir, 'projection-manifest.json')), true);
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('clean finish candidate is routed only to the finalizer boundary action', () => {
  const result = computeControllerEnforcedGateAction({
    phaseNumber: 3,
    attemptNumber: 1,
    stage: 'finish',
    result: 'pass',
    evidenceRefs: ['.claude/verification-verdict-phase03-final.json'],
  });

  assert.equal(result.controllerDecision, 'clean_finish_candidate');
  assert.equal(result.action, 'finalize');
});

function withTempCompletionRun(testFn) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-runner-complete-'));
  const originalCwd = process.cwd();
  const originalLeaseId = process.env.PHASE_RUN_LEASE_ID;
  process.chdir(root);
  process.env.PHASE_RUN_LEASE_ID = 'state-run-01';
  try {
    writeFixtureRunState(root, 'state-run-01', 'active');
    return testFn(root);
  } finally {
    process.chdir(originalCwd);
    if (originalLeaseId === undefined) {
      delete process.env.PHASE_RUN_LEASE_ID;
    } else {
      process.env.PHASE_RUN_LEASE_ID = originalLeaseId;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function completionTestPaths(root) {
  return {
    phaseQaReport: path.join(root, 'QA_REPORT.md'),
    phaseScorecard: path.join(root, 'SCORECARD.md'),
    phaseHandoff: path.join(root, 'HANDOFF.md'),
    phaseSprintContract: path.join(root, 'SPRINT_CONTRACT.md'),
    phaseExecutionDir: root,
  };
}

test('terminal complete simple run state is persisted and recoverable for the active stateRunId', () => {
  withTempCompletionRun((root) => {
    const result = writeTerminalCompleteSimpleRunState({ rootDir: root, stateRunId: 'state-run-01' });
    const recovered = readState({ rootDir: root });

    assert.equal(result.statePath, recovered.statePath);
    assert.equal(recovered.exists, true);
    assert.equal(recovered.state.stateRunId, 'state-run-01');
    assert.equal(recovered.state.status, 'complete');
    assert.equal(recovered.state.projectionStatus, 'committed');
  });
});

test('finalizeCompletion writes terminal complete after finalizer and required clean finish artifacts', () => {
  withTempCompletionRun((root) => {
    const calls = [];
    const ok = finalizeCompletion(
      'phase.log',
      12,
      '.claude/verification-verdict-phase01-final.json',
      completionTestPaths(root),
      'codex',
      '',
      'commit prompt',
      {
        runPhaseCloseoutFinalizer: () => {
          calls.push('finalizer');
          return { status: 0, stdout: '', stderr: '' };
        },
        syncCleanFinishArtifacts: () => calls.push('sync'),
        appendQaRuntimeUpdate: () => calls.push('qa'),
        writeCleanFinishHandoff: () => calls.push('handoff'),
        writeTerminalCompleteSimpleRunState: (overrides) => {
          calls.push('board');
          return writeTerminalCompleteSimpleRunState({ ...overrides, rootDir: root, stateRunId: 'state-run-01' });
        },
        runCommitPrompt: () => calls.push('commit'),
      },
    );
    const recovered = readState({ rootDir: root });

    assert.equal(ok, true);
    assert.deepEqual(calls, ['finalizer', 'sync', 'qa', 'handoff', 'board', 'commit']);
    assert.equal(recovered.state.status, 'complete');
  });
});

test('finalizeCompletion leaves board non-terminal when finalizer fails', () => {
  withTempCompletionRun((root) => {
    const calls = [];
    const ok = finalizeCompletion(
      'phase.log',
      12,
      '.claude/verification-verdict-phase01-final.json',
      completionTestPaths(root),
      'codex',
      '',
      'commit prompt',
      {
        runPhaseCloseoutFinalizer: () => ({ status: 1, stdout: '', stderr: 'verification-verdict-not-passed' }),
        syncCleanFinishArtifacts: () => calls.push('sync'),
        appendQaRuntimeUpdate: () => calls.push('qa'),
        appendHandoffUpdate: () => calls.push('handoff'),
        writeTerminalCompleteSimpleRunState: () => calls.push('board'),
        runCommitPrompt: () => calls.push('commit'),
      },
    );
    const recovered = readState({ rootDir: root });

    assert.equal(ok, false);
    assert.equal(recovered.state.status, 'active');
    assert.deepEqual(calls, ['qa', 'handoff']);
  });
});

test('finalizeCompletion leaves board non-terminal when required clean finish artifact publication fails', () => {
  withTempCompletionRun((root) => {
    assert.throws(
      () => finalizeCompletion(
        'phase.log',
        12,
        '.claude/verification-verdict-phase01-final.json',
        completionTestPaths(root),
        'codex',
        '',
        'commit prompt',
        {
          runPhaseCloseoutFinalizer: () => ({ status: 0, stdout: '', stderr: '' }),
          syncCleanFinishArtifacts: () => {
            throw new Error('qa publish failed');
          },
          writeTerminalCompleteSimpleRunState: () => {
            throw new Error('board should not be written');
          },
        },
      ),
      /qa publish failed/,
    );
    const recovered = readState({ rootDir: root });

    assert.equal(recovered.state.status, 'active');
  });
});

test('finalizeCompletion treats commit prompt failure as advisory after terminal complete', () => {
  withTempCompletionRun((root) => {
    const warnings = [];
    const ok = finalizeCompletion(
      'phase.log',
      12,
      '.claude/verification-verdict-phase01-final.json',
      completionTestPaths(root),
      'codex',
      '',
      'commit prompt',
      {
        runPhaseCloseoutFinalizer: () => ({ status: 0, stdout: '', stderr: '' }),
        syncCleanFinishArtifacts: () => {},
        appendQaRuntimeUpdate: (status, _logFile, detail) => warnings.push({ status, detail }),
        writeCleanFinishHandoff: () => {},
        writeTerminalCompleteSimpleRunState: (overrides) => (
          writeTerminalCompleteSimpleRunState({ ...overrides, rootDir: root, stateRunId: 'state-run-01' })
        ),
        runCommitPrompt: () => {
          throw new Error('commit prompt failed');
        },
      },
    );
    const recovered = readState({ rootDir: root });

    assert.equal(ok, true);
    assert.equal(recovered.state.status, 'complete');
    assert.equal(warnings.some((entry) => entry.status === 'commit-prompt-advisory-failed'), true);
    assert.match(warnings.at(-1).detail, /commit prompt failed/);
  });
});

test('controller remediation packet persists fresh retry context for the next worker prompt', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-runner-remediation-'));
  try {
    fs.writeFileSync(path.join(root, 'phase.md'), '# Phase\n', 'utf8');
    fs.writeFileSync(path.join(root, 'SPRINT_CONTRACT.md'), '# Sprint\n', 'utf8');
    const controllerAction = computeControllerEnforcedGateAction({
      phaseNumber: 4,
      attemptNumber: 2,
      finalizerFailureCode: 'verification-verdict-not-passed',
      evidenceRefs: ['QA_REPORT.md'],
    });
    const packetPath = path.join(root, 'remediation-request.json');
    const packet = buildRemediationPacket({
      root,
      phaseNumber: 4,
      attemptNumber: 2,
      sourceRefs: ['phase.md', 'SPRINT_CONTRACT.md'],
      controllerOutput: {
        decision: controllerAction.controllerDecision,
        failedStage: controllerAction.signal.stage,
        failedCases: controllerAction.decision.failedCases,
        improvementDirectives: [{
          id: 'DIR-VERIFY',
          targetStage: 'verify',
          targetFiles: ['QA_REPORT.md'],
          instruction: 'regenerate fresh structured verification verdict',
          evidenceRequired: '.claude/verification-verdict-*.json',
        }],
        nextAttemptInput: {
          mustRead: ['QA_REPORT.md'],
          mustRerun: ['node --test .claude/scripts/agent-loop-phase-runner.test.mjs'],
          prohibitedActions: ['do not use remediation-request.json as completion evidence'],
          retryStrategy: 'same_direction_refine',
        },
      },
    });

    writeRemediationPacket(packetPath, packet);
    const fresh = readFreshRemediationPacket(packetPath, { root });
    const prompt = formatRemediationPacketForPrompt(fresh);

    assert.equal(fresh.decision, 'rerun_verify');
    assert.match(prompt, /verification-verdict-not-passed|missing_verification_evidence/);
    assert.match(prompt, /regenerate fresh structured verification verdict/);
    assert.match(prompt, /do not use remediation-request\.json as completion evidence/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
