import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import { resolveKernelProjectIdentity } from '../scripts/kernel/project-identity.mjs';
import { ensureKnowledgeStoreDirectories, readProjectRevision, loadAllProjectRecords } from '../scripts/kernel/knowledge/store.mjs';
import { buildProjectKnowledgeContext } from '../scripts/kernel/knowledge/context-load.mjs';
import { extractKnowledgeCandidates } from '../scripts/kernel/knowledge/candidate-extract.mjs';
import { reviewKnowledgeCandidates } from '../scripts/kernel/knowledge/candidate-review.mjs';
import { commitProjectKnowledge } from '../scripts/kernel/knowledge/commit.mjs';

test('Full Kernel Project Knowledge Lifecycle E2E Scenario A (load -> prove -> accepted -> commit)', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'kernel-e2e-test-'));
  const env = { MOON_RELAY_KERNEL_HOME: tmp };

  // Step 1: Project identity & knowledge store setup
  const identity = resolveKernelProjectIdentity({ cwd: tmp, env });
  const projectId = identity.projectId;
  await ensureKnowledgeStoreDirectories(projectId, { env });

  // Step 2: Context Load (FRAME)
  const ctx = await buildProjectKnowledgeContext({ projectId, stage: 'FRAME', env });
  assert.equal(ctx.status, 'ready');
  assert.ok(ctx.digest);

  // Step 3: Candidate extraction & review
  const rawCandidates = extractKnowledgeCandidates({
    runId: 'e2e-run-1',
    projectId,
    objective: 'Implement project knowledge lifecycle',
    changedFiles: ['scripts/kernel/knowledge/store.mjs'],
    evidencePack: { status: 'pass', digest: 'ev-digest-e2e' },
    observedStatements: ['Verified E2E knowledge lifecycle flow.'],
  });

  const reviewResult = await reviewKnowledgeCandidates({
    projectId,
    candidates: rawCandidates,
    evidencePack: { status: 'pass', digest: 'ev-digest-e2e' },
    env,
  });

  assert.equal(reviewResult.status, 'passed');
  assert.equal(reviewResult.verifiedCandidates.length, 1);

  // Step 4: Knowledge Commit Gated by Accepted Completion
  const mockAcceptedStore = {
    getRun: () => ({ runId: 'e2e-run-1', projectId, sourceIdentity: 's-e2e', mutationRevision: 1 }),
    getCompletionDecision: () => ({ decision: 'accepted', sourceIdentity: 's-e2e', mutationRevision: 1 }),
  };

  const revBefore = await readProjectRevision(projectId, { env });
  const receipt = await commitProjectKnowledge({
    runId: 'e2e-run-1',
    projectId,
    stateStore: mockAcceptedStore,
    candidates: reviewResult.verifiedCandidates,
    env,
  });

  assert.equal(receipt.status, 'committed');
  assert.equal(receipt.revisionBefore, revBefore);
  assert.equal(receipt.revisionAfter, '2');

  const records = await loadAllProjectRecords(projectId, { env });
  assert.equal(records.semanticFacts.length, 1);
  assert.equal(records.semanticFacts[0].statement, 'Verified E2E knowledge lifecycle flow.');
});
