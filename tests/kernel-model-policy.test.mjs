import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACTION_KINDS, loadModelPolicy, parseModelPolicyText, requiresProviderModel } from '../scripts/kernel/run/model-route-contract.mjs';
import { resolveModelRoute } from '../scripts/kernel/run/model-routing.mjs';

test('canonical model policy declares two provider classes plus the kernel class', () => {
  const policy = loadModelPolicy();
  assert.equal(policy.schemaVersion, 1);
  assert.equal(policy.policyRevision, 'kernel-model-routing.v1');
  assert.deepEqual(Object.keys(policy.modelClasses).sort(), ['frontier_reasoning', 'kernel', 'value_coding']);
  assert.equal(requiresProviderModel('frontier_reasoning'), true);
  assert.equal(requiresProviderModel('value_coding'), true);
  assert.equal(requiresProviderModel('kernel'), false);
  for (const action of ACTION_KINDS) assert.ok(policy.actionDefaults[action], action);
});

test('policy is provider-neutral: no provider model id appears in the canonical file', () => {
  const policy = loadModelPolicy();
  const text = JSON.stringify(policy);
  assert.doesNotMatch(text, /gpt-|claude-|gemini|o[34]-mini|anthropic|openai/i);
});

test('a malformed or incomplete policy fails closed', () => {
  assert.throws(() => parseModelPolicyText('schemaVersion: 2\npolicyRevision: x\n'), /schemaVersion must be 1/);
  assert.throws(
    () => parseModelPolicyText('schemaVersion: 1\npolicyRevision: x\nthresholds:\n  retryEscalationThreshold: 2\n  stagnationThreshold: 3\nmodelClasses:\n  kernel:\n    providerModelRequired: false\nactionDefaults:\n  plan:\n    modelClass: frontier_reasoning\n    role: planner\n    permissions: plan_write\n'),
    /has no default for action/,
  );
  assert.throws(() => parseModelPolicyText('schemaVersion: 1\nunknownField: 1\n'), /Unknown field/);
});

test('action defaults route planning to frontier, implementation to value, proof to the kernel', () => {
  const frontier = ['understand', 'design', 'plan', 'replan', 'review_contract', 'review_engineering'];
  for (const action of frontier) {
    assert.equal(resolveModelRoute({ runId: 'r', actionKind: action }).modelClass, 'frontier_reasoning', action);
  }
  for (const action of ['implement', 'debug']) {
    assert.equal(resolveModelRoute({ runId: 'r', actionKind: action }).modelClass, 'value_coding', action);
  }
  for (const action of ['prove', 'close']) {
    const decision = resolveModelRoute({ runId: 'r', actionKind: action });
    assert.equal(decision.modelClass, 'kernel');
    assert.equal(requiresProviderModel(decision.modelClass), false);
    assert.deepEqual([...decision.reasonCodes], ['KERNEL_ONLY_ACTION']);
  }
});

test('reviews demand read-only permissions and implementation demands workspace write', () => {
  assert.equal(resolveModelRoute({ runId: 'r', actionKind: 'review_engineering' }).permissions, 'read_only');
  assert.equal(resolveModelRoute({ runId: 'r', actionKind: 'implement' }).permissions, 'workspace_write');
  assert.equal(resolveModelRoute({ runId: 'r', actionKind: 'plan' }).permissions, 'plan_write');
  assert.equal(resolveModelRoute({ runId: 'r', actionKind: 'prove' }).permissions, 'kernel_runtime');
});
