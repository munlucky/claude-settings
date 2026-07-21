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
  assert.ok(a.receipt.included[0].contentDigest);
});

test('changing content with same id and revision produces distinct digest', () => {
  const baseInput = {
    stage: 'EXECUTE',
    principles: ['minimal'],
    taskContract: { objective: 'x' },
    stageRecords: [{ id: 'code-1', type: 'code', content: 'allow=true', revision: 'abc' }],
    policyRevision: 'p1',
  };

  const modifiedContentInput = {
    ...baseInput,
    stageRecords: [{ id: 'code-1', type: 'code', content: 'allow=false', revision: 'abc' }],
  };

  const rBase = buildKernelContext(baseInput);
  const rContent = buildKernelContext(modifiedContentInput);

  assert.notEqual(rBase.receipt.digest, rContent.receipt.digest);
  assert.notEqual(rBase.receipt.receiptId, rContent.receipt.receiptId);
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

test('principles pass through text secret sanitization', () => {
  const input = {
    stage: 'EXECUTE',
    principles: ['token=secret12345'],
  };
  const ctx = buildKernelContext(input);
  assert.doesNotMatch(ctx.promptBlock, /secret12345/);
  assert.match(ctx.promptBlock, /\[REDACTED\]/);
});
