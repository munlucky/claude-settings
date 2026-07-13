import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { evaluateSkillDeletionCandidates } from '../tools/evals/skill-deletion-eval.mjs';

test('production-backed deletion evaluation retains essential policy/process sentences without canonical edits', async () => {
  const root = process.cwd();
  const before = await readFile(path.join(root, 'skills/moonshot-phase-runner/SKILL.md'), 'utf8');
  const result = await evaluateSkillDeletionCandidates({ repoRoot: root });
  assert.ok(result.candidateCount > 0);
  const requiredProcedureClauses = [
    ['moonshot-phase-runner', 'cursor, execution root, run identity, and lease authority'],
    ['product-orchestrator', 'Draft `PRODUCT_INTENT.md`, `PRD.md`, `SOLUTION.md`, `SPEC.md`, and `PLAN.md` in order'],
    ['moonshot-architecture', 'Inspect project-local `knowledgeAnchors`'],
  ];
  for (const [skill, sentence] of requiredProcedureClauses) {
    const decision = result.decisions.find((item) => item.skill === skill && item.section === 'Procedure' && item.sentence.includes(sentence));
    assert.ok(decision, `${skill}: ${sentence}`);
    assert.equal(decision.decision, 'retain');
    assert.ok(decision.regressions.includes('process_clause_drift'));
    assert.notEqual(decision.baselineProcessContract.digest, decision.candidateProcessContract.digest);
  }
  assert.equal(result.decisions.filter((item) => item.section === 'Procedure').every((item) => item.decision === 'retain' && item.regressions.includes('process_clause_drift')), true);
  assert.equal(result.decisions.filter((item) => item.decision === 'eligible_not_applied').every((item) => Object.values(item.productionContracts).every(Boolean)), true);
  assert.equal(result.decisions.every((item) => item.canonicalMutation === false), true);
  assert.equal(await readFile(path.join(root, 'skills/moonshot-phase-runner/SKILL.md'), 'utf8'), before);
});
