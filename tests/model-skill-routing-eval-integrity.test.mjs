import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { validateBoundEvalEvidence } from '../tools/evals/skill-lightweight-comparison.mjs';

const root = process.cwd();

test('model routing prompt blinds labels and emits a hash-bound private mapping', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'moonshot-model-routing-integrity-'));
  try {
    const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
    const result = spawnSync(process.execPath, ['tools/evals/model-skill-routing-eval.mjs', 'prepare', '--repo-root', root, '--variant', 'baseline', '--run', '1', '--baseline-ref', head, '--out-dir', temp], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const prompt = await readFile(path.join(temp, 'baseline-run-1.prompt.txt'), 'utf8');
    const binding = JSON.parse(await readFile(path.join(temp, 'baseline-run-1.binding.json'), 'utf8'));
    const schema = JSON.parse(await readFile(path.join(temp, 'output.schema.json'), 'utf8'));
    assert.doesNotMatch(prompt, /caseId": "[^\n]*(?:positive|negative)/);
    assert.match(prompt, /"caseId": "case-001"/);
    assert.equal(binding.cases.length, 120);
    assert.match(binding.cases[0].canonicalId, /:(?:positive|negative):/);
    assert.ok(binding.cases.every((item) => /^[a-f0-9]{64}$/.test(item.promptHash)));
    assert.ok(schema.required.includes('evaluationId'));
    assert.ok(schema.required.includes('caseOrderHash'));
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

async function createBoundLocalReviewEvidence(temp) {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
  for (const variant of ['baseline', 'candidate']) {
    for (let run = 1; run <= 3; run += 1) {
      const args = ['tools/evals/model-skill-routing-eval.mjs', 'prepare', '--repo-root', root, '--variant', variant, '--run', String(run), '--out-dir', temp];
      if (variant === 'baseline') args.push('--baseline-ref', head);
      const prepared = spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
      assert.equal(prepared.status, 0, prepared.stderr || prepared.stdout);
      const binding = JSON.parse(await readFile(path.join(temp, `${variant}-run-${run}.binding.json`), 'utf8'));
      const cases = binding.cases.map((item) => {
        const [skill, polarity] = item.canonicalId.split(':');
        return { caseId: item.caseId, selectedEntrypoint: polarity === 'positive' ? skill : 'none', prematureCompletion: false, hardGatesPreserved: true, completionOutcome: 'not_applicable', repeatedFailureClass: '' };
      });
      await writeFile(path.join(temp, `${variant}-run-${run}.json`), `${JSON.stringify({ schemaVersion: 'moonshot-model-skill-eval-run.v2', evaluationId: binding.evaluationId, caseOrderHash: binding.caseOrderHash, variant, run, cases }, null, 2)}\n`);
    }
  }
  const receipts = ['baseline', 'candidate'].flatMap((variant) => [1, 2, 3].map((run) => ({ variant, run, receiptId: `local-review-${variant}-${run}`, reviewerId: 'independent-reviewer-test', reviewMethod: 'blind_contract_classification' })));
  const provenancePath = path.join(temp, 'provenance.json');
  await writeFile(provenancePath, `${JSON.stringify({ schemaVersion: 'moonshot-model-skill-eval-provenance.v1', evaluationMode: 'local_independent_blind_review', reviewerId: 'independent-reviewer-test', independenceAttestation: 'Reviewer received opaque cases without expected labels.', receipts }, null, 2)}\n`);
  const aggregatePath = path.join(temp, 'aggregate.json');
  const scored = spawnSync(process.execPath, ['tools/evals/model-skill-routing-eval.mjs', 'score', '--repo-root', root, '--results-dir', temp, '--out', aggregatePath, '--provider', 'local-independent-review', '--model', 'blind-reviewer', '--provenance', provenancePath], { cwd: root, encoding: 'utf8' });
  assert.equal(scored.status, 0, scored.stderr || scored.stdout);
  return { aggregatePath, aggregate: JSON.parse(await readFile(aggregatePath, 'utf8')) };
}

test('scored local blind review binds six raw prompt, binding, result and reviewer receipts', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'moonshot-bound-local-review-'));
  try {
    const { aggregate } = await createBoundLocalReviewEvidence(temp);
    assert.equal(aggregate.scorerVersion, 'moonshot-model-skill-scorer.v3');
    assert.equal(aggregate.scoredInputManifest.entries.length, 6);
    assert.ok(aggregate.scoredInputManifest.entries.every((entry) => /^[a-f0-9]{64}$/.test(entry.promptSha256)
      && /^[a-f0-9]{64}$/.test(entry.bindingSha256) && /^[a-f0-9]{64}$/.test(entry.resultSha256) && entry.provenance.receiptId));
    await assert.rejects(() => validateBoundEvalEvidence(aggregate, ''), /raw results directory is required/);
    assert.equal(await validateBoundEvalEvidence(aggregate, temp), 'local_independent_blind_review');
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('bound evaluation rejects hand-edited aggregate and raw results', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'moonshot-bound-local-tamper-'));
  try {
    const { aggregate } = await createBoundLocalReviewEvidence(temp);
    const aggregateTamper = structuredClone(aggregate);
    aggregateTamper.variants.candidate.runs[0].selections[0].selectedEntrypoint = 'none';
    await assert.rejects(() => validateBoundEvalEvidence(aggregateTamper, temp), /aggregate scored values mismatch/);
    const rawPath = path.join(temp, 'candidate-run-1.json');
    const raw = JSON.parse(await readFile(rawPath, 'utf8')); raw.cases[0].selectedEntrypoint = 'none';
    await writeFile(rawPath, `${JSON.stringify(raw, null, 2)}\n`);
    await assert.rejects(() => validateBoundEvalEvidence(aggregate, temp), /raw scored input digest mismatch/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});
