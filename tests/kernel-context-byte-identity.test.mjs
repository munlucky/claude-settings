import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKernelContextSegments } from '../scripts/kernel/context-segments.mjs';

const base = () => ({
  hostStable: { principles: [{ id: 'p1', guidance: 'Keep the change minimal.' }] },
  projectStable: {
    policyAnchors: [{ id: 'pa1', type: 'policy_anchor', revision: 'r1', statement: 'Core stays provider-neutral.' }],
    ontologyConstraints: [{ id: 'oc1', type: 'ontology_constraint', revision: 'r1', severity: 'invariant', statement: 'Unmeasured values stay null.' }],
  },
  runStable: { objective: 'Stabilize the prefix.', acceptance: ['Segments are deterministic.'], constraints: ['Authority unchanged.'] },
  volatile: {
    step: { stepId: 'step-1', objective: 'Add segments.' },
    evidence: [{ obligationId: 'default', status: 'pending', evidenceDigest: 'sha256:aaa' }],
  },
});

test('identical state produces identical bytes and digests', () => {
  const first = buildKernelContextSegments(base());
  const second = buildKernelContextSegments(base());
  assert.equal(first.promptBlock, second.promptBlock);
  for (const name of ['hostStable', 'projectStable', 'runStable', 'volatile']) {
    assert.equal(first.segments[name].content, second.segments[name].content);
    assert.equal(first.segments[name].digest, second.segments[name].digest);
  }
});

test('observation timestamps do not move a stable digest', () => {
  const withTimes = base();
  withTimes.projectStable.policyAnchors[0].observedAt = '2026-07-29T00:00:00.000Z';
  withTimes.projectStable.policyAnchors[0].createdAt = '2026-01-01T00:00:00.000Z';
  assert.equal(
    buildKernelContextSegments(withTimes).segments.projectStable.digest,
    buildKernelContextSegments(base()).segments.projectStable.digest,
  );
});

test('a relevance score tie does not leak insertion order into the digest', () => {
  const scored = base();
  scored.projectStable.policyAnchors[0].score = 0.91;
  assert.equal(
    buildKernelContextSegments(scored).segments.projectStable.digest,
    buildKernelContextSegments(base()).segments.projectStable.digest,
  );
});

test('changing evidence moves only the volatile segment', () => {
  const before = buildKernelContextSegments(base());
  const changed = base();
  changed.volatile.evidence = [{ obligationId: 'default', status: 'passed', evidenceDigest: 'sha256:bbb' }];
  const after = buildKernelContextSegments(changed);
  assert.notEqual(before.segments.volatile.digest, after.segments.volatile.digest);
  for (const stable of ['hostStable', 'projectStable', 'runStable']) {
    assert.equal(before.segments[stable].digest, after.segments[stable].digest);
  }
});

test('changing the task contract moves run-stable and nothing above it', () => {
  const before = buildKernelContextSegments(base());
  const changed = base();
  changed.runStable.objective = 'Route Codex turns by action and risk.';
  const after = buildKernelContextSegments(changed);
  assert.notEqual(before.segments.runStable.digest, after.segments.runStable.digest);
  assert.equal(before.segments.projectStable.digest, after.segments.projectStable.digest);
  assert.equal(before.segments.hostStable.digest, after.segments.hostStable.digest);
});

test('global knowledge moves project-stable; task-local knowledge does not', () => {
  const baseline = buildKernelContextSegments(base());

  const globalChanged = base();
  globalChanged.projectStable.domainTerms = [{ id: 'dt1', type: 'domain_term', revision: 'r1', statement: 'A capsule is a bounded work unit.' }];
  assert.notEqual(baseline.segments.projectStable.digest, buildKernelContextSegments(globalChanged).segments.projectStable.digest);

  const taskChanged = base();
  taskChanged.volatile.taskKnowledge = [{ id: 'tk1', type: 'semantic_fact', revision: 'r1', statement: 'The dispatcher files receipts.' }];
  const taskResult = buildKernelContextSegments(taskChanged);
  assert.equal(baseline.segments.projectStable.digest, taskResult.segments.projectStable.digest);
  assert.notEqual(baseline.segments.volatile.digest, taskResult.segments.volatile.digest);
});
