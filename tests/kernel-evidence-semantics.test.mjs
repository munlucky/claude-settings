import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';
import { kernelDbPath } from '../scripts/kernel/state-store.mjs';
import { openSqliteDb } from '../scripts/kernel/sqlite-adapter.mjs';
import { normalizeTaskContract } from '../scripts/kernel/task/task-contract.mjs';

const setup = async () => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-evidence-semantics-home-'));
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-evidence-semantics-project-'));
  spawnSync('git', ['init'], { cwd: projectRoot, encoding: 'utf8' });
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({
    name: 'evidence-semantics-fixture',
    version: '0.0.1',
    scripts: {
      'test:ok': 'node -p 1',
      'test:other': 'node -p 1',
      lint: 'node -p 1',
    },
  }, null, 2));
  await writeFile(path.join(projectRoot, 'app.mjs'), 'export const value = 0;\n');
  return { runtimeHome, projectRoot };
};

const cleanup = async ({ runtimeHome, projectRoot }) => {
  await rm(runtimeHome, { recursive: true, force: true });
  await rm(projectRoot, { recursive: true, force: true });
};

const plannedContract = (statement = 'the mutation is correct') => ({
  acceptance: [{
    acceptance: statement,
    evidencePlan: { class: 'hard', method: 'unit-test', commandRefs: ['test:ok'] },
  }],
});

test('planless proof is rejected before any command executes', async () => {
  const fixture = await setup();
  const cp = await createKernelControlPlane(fixture);
  try {
    await cp.startRun({ runId: 'r-planless-proof', objective: 'x', taskContract: { acceptance: ['works'] } });
    const rejected = await cp.report('r-planless-proof', {
      summary: 'proof without an evidence plan',
      verifications: [{ obligationId: 'default', commandRef: 'test:ok', acceptanceCoverage: ['AC-1'] }],
    });
    assert.equal(rejected.status, 'evidence-rejected');
    assert.equal(rejected.executed.length, 0);
    assert.equal(rejected.failures[0].errorCode, 'MISSING_EVIDENCE_PLAN');
    assert.equal(cp.stateStore.getVerifications('r-planless-proof').length, 0);
  } finally {
    await cp.close();
    await cleanup(fixture);
  }
});

test('the first proof report must persist all structured plans before executing commands', async () => {
  const fixture = await setup();
  const cp = await createKernelControlPlane(fixture);
  try {
    await cp.startRun({ runId: 'r-first-report-plan', objective: 'x', taskContract: { acceptance: ['works'] } });
    await writeFile(path.join(fixture.projectRoot, 'app.mjs'), 'export const value = 3;\n');
    const completed = await cp.report('r-first-report-plan', {
      summary: 'first report binds the plan and proves it',
      changedPaths: ['app.mjs'],
      evidencePlans: [{
        acceptanceId: 'AC-1',
        evidencePlan: { class: 'hard', method: 'unit-test', commandRefs: ['test:ok'] },
      }],
      verifications: [
        { obligationId: 'default', commandRef: 'test:ok', acceptanceCoverage: [] },
        { obligationId: 'acceptance-ac-1', commandRef: 'test:ok', acceptanceCoverage: ['AC-1'] },
      ],
    });
    assert.equal(completed.status, 'completed');
    assert.equal(cp.stateStore.getRun('r-first-report-plan').taskContract.acceptance[0].evidencePlan.class, 'hard');
  } finally {
    await cp.close();
    await cleanup(fixture);
  }
});

test('legacy proof cannot complete through a final report with verifications omitted', async () => {
  const fixture = await setup();
  const cp = await createKernelControlPlane(fixture);
  try {
    const statement = 'legacy acceptance remains covered';
    await cp.startRun({ runId: 'r-legacy-final', objective: 'x', taskContract: { acceptance: [statement] } });
    await cp.transition('r-legacy-final', 'EXECUTE');
    await cp.transition('r-legacy-final', 'PROVE');
    await cp.recordProof('r-legacy-final', {
      obligationId: 'default',
      status: 'passed',
      evidenceRef: 'legacy://verification/1',
      command: 'npm test',
      evidenceDigest: `sha256:${'b'.repeat(64)}`,
      acceptanceCoverage: [statement],
    });

    const stored = cp.stateStore.getVerifications('r-legacy-final');
    assert.deepEqual(stored[0].acceptanceCoverage, ['AC-1'], 'legacy statement coverage is canonicalized at persistence');

    const finalReport = await cp.report('r-legacy-final', {
      summary: 'legacy final report with no new verification payload',
      verifications: [],
    });
    assert.notEqual(finalReport.status, 'completed');
    assert.equal(finalReport.finalization.finalizationStatus, 'incomplete_gates');
    assert.equal(finalReport.finalization.completionResult.gates.evidencePlansComplete, false);
    assert.ok(finalReport.finalization.unmetGates.includes('evidencePlansComplete'));
  } finally {
    await cp.close();
    await cleanup(fixture);
  }
});

