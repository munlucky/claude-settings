import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveVerificationPolicy, MODEL_LOCAL_CHECKS, KERNEL_AUTHORITATIVE_EVIDENCE,
} from '../scripts/host/kernel/common-model-policy.mjs';

test('verification runs smallest-first and reports what it ran', () => {
  const policy = resolveVerificationPolicy({});
  assert.deepEqual([...policy.order], [
    'smallest-relevant-test',
    'done-when-regression',
    'final-diff-review',
    'report-commands-and-risks',
  ]);
});

test('model-local checks and Kernel evidence are disjoint', () => {
  const overlap = MODEL_LOCAL_CHECKS.filter((check) => KERNEL_AUTHORITATIVE_EVIDENCE.includes(check));
  assert.deepEqual(overlap, []);
  assert.equal(resolveVerificationPolicy({}).duplicateKernelProof, false);
});

test('requested commands come from the obligations, deduplicated and ordered', () => {
  const policy = resolveVerificationPolicy({
    obligations: [
      { obligationId: 'a', allowedCommandRefs: ['test:kernel', 'test:routing'] },
      { obligationId: 'b', allowedCommandRefs: ['test:kernel'] },
    ],
  });
  assert.deepEqual([...policy.requestedCommandRefs], ['test:kernel', 'test:routing']);
});

test('an obligation with no bound commands requests nothing rather than inventing one', () => {
  assert.deepEqual([...resolveVerificationPolicy({ obligations: [{ obligationId: 'a' }] }).requestedCommandRefs], []);
});

test('done-when conditions are carried through to the policy', () => {
  const policy = resolveVerificationPolicy({ doneWhen: ['npm run test:kernel passes'] });
  assert.deepEqual([...policy.doneWhen], ['npm run test:kernel passes']);
});
