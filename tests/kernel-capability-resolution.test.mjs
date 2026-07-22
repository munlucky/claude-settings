import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveKernelCapabilities, KernelCapabilityError } from '../scripts/kernel/capability-resolver.mjs';
import { routeTask } from '../scripts/kernel/route.mjs';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const kernelProject = async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'krn-capability-route-'));
  await mkdir(path.join(root, '.moon-relay'), { recursive: true });
  await writeFile(path.join(root, '.moon-relay', 'track.yaml'), 'schemaVersion: 1\ntrack: kernel\nproduct: moon-relay-kernel\n');
  return root;
};

test('T0 analysis does not activate mutation, review, debugging, or verification capabilities', () => {
  const decision = resolveKernelCapabilities({ taskClass: 'analysis', riskTier: 'T0', sourceMutation: false });
  assert.deepEqual(decision.selected, []);
  assert.equal(decision.revision, 'kernel-capability-conditions.v1');
});

test('behavior-changing bug selects diagnosis, minimal change, TDD, and verification in stable order', () => {
  const decision = resolveKernelCapabilities({ taskClass: 'bug', riskTier: 'T1', behaviorChanging: true });
  assert.deepEqual(decision.selected.map((entry) => entry.id), [
    'kernel-minimal-correct-change',
    'kernel-test-driven-development',
    'kernel-diagnosing-bugs',
    'kernel-review-standards',
    'kernel-verification-before-completion',
  ]);
});

test('complex ambiguous work selects domain and slicing capabilities and records reasons', () => {
  const project = { taskClass: 'long-running', complex: true, filesChanged: 12, ambiguityChangesOutcome: true, riskTier: 'T2', behaviorChanging: true };
  const decision = resolveKernelCapabilities(project);
  const ids = new Set(decision.selected.map((entry) => entry.id));
  for (const expected of ['kernel-domain-modeling', 'kernel-tracer-slicing', 'kernel-review-spec', 'kernel-review-complexity']) assert.ok(ids.has(expected));
  assert.ok(decision.selected.every((entry) => entry.guidance && entry.activationCondition));
});

test('unknown caller capability is typed rejected and known forced-off capability is ignored with reason', async () => {
  assert.throws(() => resolveKernelCapabilities({ taskClass: 'analysis', capabilities: ['not-a-capability'] }), (error) => error instanceof KernelCapabilityError && error.code === 'kernel_capability_unknown');
  const decision = resolveKernelCapabilities({ taskClass: 'analysis', capabilities: ['kernel-diagnosing-bugs'] });
  assert.deepEqual(decision.ignoredRequested, [{ id: 'kernel-diagnosing-bugs', reason: 'caller_forced_condition_not_met' }]);
  const root = await kernelProject();
  const routed = routeTask({ taskClass: 'analysis', riskTier: 'T0', sourceMutation: false }, { projectRoot: root });
  assert.equal(routed.capabilityDecision.revision, 'kernel-capability-conditions.v1');
  assert.deepEqual(routed.capabilities, []);
});
