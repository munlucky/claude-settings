import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCodexModelPolicy, resolveCodexModelAlias, CODEX_MODELS } from '../scripts/host/kernel/codex-model-policy.mjs';

test('ordinary implementation and debugging default to Luna at max', () => {
  for (const actionKind of ['implement', 'debug']) {
    const policy = resolveCodexModelPolicy({ actionKind });
    assert.equal(policy.model, CODEX_MODELS.luna);
    assert.equal(policy.reasoning, 'max');
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

test('routine batch uses the same Luna max actor as ordinary work', () => {
  const luna = resolveCodexModelPolicy({ actionKind: 'implement', complexity: 'routine-batch' });
  assert.equal(luna.model, CODEX_MODELS.luna);
  assert.equal(luna.reasoning, 'max');
  assert.equal(resolveCodexModelPolicy({ actionKind: 'implement', complexity: 'standard' }).model, CODEX_MODELS.luna);
});

test('max is the default implementation effort and explicit requests remain attributable', () => {
  const selections = [
    { actionKind: 'implement' }, { actionKind: 'debug' }, { actionKind: 'plan' },
    { actionKind: 'design' }, { actionKind: 'review_engineering' },
    { actionKind: 'review_contract', riskTier: 'T3', shapes: ['security'] },
    { actionKind: 'implement', repeatedFailure: true },
    { actionKind: 'implement', complexity: 'routine-batch' },
  ].map((input) => resolveCodexModelPolicy(input).reasoning);
  assert.ok(selections.includes('max'));
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