test('a legacy run with persisted proof but no task contract cannot complete', async () => {
  const fixture = await setup();
  const cp = await createKernelControlPlane(fixture);
  try {
    const statement = 'legacy acceptance has no structured plan';
    await cp.startRun({ runId: 'r-legacy-no-contract', objective: 'x', taskContract: plannedContract(statement) });
    await cp.transition('r-legacy-no-contract', 'EXECUTE');
    await cp.transition('r-legacy-no-contract', 'PROVE');

    // Reproduce a pre-contract persisted run: acceptance_criteria survives,
    // while the newer task_contract_json column is absent.
    const db = await openSqliteDb(kernelDbPath(fixture.runtimeHome));
    try {
      db.prepare('UPDATE runs SET task_contract_json=NULL WHERE run_id=?').run('r-legacy-no-contract');
    } finally {
      db.close?.();
    }

    await cp.recordProof('r-legacy-no-contract', {
      obligationId: 'default',
      status: 'passed',
      evidenceRef: 'legacy://verification/default-no-contract',
      command: 'npm test',
      evidenceDigest: `sha256:${'e'.repeat(64)}`,
      acceptanceCoverage: [],
    });
    await cp.recordProof('r-legacy-no-contract', {
      obligationId: 'acceptance-ac-1',
      status: 'passed',
      evidenceRef: 'legacy://verification/no-contract',
      command: 'npm test',
      evidenceDigest: `sha256:${'d'.repeat(64)}`,
      acceptanceCoverage: [statement],
    });

    const finalReport = await cp.report('r-legacy-no-contract', {
      summary: 'legacy proof must not bypass the structured contract gate',
      verifications: [],
    });
    assert.notEqual(finalReport.status, 'completed');
    assert.equal((await cp.assessCompletion('r-legacy-no-contract')).gates.evidencePlansComplete, false);
  } finally {
    await cp.close();
    await cleanup(fixture);
  }
});

test('a persisted proof from an earlier evidence-plan revision cannot satisfy the revised plan', async () => {
  const fixture = await setup();
  const cp = await createKernelControlPlane(fixture);
  try {
    const runId = 'r-plan-revision-proof';
    await cp.startRun({ runId, objective: 'x', taskContract: plannedContract() });
    await cp.transition(runId, 'EXECUTE');
    await cp.transition(runId, 'PROVE');
    await cp.executeProof(runId, {
      obligationId: 'acceptance-ac-1',
      commandRef: 'test:ok',
      acceptanceCoverage: ['AC-1'],
    });
    assert.equal(cp.stateStore.getVerifications(runId)[0].commandRef, 'test:ok');

    await cp.reviseContract(runId, normalizeTaskContract({
      acceptance: [{
        acceptance: 'the mutation is correct',
        evidencePlan: { class: 'hard', method: 'unit-test', commandRefs: ['test:other'] },
      }],
    }, { objective: 'x' }));

    const finalReport = await cp.report(runId, {
      summary: 'the old command must not satisfy the new plan',
      verifications: [],
    });
    assert.notEqual(finalReport.status, 'completed');
    const completion = await cp.assessCompletion(runId);
    assert.equal(completion.gates.acceptanceCovered, false);
    assert.ok(completion.unsatisfiedObligations.some((entry) => entry.obligationId === 'acceptance-ac-1'));
  } finally {
    await cp.close();
    await cleanup(fixture);
  }
});

