import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, rm } from 'node:fs/promises';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';

test('Cross-Run Knowledge Reuse E2E: verifies direct SQLite knowledge context retrieval, projection resilience, and project isolation', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'kernel-reuse-e2e-'));
  const kernelHome = path.join(tmpDir, '.moon-relay-kernel');
  const projectRoot = path.join(tmpDir, 'project-root');

  const controlPlane = await createKernelControlPlane({
    projectRoot,
    runtimeHome: kernelHome,
  });

  const projectId = 'e2e-knowledge-project';

  // --- 1. Run 1: Create, Record Proof, Record Typed Candidates & Finalize ---
  const run1 = await controlPlane.startRun({
    runId: 'run-e2e-1',
    objective: 'Implement authentication service',
    projectId,
  });
  assert.equal(run1.runId, 'run-e2e-1');

  // Transition run to EXECUTE -> PROVE state to allow proof recording
  await controlPlane.transition('run-e2e-1', 'EXECUTE');
  await controlPlane.transition('run-e2e-1', 'PROVE');

  const proofDigest = 'sha256:' + '1'.repeat(64);
  await controlPlane.recordProof('run-e2e-1', {
    obligationId: 'default',
    status: 'passed',
    evidenceRef: 'proof:test-e2e-1',
    evidenceDigest: proofDigest,
    exitCode: 0,
    command: 'npm test',
  });

  // Transition run to CLOSE state to allow acceptance finalization
  await controlPlane.transition('run-e2e-1', 'CLOSE');

  // Record typed knowledge observations (architecture_decision & semantic_fact)
  const observations = [
    {
      id: 'arch-jwt-01',
      proposedType: 'architecture_decision',
      statement: 'Use JWT stateless session tokens for auth service',
      rationale: 'Scalable auth without session DB lookup',
      trustTier: 'verified',
      isGlobal: true,
    },
    {
      id: 'fact-port-4000',
      proposedType: 'semantic_fact',
      statement: 'Authentication service runs on port 4000',
      trustTier: 'verified',
      isGlobal: true,
    },
    {
      id: 'domain-auth-term',
      proposedType: 'domain_term',
      statement: 'Access Token: Short-lived bearer token used for API requests',
      trustTier: 'verified',
      isGlobal: true,
    },
  ];

  await controlPlane.recordKnowledgeObservations('run-e2e-1', {
    observations,
    approvals: [
      { candidateId: 'arch-jwt-01', approved: true, approvedBy: 'user' },
      { candidateId: 'fact-port-4000', approved: true, approvedBy: 'user' },
      { candidateId: 'domain-auth-term', approved: true, approvedBy: 'user' },
    ],
  });

  const finalizationResult = await controlPlane.finalizeRun('run-e2e-1', {
    gitCloseoutRequest: { mode: 'none', approvalReceipt: { approved: true, approvedBy: 'user' } },
  });

  assert.equal(finalizationResult.finalizationStatus, 'completed');
  assert.equal(finalizationResult.knowledgeStatus, 'committed');

  // --- 2. Run 2: Start new Run and verify automatic retrieval from SQLite ---
  const run2 = await controlPlane.startRun({
    runId: 'run-e2e-2',
    objective: 'Build user dashboard requiring auth',
    projectId,
  });
  assert.equal(run2.runId, 'run-e2e-2');

  const run2FrameContext = await controlPlane.buildStageContext('run-e2e-2', { stage: 'FRAME' });
  assert.ok(run2FrameContext.knowledgeContext);
  assert.equal(run2FrameContext.knowledgeContext.status, 'ready');

  const promptBlockText = run2FrameContext.knowledgeContext.promptBlock;
  assert.ok(promptBlockText.includes('Use JWT stateless session tokens for auth service'));
  assert.ok(promptBlockText.includes('Authentication service runs on port 4000'));
  assert.ok(promptBlockText.includes('Access Token: Short-lived bearer token used for API requests'));

  // --- 3. Projection Tolerance: Delete physical projection directory ---
  const projectionDir = path.join(kernelHome, 'state', 'projects', projectId, 'knowledge');
  await rm(projectionDir, { recursive: true, force: true });

  // Query stage context for Run 2 again after projection deletion
  const run2ShapeContext = await controlPlane.buildStageContext('run-e2e-2', { stage: 'SHAPE' });
  assert.ok(run2ShapeContext.knowledgeContext);
  assert.equal(run2ShapeContext.knowledgeContext.status, 'ready');

  const shapePromptBlock = run2ShapeContext.knowledgeContext.promptBlock;
  assert.ok(shapePromptBlock.includes('Use JWT stateless session tokens for auth service'));
  assert.ok(shapePromptBlock.includes('Authentication service runs on port 4000'));

  // --- 4. Project Isolation: Verify different projectId cannot see this knowledge ---
  const runOther = await controlPlane.startRun({
    runId: 'run-e2e-other',
    objective: 'Unrelated payment service work',
    projectId: 'unrelated-project-id',
  });

  const otherContext = await controlPlane.buildStageContext('run-e2e-other', { stage: 'SHAPE' });
  const otherPromptBlock = otherContext.knowledgeContext.promptBlock;
  assert.equal(otherPromptBlock.includes('Use JWT stateless session tokens for auth service'), false);
  assert.equal(otherPromptBlock.includes('Authentication service runs on port 4000'), false);
});
