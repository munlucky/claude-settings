#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const PUBLIC = ['product-orchestrator', 'moonshot-architecture', 'moonshot-orchestrator', 'moonshot-phase-runner', 'moonshot-plan-writer', 'commit-moonshot', 'session-logger'];
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const option = (args, name, fallback = '') => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const sourceAt = async (root, ref, relative) => ref
  ? execFileSync('git', ['show', `${ref}:${relative}`], { cwd: root, encoding: 'utf8' })
  : readFile(path.join(root, relative), 'utf8');
const canonicalCases = (fixture) => fixture.skills.flatMap((skill) => [
  ...skill.positive.map((prompt, index) => ({ canonicalId: `${skill.name}:positive:${index + 1}`, skill: skill.name, polarity: 'positive', prompt })),
  ...skill.negative.map((prompt, index) => ({ canonicalId: `${skill.name}:negative:${index + 1}`, skill: skill.name, polarity: 'negative', prompt })),
]);

const schema = {
  type: 'object', additionalProperties: false, required: ['schemaVersion', 'evaluationId', 'caseOrderHash', 'variant', 'run', 'cases'],
  properties: {
    schemaVersion: { type: 'string', const: 'moonshot-model-skill-eval-run.v2' },
    evaluationId: { type: 'string' },
    caseOrderHash: { type: 'string' },
    variant: { type: 'string', enum: ['baseline', 'candidate'] },
    run: { type: 'integer', minimum: 1, maximum: 3 },
    cases: {
      type: 'array', minItems: 105, maxItems: 105,
      items: {
        type: 'object', additionalProperties: false,
        required: ['caseId', 'selectedEntrypoint', 'prematureCompletion', 'hardGatesPreserved', 'completionOutcome', 'repeatedFailureClass'],
        properties: {
          caseId: { type: 'string' },
          selectedEntrypoint: { type: 'string', enum: [...PUBLIC, 'none'] },
          prematureCompletion: { type: 'boolean' },
          hardGatesPreserved: { type: 'boolean' },
          completionOutcome: { type: 'string', enum: ['accepted', 'rejected', 'not_applicable'] },
          repeatedFailureClass: { type: 'string' },
        },
      },
    },
  },
};

async function prepare(args) {
  const root = path.resolve(option(args, '--repo-root', process.cwd()));
  const variant = option(args, '--variant');
  const run = Number(option(args, '--run'));
  const ref = variant === 'baseline' ? option(args, '--baseline-ref') : '';
  const outDir = path.resolve(option(args, '--out-dir'));
  if (!['baseline', 'candidate'].includes(variant) || ![1, 2, 3].includes(run) || (variant === 'baseline' && !ref)) throw new Error('invalid prepare arguments');
  const fixture = JSON.parse(await readFile(path.join(root, 'tests/fixtures/skill-routing/public-entrypoint-cases.json'), 'utf8'));
  const canonical = canonicalCases(fixture);
  const cases = canonical.map((item, index) => ({ caseId: `case-${String(index + 1).padStart(3, '0')}`, prompt: item.prompt }));
  const caseOrderHash = sha256(JSON.stringify(cases.map((item) => item.caseId)));
  const evaluationId = sha256(JSON.stringify({ variant, run, caseOrderHash, prompts: cases.map((item) => sha256(item.prompt)) }));
  const bodies = [];
  for (const name of PUBLIC) bodies.push(`\n===== ${name} =====\n${await sourceAt(root, ref, `skills/${name}/SKILL.md`)}`);
  const prompt = `You are a deterministic evaluator of a seven-entrypoint agent harness.\n\nSelect exactly one public entrypoint or none for each user prompt using ONLY the supplied skill contracts. Explicit $name invocation must select that exact public entrypoint and cannot reroute. commit-moonshot and session-logger are explicit/user-preferred utilities: select them for clear commit/session-log intent even without a dollar prefix.\n\nFor each case also assess the selected contract conservatively: prematureCompletion is true only if following the contract would claim completion before its hard gates; hardGatesPreserved is true when the contract keeps its stated approval/evidence/completion boundaries; completionOutcome is not_applicable for routing-only or negative cases, accepted only when the prompt itself asks for an operation the contract can validly complete, otherwise rejected. repeatedFailureClass is empty unless the contract would repeat the same failed approach.\n\nReturn all 105 cases exactly once, in the same order and with the exact opaque caseId. Echo evaluationId and caseOrderHash exactly. Expected entrypoints and positive/negative labels are deliberately withheld.\n\nEVALUATION_ID=${evaluationId}\nCASE_ORDER_HASH=${caseOrderHash}\nVARIANT=${variant}\nRUN=${run}\nPUBLIC=${PUBLIC.join(', ')}\n\nSKILL CONTRACTS\n${bodies.join('\n')}\n\nCASES\n${JSON.stringify(cases, null, 2)}`;
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, `${variant}-run-${run}.prompt.txt`), prompt);
  await writeFile(path.join(outDir, `${variant}-run-${run}.binding.json`), `${JSON.stringify({ schemaVersion: 'moonshot-model-skill-eval-binding.v1', variant, run, evaluationId, caseOrderHash, promptHash: sha256(prompt), cases: cases.map((item, index) => ({ caseId: item.caseId, canonicalId: canonical[index].canonicalId, promptHash: sha256(item.prompt) })) }, null, 2)}\n`);
  await writeFile(path.join(outDir, 'output.schema.json'), `${JSON.stringify(schema, null, 2)}\n`);
  return { variant, run, caseCount: cases.length, evaluationId, caseOrderHash, promptHash: sha256(prompt), promptPath: path.join(outDir, `${variant}-run-${run}.prompt.txt`) };
}

