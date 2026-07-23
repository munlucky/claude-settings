import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveKernelCapabilities } from '../scripts/kernel/capability-resolver.mjs';

test('kernel-commit-closeout capability is selected only when gitCloseoutRequested, completionAccepted, and knowledgeCommitReceiptExists are true', () => {
  // Case 1: gitCloseoutRequested is false -> kernel-commit-closeout deferred
  const cap1 = resolveKernelCapabilities({
    gitCloseoutRequested: false,
    completionAccepted: true,
    knowledgeCommitReceiptExists: true,
  });
  const closeout1 = cap1.selected.find((c) => c.id === 'kernel-commit-closeout');
  assert.equal(closeout1, undefined);

  // Case 2: All 3 conditions true -> kernel-commit-closeout selected
  const cap2 = resolveKernelCapabilities({
    gitCloseoutRequested: true,
    completionAccepted: true,
    knowledgeCommitReceiptExists: true,
  });
  const closeout2 = cap2.selected.find((c) => c.id === 'kernel-commit-closeout');
  assert.ok(closeout2);
  assert.equal(closeout2.id, 'kernel-commit-closeout');
});
