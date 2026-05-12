#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  evaluateDeclaredAlternateVerifierPolicy,
  verdictPassed,
} from './phase-closeout-verdict.mjs';

function verdictWithAlternate(overrides = {}) {
  return {
    exists: true,
    relevant: true,
    parsed: {
      verdict: 'expected_blocker_passed',
      evidenceFresh: true,
      blocking: false,
      score: { verdict: 'done' },
      verifierPolicy: {
        requiredVerifier: {
          id: 'phaseRuntimeParity',
          command: 'bash .claude/scripts/verify-phase-runtime-parity.sh .claude/docs/runtime-parity-reference-plan',
          errorCode: 'EPERM',
          failureClass: 'verification_environment_unavailable',
          detail: 'spawnSync bash EPERM while running required verifier',
        },
        alternateVerifier: {
          id: 'phaseRuntimeParityCodexNode',
          requiredVerifierId: 'phaseRuntimeParity',
          status: 'passed',
          declared: true,
          command: 'node --test .claude/scripts/lib/phase-closeout-verdict.test.mjs',
        },
      },
      ...overrides,
    },
  };
}

function testDeclaredAlternateVerifierWarningCompletion() {
  const verdict = verdictWithAlternate();
  const policy = evaluateDeclaredAlternateVerifierPolicy(verdict.parsed);

  assert.equal(policy.applies, true);
  assert.equal(policy.allowed, true);
  assert.equal(policy.reason, 'declared_alternate_verifier_warning_completion');
  assert.equal(verdictPassed(verdict), true);
}

function testUndeclaredAlternateVerifierRejected() {
  const verdict = verdictWithAlternate({
    verifierPolicy: {
      requiredVerifier: {
        id: 'phaseRuntimeParity',
        command: 'bash .claude/scripts/verify-phase-runtime-parity.sh .claude/docs/runtime-parity-reference-plan',
        errorCode: 'EPERM',
        failureClass: 'verification_environment_unavailable',
        detail: 'spawnSync bash EPERM while running required verifier',
      },
      alternateVerifier: {
        id: 'undeclaredNodeTest',
        requiredVerifierId: 'phaseRuntimeParity',
        status: 'passed',
        declared: false,
        command: 'node --test .claude/scripts/lib/phase-closeout-verdict.test.mjs',
      },
    },
  });
  const policy = evaluateDeclaredAlternateVerifierPolicy(verdict.parsed);

  assert.equal(policy.applies, true);
  assert.equal(policy.allowed, false);
  assert.equal(policy.reason, 'alternate_verifier_undeclared');
  assert.equal(verdictPassed(verdict), false);
}

function testDeclaredAlternateFailureRejected() {
  const verdict = verdictWithAlternate({
    verifierPolicy: {
      requiredVerifier: {
        id: 'phaseRuntimeParity',
        command: 'bash .claude/scripts/verify-phase-runtime-parity.sh .claude/docs/runtime-parity-reference-plan',
        errorCode: 'EPERM',
        failureClass: 'verification_environment_unavailable',
        detail: 'spawnSync bash EPERM while running required verifier',
      },
      alternateVerifier: {
        id: 'phaseRuntimeParityCodexNode',
        requiredVerifierId: 'phaseRuntimeParity',
        status: 'failed',
        declared: true,
        command: 'node --test .claude/scripts/lib/phase-closeout-verdict.test.mjs',
      },
    },
  });
  const policy = evaluateDeclaredAlternateVerifierPolicy(verdict.parsed);

  assert.equal(policy.allowed, false);
  assert.equal(policy.reason, 'declared_alternate_verifier_not_passed');
  assert.equal(verdictPassed(verdict), false);
}

function testAlternateVerifierCannotBecomeCleanPass() {
  const verdict = verdictWithAlternate({ verdict: 'passed' });
  const policy = evaluateDeclaredAlternateVerifierPolicy(verdict.parsed);

  assert.equal(policy.allowed, false);
  assert.equal(policy.reason, 'alternate_verifier_requires_warning_completion');
  assert.equal(verdictPassed(verdict), false);
}

testDeclaredAlternateVerifierWarningCompletion();
testUndeclaredAlternateVerifierRejected();
testDeclaredAlternateFailureRejected();
testAlternateVerifierCannotBecomeCleanPass();

process.stdout.write('phase-closeout-verdict alternate verifier tests passed\n');
