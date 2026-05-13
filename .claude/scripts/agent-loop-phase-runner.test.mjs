import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  buildPhaseLoopShadowSignal,
  computeControllerEnforcedGateAction,
  computePhaseLoopShadowDecision,
} from './agent-loop-phase-runner.mjs';
import {
  buildRemediationPacket,
  formatRemediationPacketForPrompt,
  readFreshRemediationPacket,
  writeRemediationPacket,
} from './lib/phase-remediation-packet.mjs';

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