async function score(args) {
  const root = path.resolve(option(args, '--repo-root', process.cwd()));
  const resultsDir = path.resolve(option(args, '--results-dir'));
  const out = path.resolve(option(args, '--out'));
  const provider = option(args, '--provider', 'openai-chatgpt-auth');
  const model = option(args, '--model', 'gpt-5.6-sol');
  const provenancePath = option(args, '--provenance');
  if (!provenancePath) throw new Error('--provenance is required for bound scoring');
  const resolvedProvenancePath = path.resolve(provenancePath);
  if (resolvedProvenancePath !== path.join(resultsDir, 'provenance.json')) throw new Error('--provenance must be <results-dir>/provenance.json');
  const provenanceText = await readFile(resolvedProvenancePath, 'utf8');
  const provenance = JSON.parse(provenanceText);
  if (provenance?.schemaVersion !== 'moonshot-model-skill-eval-provenance.v1'
    || !['external_model_blind', 'local_independent_blind_review'].includes(provenance.evaluationMode)
    || typeof provenance.reviewerId !== 'string' || !provenance.reviewerId.trim()
    || typeof provenance.independenceAttestation !== 'string' || !provenance.independenceAttestation.trim()
    || !Array.isArray(provenance.receipts) || provenance.receipts.length !== 6) throw new Error('invalid explicit evaluation provenance');
  const receiptByRun = new Map(provenance.receipts.map((receipt) => [`${receipt.variant}:${receipt.run}`, receipt]));
  if (receiptByRun.size !== 6 || provenance.receipts.some((receipt) => !['baseline', 'candidate'].includes(receipt.variant)
    || ![1, 2, 3].includes(receipt.run) || typeof receipt.receiptId !== 'string' || !receipt.receiptId.trim()
    || typeof receipt.reviewerId !== 'string' || receipt.reviewerId !== provenance.reviewerId
    || typeof receipt.reviewMethod !== 'string' || !receipt.reviewMethod.trim())) throw new Error('invalid independent reviewer receipts');
  const fixture = JSON.parse(await readFile(path.join(root, 'tests/fixtures/skill-routing/public-entrypoint-cases.json'), 'utf8'));
  const expected = new Map(canonicalCases(fixture).map((item) => [item.canonicalId, item]));
  const variants = {};
  const scoredInputs = [];
  for (const variant of ['baseline', 'candidate']) {
    const runs = [];
    for (let run = 1; run <= 3; run += 1) {
      const resultText = await readFile(path.join(resultsDir, `${variant}-run-${run}.json`), 'utf8');
      const bindingText = await readFile(path.join(resultsDir, `${variant}-run-${run}.binding.json`), 'utf8');
      const value = JSON.parse(resultText);
      const binding = JSON.parse(bindingText);
      const promptText = await readFile(path.join(resultsDir, `${variant}-run-${run}.prompt.txt`), 'utf8');
      if (sha256(promptText) !== binding.promptHash || value.schemaVersion !== 'moonshot-model-skill-eval-run.v2' || value.variant !== variant || value.run !== run || value.evaluationId !== binding.evaluationId || value.caseOrderHash !== binding.caseOrderHash || value.cases.length !== binding.cases.length) throw new Error(`invalid or unbound ${variant} run ${run}`);
      if (value.cases.some((item, index) => item.caseId !== binding.cases[index].caseId)) throw new Error(`case order mismatch in ${variant} run ${run}`);
      const receipt = receiptByRun.get(`${variant}:${run}`);
      if (!receipt) throw new Error(`missing reviewer receipt for ${variant} run ${run}`);
      scoredInputs.push({
        variant, run, evaluationId: value.evaluationId, caseOrderHash: value.caseOrderHash,
        promptSha256: sha256(promptText), bindingSha256: sha256(bindingText), resultSha256: sha256(resultText),
        provenance: { evaluationMode: provenance.evaluationMode, reviewerId: provenance.reviewerId, receiptId: receipt.receiptId, reviewMethod: receipt.reviewMethod },
      });
      runs.push({ value, binding });
    }
    const perRun = runs.map(({ value, binding }) => {
      let tp = 0; let fn = 0; let tn = 0; let fp = 0; let premature = 0; let hardGateFailures = 0;
      const selections = [];
      for (let index = 0; index < value.cases.length; index += 1) {
        const item = value.cases[index]; const bound = binding.cases[index];
        const target = expected.get(bound.canonicalId); if (!target || bound.promptHash !== sha256(target.prompt)) throw new Error(`invalid binding ${bound.canonicalId}`);
        const selectedTarget = item.selectedEntrypoint === target.skill;
        if (target.polarity === 'positive') selectedTarget ? tp += 1 : fn += 1;
        else selectedTarget ? fp += 1 : tn += 1;
        if (item.prematureCompletion) premature += 1;
        if (!item.hardGatesPreserved) hardGateFailures += 1;
        selections.push({ canonicalId: bound.canonicalId, promptHash: bound.promptHash, selectedEntrypoint: item.selectedEntrypoint });
      }
      return { precision: tp + fp ? tp / (tp + fp) : 0, recall: tp / (tp + fn), tp, fn, tn, fp, prematureCompletionCount: premature, hardGateFailureCount: hardGateFailures, selections };
    });
    variants[variant] = {
      runs: perRun,
      medianPrecision: median(perRun.map((item) => item.precision)),
      worstPrecision: Math.min(...perRun.map((item) => item.precision)),
      medianRecall: median(perRun.map((item) => item.recall)),
      worstRecall: Math.min(...perRun.map((item) => item.recall)),
      worstPrematureCompletionCount: Math.max(...perRun.map((item) => item.prematureCompletionCount)),
      worstHardGateFailureCount: Math.max(...perRun.map((item) => item.hardGateFailureCount)),
    };
  }
  const candidate = variants.candidate; const baseline = variants.baseline;
  const gates = {
    precisionAtLeast095: candidate.medianPrecision >= 0.95,
    recallAtLeast095: candidate.medianRecall >= 0.95,
    precisionNotBelowBaseline: candidate.medianPrecision >= baseline.medianPrecision,
    recallNotBelowBaseline: candidate.medianRecall >= baseline.medianRecall,
    noPrematureCompletion: candidate.worstPrematureCompletionCount === 0,
    noHardGateFailure: candidate.worstHardGateFailureCount === 0,
  };
  const scoredInputManifest = { schemaVersion: 'moonshot-model-skill-scored-input-manifest.v1', provenanceFile: 'provenance.json', provenanceSha256: sha256(provenanceText), entries: scoredInputs };
  const result = {
    schemaVersion: 'moonshot-model-skill-eval.v2', status: Object.values(gates).every(Boolean) ? 'passed' : 'failed', provider, model,
    evidenceProvenance: { evaluationMode: provenance.evaluationMode, reviewerId: provenance.reviewerId, independenceAttestation: provenance.independenceAttestation },
    requiredRunsPerCase: 3, callsUsed: 6, caseCountPerVariant: 105, scorerVersion: 'moonshot-model-skill-scorer.v3',
    scoredInputManifest, scoredInputManifestHash: sha256(JSON.stringify(scoredInputManifest)), variants, gates,
  };
  await mkdir(path.dirname(out), { recursive: true }); await writeFile(out, `${JSON.stringify(result, null, 2)}\n`); return result;
}

const [command, ...args] = process.argv.slice(2);
try {
  const result = command === 'prepare' ? await prepare(args) : command === 'score' ? await score(args) : (() => { throw new Error('Usage: model-skill-routing-eval.mjs prepare|score ...'); })();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (command === 'score' && result.status !== 'passed') process.exitCode = 2;
} catch (error) { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; }
