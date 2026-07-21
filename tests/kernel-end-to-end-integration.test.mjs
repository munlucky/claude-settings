import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';
import { routeSkill, resolveExplicitSkillInvocation } from '../scripts/skill-router.mjs';
import { installKernel, uninstallKernel } from '../scripts/kernel/installer.mjs';

const validDigest = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

test('End-to-End Kernel Product Execution Flow', async () => {
  const tmpHome = await mkdtemp(path.join(os.tmpdir(), 'krn-e2e-home-'));
  const tmpProject = await mkdtemp(path.join(os.tmpdir(), 'krn-e2e-proj-'));

  // 1. Install Kernel track in project
  await installKernel({ targetRoot: tmpProject });

  // 2. Explicit skill resolution for $moon-relay-kernel
  const explicitRes = await resolveExplicitSkillInvocation('$moon-relay-kernel', { repoRoot: process.cwd(), track: 'kernel' });
  assert.equal(explicitRes.status, 'pass');
  assert.equal(explicitRes.selected, 'moon-relay-kernel');

  // 3. Initialize Control Plane & start run
  const cp = await createKernelControlPlane({ runtimeHome: tmpHome });
  const run = await cp.startRun({
    runId: 'e2e-run-1',
    objective: 'Complete E2E test',
    sourceIdentity: 'src-e2e-1',
    taskContract: { riskTier: 'T3', acceptanceCriteria: ['criteria-1'] },
  });

  assert.equal(run.proofTier, 'T3');
  assert.equal(run.evidenceTier, 'E2');
  assert.deepEqual(run.requiredObligations, ['static-analysis', 'unit-test', 'security-review']);

  // 4. Build context
  const contextReceipt = await cp.buildStageContext('e2e-run-1', { stage: 'EXECUTE' });
  assert.equal(contextReceipt.schemaVersion, 1);

  // 5. Workflow transitions: FRAME -> SHAPE -> EXECUTE -> PROVE
  await cp.transition('e2e-run-1', 'SHAPE');
  await cp.transition('e2e-run-1', 'EXECUTE');
  await cp.transition('e2e-run-1', 'PROVE');

  // 6. Record proofs for all 3 required obligations
  await cp.recordProof('e2e-run-1', {
    obligationId: 'static-analysis',
    status: 'passed',
    evidenceRef: 'evidence://static/1',
    command: 'npm run lint',
    exitCode: 0,
    evidenceDigest: validDigest,
    sourceIdentity: 'src-e2e-1',
  });

  await cp.recordProof('e2e-run-1', {
    obligationId: 'unit-test',
    status: 'passed',
    evidenceRef: 'evidence://unit/1',
    command: 'npm test',
    exitCode: 0,
    evidenceDigest: validDigest,
    sourceIdentity: 'src-e2e-1',
  });

  await cp.recordProof('e2e-run-1', {
    obligationId: 'security-review',
    status: 'passed',
    evidenceRef: 'evidence://security/1',
    command: 'npm run audit',
    exitCode: 0,
    evidenceDigest: validDigest,
    sourceIdentity: 'src-e2e-1',
  });

  // 7. Transition to CLOSE & assess completion
  await cp.closeRun('e2e-run-1');
  const comp = await cp.assessCompletion('e2e-run-1', { expectedSourceIdentity: 'src-e2e-1' });

  assert.equal(comp.decision, 'accepted');
  assert.equal(comp.run.status, 'completed');

  await cp.close();

  // 8. Uninstall Kernel & verify pristine cleanup
  const uninstallRes = await uninstallKernel({ targetRoot: tmpProject });
  assert.equal(uninstallRes.status, 'uninstalled');
});

test('Relay track project rejects Kernel-only explicit skill invocation with wrong_harness', async () => {
  const res = await resolveExplicitSkillInvocation('$moon-relay-kernel', { repoRoot: process.cwd(), track: 'relay' });
  assert.equal(res.status, 'fail');
  assert.equal(res.findings[0].code, 'wrong_harness');
});
