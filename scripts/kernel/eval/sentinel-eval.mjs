import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { createKernelControlPlane } from '../control-plane.mjs';

const validDigest = `sha256:${'a'.repeat(64)}`;

const makeProject = async (scripts = {}) => {
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-sentinel-proj-'));
  spawnSync('git', ['init'], { cwd: projectRoot, encoding: 'utf8' });
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({ name: 'sentinel-fixture', version: '0.0.1', scripts }, null, 2));
  await writeFile(path.join(projectRoot, 'app.mjs'), 'export const v = 0;\n');
  return projectRoot;
};

const mutate = async (projectRoot, value) => {
  await writeFile(path.join(projectRoot, 'app.mjs'), `export const v = ${value};\n`);
};

// Each trap drives a real control-plane run and returns the completion
// decision so the harness can check the Kernel refused to falsely accept.
const TRAPS = {
  async caller_attested_only_mutating(cp, projectRoot) {
    await cp.startRun({ runId: 'sen', objective: 'x' });
    await mutate(projectRoot, 1);
    await cp.report('sen', { summary: 'observe' });
    await cp.transition('sen', 'EXECUTE');
    await cp.transition('sen', 'PROVE');
    await cp.recordProof('sen', { obligationId: 'default', status: 'passed', evidenceRef: 'e://1', command: 'npm test', exitCode: 0, evidenceDigest: validDigest });
    return cp.finalizeRun('sen');
  },
  async stale_identity(cp, projectRoot) {
    await cp.startRun({ runId: 'sen', objective: 'x' });
    await mutate(projectRoot, 1);
    await cp.transition('sen', 'EXECUTE');
    await cp.transition('sen', 'PROVE');
    await cp.executeProof('sen', { obligationId: 'default', commandRef: 'test:ok' });
    // Mutate again after the passing evidence: the recorded evidence is stale
    // against the newly observed workspace state.
    await mutate(projectRoot, 2);
    await cp.report('sen', { summary: 'drift' });
    return cp.finalizeRun('sen');
  },
  async missing_obligation(cp) {
    await cp.startRun({ runId: 'sen', objective: 'x', taskContract: { riskTier: 'T2' } });
    await cp.transition('sen', 'EXECUTE');
    await cp.transition('sen', 'PROVE');
    await cp.recordProof('sen', { obligationId: 'static-analysis', status: 'passed', evidenceRef: 'e://1', command: 'npm run lint', exitCode: 0, evidenceDigest: validDigest });
    await cp.transition('sen', 'CLOSE');
    return cp.finalizeRun('sen');
  },
  async uncovered_acceptance(cp) {
    await cp.startRun({ runId: 'sen', objective: 'x', taskContract: { acceptance: ['must-do-thing'] } });
    await cp.transition('sen', 'EXECUTE');
    await cp.transition('sen', 'PROVE');
    await cp.recordProof('sen', { obligationId: 'default', status: 'passed', evidenceRef: 'e://1', command: 'npm test', exitCode: 0, evidenceDigest: validDigest, acceptanceCoverage: [] });
    await cp.transition('sen', 'CLOSE');
    return cp.finalizeRun('sen');
  },
  async no_verification_mutating(cp, projectRoot) {
    await cp.startRun({ runId: 'sen', objective: 'x' });
    await mutate(projectRoot, 1);
    await cp.report('sen', { summary: 'observe' });
    await cp.transition('sen', 'EXECUTE');
    await cp.transition('sen', 'PROVE');
    await cp.transition('sen', 'CLOSE');
    return cp.finalizeRun('sen');
  },
  async protected_waiver(cp) {
    await cp.startRun({ runId: 'sen', objective: 'x', taskContract: { requiredObligations: ['auth-regression'] } });
    await cp.transition('sen', 'EXECUTE');
    await cp.transition('sen', 'PROVE');
    let waiverRejected = false;
    try {
      await cp.addWaiver('sen', { obligationId: 'auth-regression', approvedBy: 'x', reason: 'skip', approvalReceipt: 'r://1' });
    } catch {
      waiverRejected = true;
    }
    await cp.transition('sen', 'CLOSE');
    const result = await cp.finalizeRun('sen');
    return { ...result, waiverRejected };
  },
  async failing_evidence(cp, projectRoot) {
    await cp.startRun({ runId: 'sen', objective: 'x' });
    await mutate(projectRoot, 1);
    await cp.report('sen', { summary: 'try', verifications: [{ obligationId: 'default', commandRef: 'test:fail' }] });
    return cp.finalizeRun('sen');
  },
  async clean_hard_evidence(cp, projectRoot) {
    await cp.startRun({ runId: 'sen', objective: 'x', taskContract: { acceptance: ['works'] } });
    await mutate(projectRoot, 1);
    return cp.report('sen', { summary: 'fix', verifications: [{ obligationId: 'default', commandRef: 'test:ok', acceptanceCoverage: ['works'] }] });
  },
};

const isAccepted = (result) => {
  if (!result) return false;
  if (result.completionStatus) return result.completionStatus === 'accepted';
  if (result.finalization) return result.finalization.completionStatus === 'accepted';
  if (result.status) return result.status === 'completed';
  return false;
};

export const runSentinelEvaluation = async ({ corpus, seed = 0 } = {}) => {
  const results = [];
  let falseCompletions = 0;

  for (const testCase of corpus.cases) {
    const trap = TRAPS[testCase.trap];
    if (!trap) throw new Error(`Unknown sentinel trap: ${testCase.trap}`);
    const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-sentinel-home-'));
    const projectRoot = await makeProject({ 'test:ok': 'node -e "process.exit(0)"', 'test:fail': 'node -e "process.exit(1)"' });
    const cp = await createKernelControlPlane({ runtimeHome, projectRoot });
    try {
      const outcome = await trap(cp, projectRoot);
      const accepted = isAccepted(outcome);
      const falseCompletion = testCase.expect === 'reject' && accepted;
      const missedAccept = testCase.expect === 'accept' && !accepted;
      if (falseCompletion) falseCompletions += 1;
      results.push({ id: testCase.id, trap: testCase.trap, expect: testCase.expect, accepted, falseCompletion, missedAccept });
    } finally {
      await cp.close();
      await rm(runtimeHome, { recursive: true, force: true });
      await rm(projectRoot, { recursive: true, force: true });
    }
  }

  return {
    taskSetRevision: corpus.taskSetRevision,
    kernelRevision: 'kernel-e2e-workflow-2026-07-24',
    seed,
    caseCount: corpus.cases.length,
    falseCompletions,
    missedAccepts: results.filter((r) => r.missedAccept).length,
    results,
  };
};