test('statement coverage is stored as the canonical AC id for a planned obligation', async () => {
  const fixture = await setup();
  const cp = await createKernelControlPlane(fixture);
  try {
    const statement = 'the planned statement holds';
    await cp.startRun({ runId: 'r-canonical-statement', objective: 'x', taskContract: plannedContract(statement) });
    await cp.transition('r-canonical-statement', 'EXECUTE');
    await cp.transition('r-canonical-statement', 'PROVE');
    await cp.recordProof('r-canonical-statement', {
      obligationId: 'acceptance-ac-1',
      status: 'passed',
      evidenceRef: 'proof://statement/1',
      command: 'npm test',
      evidenceDigest: `sha256:${'c'.repeat(64)}`,
      acceptanceCoverage: [statement],
    });
    assert.deepEqual(cp.stateStore.getVerifications('r-canonical-statement')[0].acceptanceCoverage, ['AC-1']);
  } finally {
    await cp.close();
    await cleanup(fixture);
  }
});

test('mutation explicit knowledge observation is reviewed and committed at a higher revision', async () => {
  const fixture = await setup();
  const cp = await createKernelControlPlane(fixture);
  try {
    const run = await cp.startRun({ runId: 'r-explicit-knowledge', objective: 'x', taskContract: plannedContract() });
    await writeFile(path.join(fixture.projectRoot, 'app.mjs'), 'export const value = 1;\n');
    const report = await cp.report('r-explicit-knowledge', {
      summary: 'mutation with explicit reusable knowledge',
      changedPaths: ['app.mjs'],
      verifications: [
        { obligationId: 'default', commandRef: 'test:ok', acceptanceCoverage: [] },
        { obligationId: 'acceptance-ac-1', commandRef: 'test:ok', acceptanceCoverage: ['AC-1'] },
      ],
      knowledgeObservations: [{
        candidateId: 'candidate-explicit-1',
        proposedType: 'semantic_fact',
        statement: 'The evidence semantics fixture keeps acceptance coverage bound to its planned obligation.',
        scope: ['app.mjs'],
        acceptanceIds: ['AC-1'],
        obligationIds: ['acceptance-ac-1'],
      }],
    });

    assert.equal(report.status, 'completed');
    assert.equal(report.finalization.knowledgeStatus, 'committed');
    assert.equal(report.finalization.knowledgeCommitReceipt.status, 'committed');
    assert.equal(report.finalization.knowledgeCommitReceipt.revisionBefore, String(run.knowledgeRevisionStart));
    assert.equal(Number(report.finalization.knowledgeCommitReceipt.revisionAfter), Number(run.knowledgeRevisionStart) + 1);
    assert.equal(report.finalization.reviewResult.verifiedCandidates.length, 1);
    const records = cp.stateStore.listKnowledgeRecords({ projectId: run.projectId, statuses: ['committed'] });
    assert.ok(records.some((record) => record.statement.includes('acceptance coverage bound') && record.status === 'committed'));
  } finally {
    await cp.close();
    await cleanup(fixture);
  }
});

test('mutation with zero knowledge candidates leaves a structured warning in the final receipt', async () => {
  const fixture = await setup();
  const cp = await createKernelControlPlane(fixture);
  try {
    await cp.startRun({ runId: 'r-no-knowledge', objective: 'x', taskContract: plannedContract() });
    await writeFile(path.join(fixture.projectRoot, 'app.mjs'), 'export const value = 2;\n');
    const report = await cp.report('r-no-knowledge', {
      summary: 'mutation without a reusable observation',
      changedPaths: ['app.mjs'],
      verifications: [
        { obligationId: 'default', commandRef: 'test:ok', acceptanceCoverage: [] },
        { obligationId: 'acceptance-ac-1', commandRef: 'test:ok', acceptanceCoverage: ['AC-1'] },
      ],
    });

    assert.equal(report.status, 'completed');
    assert.equal(report.finalization.knowledgeStatus, 'no_change');
    assert.equal(report.finalization.knowledgeWarning, true);
    assert.equal(report.finalization.knowledgeWarningReason, 'mutation_completed_without_explicit_or_structured_knowledge_candidate');
    assert.deepEqual(report.finalization.knowledgeWarningDetail, {
      code: 'MUTATION_WITHOUT_KNOWLEDGE_CANDIDATE',
      reason: 'mutation_completed_without_explicit_or_structured_knowledge_candidate',
      mutationRevision: 1,
      candidateCount: 0,
    });
  } finally {
    await cp.close();
    await cleanup(fixture);
  }
});
