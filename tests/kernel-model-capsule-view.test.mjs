import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModelCapsuleView, findControlMetadataLeaks, CONTROL_ONLY_CAPSULE_FIELDS } from '../scripts/host/kernel/model-capsule-view.mjs';
import { normalizeReviewCapsule } from '../scripts/kernel/run/execution-capsule.mjs';

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

test('an empty capsule projects empty top-level collections and no fabricated sub-objects', () => {
  const view = buildModelCapsuleView({});
  assert.deepEqual(view.acceptance, []);
  assert.equal(view.permissions, null);
  // Regression: a reviewer capsule never has workUnit/repositoryContext/
  // verification at all (buildReviewCapsule enforces that shape). Always
  // fabricating an empty workUnit/verification here would hand a reviewer
  // an implementer-shaped object it was never meant to see.
  assert.ok(!Object.hasOwn(view, 'workUnit'));
  assert.ok(!Object.hasOwn(view, 'repositoryContext'));
  assert.ok(!Object.hasOwn(view, 'verification'));
});

test('a reviewer-shaped capsule with no workUnit does not gain one', () => {
  const view = buildModelCapsuleView({
    role: 'reviewer',
    objective: 'review the change',
    acceptance: ['it works'],
    permissions: { filesystem: 'read_only' },
  }, { role: 'reviewer' });
  assert.equal(view.role, 'reviewer');
  assert.equal(view.permissions.filesystem, 'read_only');
  assert.equal(view.workUnit, undefined);
  assert.equal(view.repositoryContext, undefined);
  assert.equal(view.verification, undefined);
});

test('an implementer-shaped capsule keeps its populated workUnit and verification', () => {
  const view = buildModelCapsuleView({
    workUnit: { allowedPaths: ['src/'] },
    verification: { obligations: [{ obligationId: 'default' }] },
  });
  assert.deepEqual(view.workUnit.allowedPaths, ['src/']);
  assert.deepEqual(view.verification.obligations, [{ obligationId: 'default' }]);
});

const realReviewCapsule = () => normalizeReviewCapsule({
  runId: 'r-1',
  reviewScope: { stage: 'contract', requiredChecks: ['test:kernel'], obligationId: 'security-review' },
  subject: { changedPaths: ['src/auth/login.mjs'], diffDigest: `sha256:${'b'.repeat(64)}`, workspaceIdentity: `sha256:${'a'.repeat(64)}`, mutationRevision: 2 },
  verificationEvidence: [{ obligationId: 'default', status: 'passed', evidenceDigest: `sha256:${'c'.repeat(64)}`, command: 'npm test', exitCode: 0 }],
  implementationReceipt: { actorSessionId: `sha256:${'d'.repeat(64)}`, capsuleDigest: `sha256:${'e'.repeat(64)}`, modelClass: 'value_coding', resolvedModel: 'model-a' },
});

test('a real review capsule projects the fields a reviewer actually needs to judge', () => {
  // Regression: none of subject/verificationEvidence/reviewScope were
  // allowlisted, so a real reviewer turn's launcher received a capsule with
  // nothing to review — no changed files, no evidence, no scope.
  const view = buildModelCapsuleView(realReviewCapsule(), { role: 'reviewer' });
  assert.deepEqual(view.changedPaths, ['src/auth/login.mjs']);
  assert.equal(view.verificationEvidence.length, 1);
  assert.equal(view.verificationEvidence[0].obligationId, 'default');
  assert.equal(view.reviewScope.stage, 'contract');
  assert.deepEqual(view.reviewScope.requiredChecks, ['test:kernel']);
  assert.equal(view.reviewScope.obligationId, 'security-review');
});

test('subject.workspaceIdentity/mutationRevision and the whole implementationReceipt stay out of the view', () => {
  const view = buildModelCapsuleView(realReviewCapsule(), { role: 'reviewer' });
  assert.deepEqual(findControlMetadataLeaks(view), []);
  assert.equal(view.implementationReceipt, undefined);
  const serialized = JSON.stringify(view);
  assert.ok(!serialized.includes(realReviewCapsule().subject.diffDigest));
  assert.ok(!serialized.includes(realReviewCapsule().implementationReceipt.capsuleDigest));
});

test('the greenfield walking skeleton reaches the view; an absent one does not fabricate a repositoryContext key', () => {
  const withSkeleton = buildModelCapsuleView({ repositoryContext: { walkingSkeleton: { slices: [{ name: 'auth' }] } } });
  assert.deepEqual(withSkeleton.repositoryContext.walkingSkeleton, { slices: [{ name: 'auth' }] });
  const withoutSkeleton = buildModelCapsuleView({ repositoryContext: { entrypoints: ['bin/x.mjs'] } });
  assert.equal(withoutSkeleton.repositoryContext.walkingSkeleton, null);
});
