import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { assertEvidencePlans, normalizeAcceptance, acceptanceStatements, MissingEvidencePlanError } from '../scripts/kernel/task/evidence-plan.mjs';
import { applyEvidencePlans, normalizeTaskContract } from '../scripts/kernel/task/task-contract.mjs';
import { createKernelControlPlane } from '../scripts/kernel/control-plane.mjs';

test('resubmitting an identical evidence plan does not create a contract revision', () => {
  const contract = normalizeTaskContract({ acceptance: ['works'] }, { objective: 'x' });
  const first = applyEvidencePlans(contract, [{
    acceptanceId: 'AC-1',
    evidencePlan: { class: 'hard', method: 'unit-test', commandRefs: ['test:ok'], obligationId: 'unit-test' },
  }]);
  assert.ok(first);
  assert.equal(applyEvidencePlans(first, [{
    acceptanceId: 'AC-1',
    evidencePlan: { class: 'hard', method: 'unit-test', commandRefs: ['test:ok'], obligationId: 'unit-test' },
  }]), null);
  assert.ok(applyEvidencePlans(first, [{
    acceptanceId: 'AC-1',
    evidencePlan: { class: 'hard', method: 'unit-test', commandRefs: ['test:other'], obligationId: 'unit-test' },
  }]));
});

test('plain-string acceptance is allowed and normalized to statements', () => {
  const items = normalizeAcceptance(['returns 401', 'keeps 423']);
  assert.equal(items.every((i) => i.structured === false), true);
  assert.deepEqual(acceptanceStatements(['returns 401', 'keeps 423']), ['returns 401', 'keeps 423']);
  assert.doesNotThrow(() => assertEvidencePlans(['returns 401']));
});

test('structured acceptance requires a valid evidence plan', () => {
  assert.throws(
    () => assertEvidencePlans([{ acceptance: 'be readable' }]),
    MissingEvidencePlanError,
  );
  assert.throws(
    () => assertEvidencePlans([{ acceptance: 'x', evidencePlan: { class: 'bogus' } }]),
    /MISSING_EVIDENCE_PLAN|evidence plan/,
  );
  assert.doesNotThrow(
    () => assertEvidencePlans([{ acceptance: 'locked -> 423', evidencePlan: { class: 'hard', method: 'integration-test', commandRef: 'test:auth' } }]),
  );
});

test('startRun blocks a structured acceptance that omits its evidence plan', async () => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-ep-home-'));
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-ep-proj-'));
  spawnSync('git', ['init'], { cwd: projectRoot, encoding: 'utf8' });
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({ name: 'x', scripts: {} }));
  const cp = await createKernelControlPlane({ runtimeHome, projectRoot });
  try {
    await assert.rejects(
      cp.startRun({ runId: 'r-ep', objective: 'x', taskContract: { acceptance: [{ acceptance: 'improve readability' }] } }),
      /MISSING_EVIDENCE_PLAN|evidence plan/,
    );
    // Structured acceptance with a plan is accepted and coverage uses the statement.
    const run = await cp.startRun({ runId: 'r-ep-ok', objective: 'x', taskContract: { acceptance: [{ acceptance: 'invalid password returns 401', evidencePlan: { class: 'hard', commandRef: 'test:auth' } }] } });
    assert.deepEqual(run.acceptanceCriteria, ['invalid password returns 401']);
  } finally {
    await cp.close();
    await rm(runtimeHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});

test('next explicitly asks for AC-scoped plans before proof of plain acceptance', async () => {
  const runtimeHome = await mkdtemp(path.join(os.tmpdir(), 'krn-ep-next-home-'));
  const projectRoot = await mkdtemp(path.join(os.tmpdir(), 'krn-ep-next-proj-'));
  spawnSync('git', ['init'], { cwd: projectRoot, encoding: 'utf8' });
  await writeFile(path.join(projectRoot, 'package.json'), JSON.stringify({ name: 'x', scripts: { 'test:ok': 'node -e "process.exit(0)"' } }));
  const cp = await createKernelControlPlane({ runtimeHome, projectRoot });
  try {
    await cp.startRun({ runId: 'r-ep-next', objective: 'x', taskContract: { acceptance: ['works'] } });
    const next = await cp.next('r-ep-next');
    assert.deepEqual(next.action.evidencePlansRequired, ['AC-1']);
    assert.match(next.action.guidance, /AC-1/);
    assert.equal(next.acceptancePlans[0].id, 'AC-1');
  } finally {
    await cp.close();
    await rm(runtimeHome, { recursive: true, force: true });
    await rm(projectRoot, { recursive: true, force: true });
  }
});
