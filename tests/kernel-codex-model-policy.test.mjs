import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCodexModelPolicy, resolveCodexModelAlias, CODEX_MODELS } from '../scripts/host/kernel/codex-model-policy.mjs';

test('everyday implementation and debugging default to Terra at medium', () => {
  for (const actionKind of ['implement', 'debug']) {
    const policy = resolveCodexModelPolicy({ actionKind });
    assert.equal(policy.model, CODEX_MODELS.terra);
    assert.equal(policy.reasoning, 'medium');
    assert.ok(policy.reasons.includes('default-implementation'));
  }
});

test('planning actions route to Sol at high', () => {
  for (const actionKind of ['understand', 'design', 'plan', 'replan']) {
    const policy = resolveCodexModelPolicy({ actionKind });
    assert.equal(policy.model, CODEX_MODELS.sol);
    assert.equal(policy.reasoning, 'high');
  }
});

test('complex implementation and large refactors escalate to Sol high', () => {
  for (const complexity of ['complex', 'large-refactor']) {
    const policy = resolveCodexModelPolicy({ actionKind: 'implement', complexity });
    assert.equal(policy.model, CODEX_MODELS.sol);
    assert.equal(policy.reasoning, 'high');
  }
});

test('Luna is reached only by an explicitly routine batch shape', () => {
  const luna = resolveCodexModelPolicy({ actionKind: 'implement', complexity: 'routine-batch' });
  assert.equal(luna.model, CODEX_MODELS.luna);
  assert.equal(luna.reasoning, 'low');
  // Ambiguity must never fall through to the cheapest tier.
  assert.equal(resolveCodexModelPolicy({ actionKind: 'implement', complexity: 'ambiguous' }).model, CODEX_MODELS.terra);
});

test('max is never selected on the default path', () => {
  const selections = [
    { actionKind: 'implement' }, { actionKind: 'debug' }, { actionKind: 'plan' },
    { actionKind: 'design' }, { actionKind: 'review_engineering' },
    { actionKind: 'review_contract', riskTier: 'T3', shapes: ['security'] },
    { actionKind: 'implement', repeatedFailure: true },
    { actionKind: 'implement', complexity: 'routine-batch' },
  ].map((input) => resolveCodexModelPolicy(input).reasoning);
  assert.ok(!selections.includes('max'));
});

test('an explicit request can reach max and is attributed', () => {
  const policy = resolveCodexModelPolicy({ actionKind: 'implement', userRequested: { reasoning: 'max' } });
  assert.equal(policy.reasoning, 'max');
  assert.ok(policy.reasons.includes('user-requested-reasoning'));
});

test('the gpt-5.6 alias resolves to an explicit Sol id for reproducibility', () => {
  assert.equal(resolveCodexModelAlias('gpt-5.6'), CODEX_MODELS.sol);
  assert.equal(resolveCodexModelAlias('gpt-5.6-terra'), CODEX_MODELS.terra);
  const policy = resolveCodexModelPolicy({ userRequested: { model: 'gpt-5.6' } });
  assert.equal(policy.model, CODEX_MODELS.sol);
});
