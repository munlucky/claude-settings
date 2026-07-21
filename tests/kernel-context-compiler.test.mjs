import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildKernelContext } from '../scripts/kernel/context-build.mjs';

test('same context input produces deterministic receipt', () => {
  const input = {
    stage: 'EXECUTE',
    principles: ['minimal'],
    taskContract: { objective: 'x' },
    stageRecords: [{ id: 'code-1', type: 'code', content: 'const x=1', revision: 'abc' }],
    policyRevision: 'p1',
  };
  const a = buildKernelContext(input);
  const b = buildKernelContext(input);
  assert.equal(a.receipt.digest, b.receipt.digest);
  assert.equal(a.receipt.receiptId, b.receipt.receiptId);
});

test('changing nested source identity or revision produces distinct digest', () => {
  const baseInput = {
    stage: 'EXECUTE',
    principles: ['minimal'],
    taskContract: { objective: 'x' },
    stageRecords: [{ id: 'code-1', type: 'code', content: 'const x=1', revision: 'abc' }],
    policyRevision: 'p1',
  };

  const modifiedIdInput = {
    ...baseInput,
    stageRecords: [{ id: 'code-2', type: 'code', content: 'const x=1', revision: 'abc' }],
  };

  const modifiedRevInput = {
    ...baseInput,
    stageRecords: [{ id: 'code-1', type: 'code', content: 'const x=1', revision: 'xyz' }],
  };

  const rBase = buildKernelContext(baseInput);
  const rId = buildKernelContext(modifiedIdInput);
  const rRev = buildKernelContext(modifiedRevInput);

  assert.notEqual(rBase.receipt.digest, rId.receipt.digest);
  assert.notEqual(rBase.receipt.receiptId, rId.receipt.receiptId);
  assert.notEqual(rBase.receipt.digest, rRev.receipt.digest);
  assert.notEqual(rBase.receipt.receiptId, rRev.receipt.receiptId);
});
