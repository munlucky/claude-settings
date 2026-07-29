import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCodexModelPolicy, CODEX_MODELS, CODEX_REASONING_EFFORTS } from '../scripts/host/kernel/codex-model-policy.mjs';

test('medium is the starting point for ordinary work', () => {
  assert.equal(resolveCodexModelPolicy({ actionKind: 'implement' }).reasoning, 'medium');
});

test('engineering review uses Sol high; a protected review uses xhigh', () => {
  assert.equal(resolveCodexModelPolicy({ actionKind: 'review_engineering' }).reasoning, 'high');
  for (const shape of ['security', 'migration', 'authentication', 'authorization', 'payment', 'data-loss', 'irreversible']) {
    const policy = resolveCodexModelPolicy({ actionKind: 'review_contract', shapes: [shape] });
    assert.equal(policy.reasoning, 'xhigh', shape);
    assert.equal(policy.model, CODEX_MODELS.sol);
  }
  assert.equal(resolveCodexModelPolicy({ actionKind: 'review_engineering', riskTier: 'T3' }).reasoning, 'xhigh');
});

test('repeated failure escalates model and reasoning together', () => {
  const policy = resolveCodexModelPolicy({ actionKind: 'implement', repeatedFailure: true });
  assert.equal(policy.model, CODEX_MODELS.sol);
  assert.equal(policy.reasoning, 'xhigh');
  assert.ok(policy.reasons.includes('repeated-failure-escalation'));
});

test('an unrecognized requested reasoning is ignored rather than passed through', () => {
  const policy = resolveCodexModelPolicy({ actionKind: 'implement', userRequested: { reasoning: 'ultra' } });
  assert.equal(policy.reasoning, 'medium');
  assert.ok(!policy.reasons.includes('user-requested-reasoning'));
});

test('the reasoning vocabulary is closed and ordered cheapest-first', () => {
  assert.deepEqual([...CODEX_REASONING_EFFORTS], ['low', 'medium', 'high', 'xhigh', 'max']);
});
