#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  buildFailureClassCounts,
  classifyCapabilityCheck,
  classifyFailure,
  decisionForFailureCode,
  normalizeFailureCode,
  summarizeFailureDecision,
} from './failure-classifier.mjs';

function testBashAccessDenied() {
  const a = classifyFailure({ name: 'shell:.claude/scripts/verify-code-policy.sh', status: 'warning', detail: 'spawnSync bash EPERM' });
  const b = classifyFailure({ name: 'shell:.claude/scripts/workflow-enforcement.sh', status: 'warning', detail: 'spawnSync bash Access is denied' });

  assert.equal(a.code, 'bash_access_denied');
  assert.equal(a.decision, 'resume_later_handoff');
  assert.equal(a.fingerprint, b.fingerprint);
}

function testGitAndNetworkCodes() {
  const git = classifyFailure({ name: 'git.version', status: 'warning', detail: 'spawnSync git EPERM' });
  const network = classifyFailure({ name: 'network.fetch', status: 'warning', detail: 'fetch failed: ENOTFOUND' });

  assert.equal(git.code, 'git_eperm');
  assert.equal(network.code, 'network_fetch_failed');
  assert.equal(network.decision, 'host_fallback');
  assert.equal(decisionForFailureCode('git_eperm'), 'resume_later_handoff');
}

function testCountsAndCapabilityClassification() {
  const counts = buildFailureClassCounts([
    { name: 'shell:.claude/scripts/verify-code-policy.sh', status: 'warning', detail: 'spawnSync bash EPERM' },
    { name: 'shell:.claude/scripts/workflow-enforcement.sh', status: 'warning', detail: 'spawnSync bash EPERM' },
    { name: 'git.current', status: 'warning', detail: 'spawnSync git EPERM' },
    { name: 'codex.resolve', status: 'passed', detail: 'codex available' },
  ]);

  assert.equal(counts.bash_access_denied, 2);
  assert.equal(counts.git_eperm, 1);
  assert.equal(normalizeFailureCode({ reason: '  Bash Access Denied  ' }), 'bash_access_denied');

  const passed = classifyCapabilityCheck({ name: 'codex.resolve', status: 'passed', detail: 'codex available' });
  assert.equal(passed.code, 'ok');
  assert.equal(passed.decision, 'continue');

  const summary = summarizeFailureDecision(counts);
  assert.equal(summary.blockerCode, 'bash_access_denied');
  assert.equal(summary.sameFailureClassCount, 2);
}

testBashAccessDenied();
testGitAndNetworkCodes();
testCountsAndCapabilityClassification();

process.stdout.write('failure-classifier self-test passed\n');
