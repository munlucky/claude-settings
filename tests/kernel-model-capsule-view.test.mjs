import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModelCapsuleView, findControlMetadataLeaks, CONTROL_ONLY_CAPSULE_FIELDS } from '../scripts/host/kernel/model-capsule-view.mjs';

const persistedCapsule = () => ({
  capsuleId: 'capsule-1',
  stepId: 'step-1',
  runId: 'run-1',
  routeDecisionId: 'route-abc',
  admissionId: 'adm-1',
  mutationRevision: 3,
  workspaceIdentity: 'sha256:workspace',
  createdAt: '2026-07-29T00:00:00.000Z',
  provenance: { capsuleDigest: 'sha256:capsule' },
  role: 'implementer',
  objective: 'Add deterministic segments.',
  acceptance: ['Segments are byte-identical.'],
  constraints: ['Authority unchanged.'],
  nonGoals: ['Semantic cache.'],
  permissions: 'workspace_write',
  workUnit: { allowedPaths: ['scripts/kernel/'], forbiddenPaths: ['scripts/kernel/completion.mjs'], expectedOutputs: ['context-segments.mjs'], dependencies: [] },
  repositoryContext: { entrypoints: ['bin/moon-relay-kernel.mjs'], knownCommands: ['test:kernel'], baseline: { status: 'deferred' } },
  verification: { obligations: [{ obligationId: 'default', allowedCommandRefs: ['test:kernel'] }] },
});

test('the view carries what the model needs to do the work', () => {
  const view = buildModelCapsuleView(persistedCapsule());
  assert.equal(view.objective, 'Add deterministic segments.');
  assert.deepEqual(view.workUnit.allowedPaths, ['scripts/kernel/']);
  assert.deepEqual(view.workUnit.forbiddenPaths, ['scripts/kernel/completion.mjs']);
  assert.equal(view.verification.obligations.length, 1);
  assert.equal(view.permissions, 'workspace_write');
});

test('no control or provenance field survives the projection', () => {
  const view = buildModelCapsuleView(persistedCapsule());
  assert.deepEqual(findControlMetadataLeaks(view), []);
  for (const field of CONTROL_ONLY_CAPSULE_FIELDS) {
    assert.ok(!Object.hasOwn(view, field), `view exposes control field: ${field}`);
  }
});

test('a field added to the persisted capsule later is not silently forwarded', () => {
  // The projection is an allowlist, so a new persisted field defaults to hidden.
  const capsule = { ...persistedCapsule(), internalLeaseToken: 'lease-secret', debugTranscript: 'planner reasoning' };
  const view = buildModelCapsuleView(capsule);
  assert.ok(!JSON.stringify(view).includes('lease-secret'));
  assert.ok(!JSON.stringify(view).includes('planner reasoning'));
});

test('an empty capsule projects to empty collections rather than undefined', () => {
  const view = buildModelCapsuleView({});
  assert.deepEqual(view.acceptance, []);
  assert.deepEqual(view.workUnit.allowedPaths, []);
  assert.deepEqual(view.verification.obligations, []);
  assert.equal(view.permissions, null);
});
