#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { generateSkillCompatibilityManifest } from './skill-compatibility-manifest.mjs';
import { resolveEntrypointConditionalSkills } from '../../scripts/lib/workflow-bundle-resolver.mjs';
import { resolveExplicitSkillInvocation, routeSkill } from '../../scripts/skill-router.mjs';

const hash = (text) => createHash('sha256').update(text).digest('hex');
const estimatedTokens = (text) => Math.ceil(Buffer.byteLength(text, 'utf8') / 4);
const median = (values) => { const sorted = [...values].sort((a, b) => a - b); return sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2; };
const option = (args, name, fallback = '') => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
const gitText = (root, ref, relative) => execFileSync('git', ['show', `${ref}:${relative}`], { cwd: root, encoding: 'utf8' });
const frontmatterList = (text, key) => { const raw = text.slice(4, text.indexOf('\n---', 4)); const match = raw.match(new RegExp(`^${key}:\\s*\\n((?:\\s+-\\s+.*\\n?)*)`, 'm')); return match ? [...match[1].matchAll(/^\s+-\s+(.+)$/gm)].map((entry) => entry[1].trim()) : []; };
const conditionSignals = {
  architectureRequired: /architecture required|아키텍처 필요/i, planningRequired: /planning required|계획 필요/i, brownfieldRecovery: /brownfield|구조 복구/i,
  optionReview: /대안|trade.?off/i, gateReview: /architecture handoff|architecture gate/i, behaviorChange: /behavior change|행동 변경/i,
  reviewRequired: /review required|리뷰 필요/i, completionCheck: /completion check|완료 확인/i,
  // Selecting the phase-runner is not itself a phase attempt. The executor is
  // loaded only after the runner emits an explicit attempt-mode handoff.
  phaseAttempt: /phaseAttempt(?:Mode)?\s*(?:=|:)\s*true|phase attempt(?: mode)?|단계 시도/i,
  planReview: /plan review|계획 리뷰/i, memoryRefresh: /memory|메모리/i, knowledgeRefresh: /knowledge refresh|지식 갱신/i,
};
const referenceSignal = (reference, prompt) => {
  if (/compatibility-contract/.test(reference)) return false;
  const terms = path.basename(reference, path.extname(reference)).split(/[-_]/).filter((term) => term.length > 3 && !['reference', 'contract'].includes(term));
  return terms.some((term) => prompt.toLowerCase().includes(term.toLowerCase()));
};
const reduction = (before, after) => Number((((before - after) / before) * 100).toFixed(2));
const majoritySelection = (modelEval, variant, canonicalId, promptHash) => {
  const runs = modelEval?.variants?.[variant]?.runs;
  if (!Array.isArray(runs) || runs.length !== 3) return '';
  const values = runs.map((run) => run.selections?.find((item) => item.canonicalId === canonicalId && item.promptHash === promptHash)?.selectedEntrypoint).filter(Boolean);
  if (values.length !== 3) return '';
  const counts = new Map(values.map((value) => [value, values.filter((item) => item === value).length]));
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][1] >= 2 ? [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0] : '';
};

export async function validateBoundEvalEvidence(modelEval, rawResultsDir) {
  if (!rawResultsDir) throw new Error('raw results directory is required with --model-eval');
  if (modelEval?.schemaVersion !== 'moonshot-model-skill-eval.v2' || modelEval.status !== 'passed'
    || modelEval.scorerVersion !== 'moonshot-model-skill-scorer.v3') throw new Error('model/local eval aggregate is not a passed v3 scored artifact');
  const manifest = modelEval.scoredInputManifest;
  if (manifest?.schemaVersion !== 'moonshot-model-skill-scored-input-manifest.v1' || !Array.isArray(manifest.entries) || manifest.entries.length !== 6
    || hash(JSON.stringify(manifest)) !== modelEval.scoredInputManifestHash) throw new Error('scored input manifest is missing or tampered');
  const provenance = modelEval.evidenceProvenance;
  if (!['external_model_blind', 'local_independent_blind_review'].includes(provenance?.evaluationMode)
    || !provenance?.reviewerId || !provenance?.independenceAttestation) throw new Error('bound eval provenance is invalid');
  if (manifest.provenanceFile !== 'provenance.json' || !/^[a-f0-9]{64}$/.test(manifest.provenanceSha256)) throw new Error('scored provenance binding is invalid');
  const provenanceText = await readFile(path.join(path.resolve(rawResultsDir), manifest.provenanceFile), 'utf8');
  if (hash(provenanceText) !== manifest.provenanceSha256) throw new Error('raw provenance digest mismatch');
  const rawProvenance = JSON.parse(provenanceText);
  if (rawProvenance.schemaVersion !== 'moonshot-model-skill-eval-provenance.v1'
    || rawProvenance.evaluationMode !== provenance.evaluationMode || rawProvenance.reviewerId !== provenance.reviewerId
    || rawProvenance.independenceAttestation !== provenance.independenceAttestation || !Array.isArray(rawProvenance.receipts)) throw new Error('raw provenance content mismatch');
  const rawReceipts = new Map(rawProvenance.receipts.map((receipt) => [`${receipt.variant}:${receipt.run}`, receipt]));
  const seen = new Set();
  const recomputed = { baseline: [], candidate: [] };
  for (const entry of manifest.entries) {
    const key = `${entry.variant}:${entry.run}`;
    if (seen.has(key) || !['baseline', 'candidate'].includes(entry.variant) || ![1, 2, 3].includes(entry.run)) throw new Error('scored input manifest run coverage is invalid');
    seen.add(key);
    const prefix = path.join(path.resolve(rawResultsDir), `${entry.variant}-run-${entry.run}`);
    const [promptText, bindingText, resultText] = await Promise.all([
      readFile(`${prefix}.prompt.txt`, 'utf8'), readFile(`${prefix}.binding.json`, 'utf8'), readFile(`${prefix}.json`, 'utf8'),
    ]);
    if (hash(promptText) !== entry.promptSha256 || hash(bindingText) !== entry.bindingSha256 || hash(resultText) !== entry.resultSha256) throw new Error(`raw scored input digest mismatch for ${key}`);
    const binding = JSON.parse(bindingText); const rawResult = JSON.parse(resultText);
    if (binding.promptHash !== hash(promptText) || rawResult.schemaVersion !== 'moonshot-model-skill-eval-run.v2'
      || !Array.isArray(binding.cases) || !Array.isArray(rawResult.cases) || binding.cases.length !== rawResult.cases.length
      || binding.evaluationId !== entry.evaluationId || rawResult.evaluationId !== entry.evaluationId
      || binding.caseOrderHash !== entry.caseOrderHash || rawResult.caseOrderHash !== entry.caseOrderHash
      || rawResult.variant !== entry.variant || rawResult.run !== entry.run
      || entry.provenance?.evaluationMode !== provenance.evaluationMode || entry.provenance?.reviewerId !== provenance.reviewerId
      || !entry.provenance?.receiptId || !entry.provenance?.reviewMethod) throw new Error(`raw scored input binding/provenance mismatch for ${key}`);
    const rawReceipt = rawReceipts.get(key);
    if (!rawReceipt || rawReceipt.receiptId !== entry.provenance.receiptId || rawReceipt.reviewerId !== entry.provenance.reviewerId
      || rawReceipt.reviewMethod !== entry.provenance.reviewMethod) throw new Error(`raw reviewer receipt mismatch for ${key}`);
    let tp = 0; let fn = 0; let tn = 0; let fp = 0; let prematureCompletionCount = 0; let hardGateFailureCount = 0;
    const selections = rawResult.cases.map((item, index) => {
      const bound = binding.cases[index];
      if (!bound || bound.caseId !== item.caseId) throw new Error(`raw case order mismatch for ${key}`);
      const [skill, polarity] = bound.canonicalId.split(':'); const selectedTarget = item.selectedEntrypoint === skill;
      if (polarity === 'positive') selectedTarget ? tp += 1 : fn += 1;
      else if (polarity === 'negative') selectedTarget ? fp += 1 : tn += 1;
      else throw new Error(`raw canonical polarity mismatch for ${key}`);
      if (item.prematureCompletion) prematureCompletionCount += 1;
      if (!item.hardGatesPreserved) hardGateFailureCount += 1;
      return { canonicalId: bound.canonicalId, promptHash: bound.promptHash, selectedEntrypoint: item.selectedEntrypoint };
    });
    recomputed[entry.variant][entry.run - 1] = { precision: tp + fp ? tp / (tp + fp) : 0, recall: tp / (tp + fn), tp, fn, tn, fp, prematureCompletionCount, hardGateFailureCount, selections };
  }
  if (seen.size !== 6) throw new Error('scored input manifest is incomplete');
  for (const variant of ['baseline', 'candidate']) {
    const runs = recomputed[variant];
    const expected = {
      runs, medianPrecision: median(runs.map((item) => item.precision)), worstPrecision: Math.min(...runs.map((item) => item.precision)),
      medianRecall: median(runs.map((item) => item.recall)), worstRecall: Math.min(...runs.map((item) => item.recall)),
      worstPrematureCompletionCount: Math.max(...runs.map((item) => item.prematureCompletionCount)),
      worstHardGateFailureCount: Math.max(...runs.map((item) => item.hardGateFailureCount)),
    };
    if (JSON.stringify(modelEval.variants?.[variant]) !== JSON.stringify(expected)) throw new Error(`aggregate scored values mismatch for ${variant}`);
  }
  const candidate = recomputed.candidate; const baseline = recomputed.baseline;
  const candidatePrecision = median(candidate.map((item) => item.precision)); const baselinePrecision = median(baseline.map((item) => item.precision));
  const candidateRecall = median(candidate.map((item) => item.recall)); const baselineRecall = median(baseline.map((item) => item.recall));
  const gates = {
    precisionAtLeast095: candidatePrecision >= 0.95, recallAtLeast095: candidateRecall >= 0.95,
    precisionNotBelowBaseline: candidatePrecision >= baselinePrecision, recallNotBelowBaseline: candidateRecall >= baselineRecall,
    noPrematureCompletion: Math.max(...candidate.map((item) => item.prematureCompletionCount)) === 0,
    noHardGateFailure: Math.max(...candidate.map((item) => item.hardGateFailureCount)) === 0,
  };
  if (JSON.stringify(modelEval.gates) !== JSON.stringify(gates) || modelEval.status !== (Object.values(gates).every(Boolean) ? 'passed' : 'failed')) throw new Error('aggregate gate/status mismatch');
  return provenance.evaluationMode;
}

async function sourceText({ repoRoot, ref, relative }) {
  return ref ? gitText(repoRoot, ref, relative) : readFile(path.join(repoRoot, relative), 'utf8');
}

export async function caseContext({ repoRoot, ref = '', skill, prompt, direct, catalogEntry }) {
  const skillPath = `skills/${skill}/SKILL.md`;
  const skillBody = await sourceText({ repoRoot, ref, relative: skillPath });
  const references = direct ? [] : frontmatterList(skillBody, 'deepReferences').filter((item) => referenceSignal(item, prompt));
  const conditions = Object.fromEntries(Object.entries(conditionSignals).map(([key, pattern]) => [key, pattern.test(prompt)]));
  const bundle = direct ? { activatedGroups: [], activated: [] } : resolveEntrypointConditionalSkills({ conditionalSkillGroups: catalogEntry?.conditionalSkillGroups || {}, conditions });
  const chunks = [{ kind: 'public_skill', id: skill, text: skillBody }];
  for (const reference of references) {
    const relative = reference.startsWith('docs/') || reference.startsWith('rules/') || reference.startsWith('schemas/') ? reference : `skills/${skill}/${reference}`;
    try { chunks.push({ kind: 'reference', id: reference, text: await sourceText({ repoRoot, ref, relative }) }); } catch { /* absent in frozen source means not loaded */ }
  }
  for (const internal of bundle.activated) {
    try { chunks.push({ kind: 'conditional_internal_skill', id: internal, text: await sourceText({ repoRoot, ref, relative: `skills/${internal}/SKILL.md` }) }); } catch { /* frozen source may predate optional internal */ }
  }
  const context = chunks.map((item) => item.text).join('\n\n');
  return { tokens: estimatedTokens(context), loadedReferences: chunks.filter((x) => x.kind === 'reference').map((x) => x.id), loadedInternalSkills: chunks.filter((x) => x.kind === 'conditional_internal_skill').map((x) => x.id), includedKinds: [...new Set(chunks.map((x) => x.kind))], excludedKinds: ['tool_output', 'runtime_log'] };
}

export async function evaluateSkillLightweightComparison({ repoRoot = process.cwd(), baselineManifestPath, routingBaselinePath, modelEvalPath = '', rawResultsDir = '', out = '', maxRegressionPercent = 5 } = {}) {
  const baselineManifest = JSON.parse(await readFile(baselineManifestPath, 'utf8'));
  const routingBaseline = JSON.parse(await readFile(routingBaselinePath, 'utf8'));
  const fixtureText = await readFile(path.join(repoRoot, 'tests/fixtures/skill-routing/public-entrypoint-cases.json'), 'utf8');
  if (hash(fixtureText) !== routingBaseline.fixtureHash) throw new Error('Phase01 routing fixture hash drift');
  const fixture = JSON.parse(fixtureText); const baselineRef = routingBaseline.sourceHeadSha;
  if (!/^[a-f0-9]{40}$/.test(baselineRef)) throw new Error('missing frozen Phase01 source SHA');
  const candidateManifest = await generateSkillCompatibilityManifest({ repoRoot, sourceFingerprint: 'current-candidate' });
  const candidateCatalog = JSON.parse(await readFile(path.join(repoRoot, 'catalog/moonshot-catalog.json'), 'utf8'));
  const baselineCatalog = JSON.parse(gitText(repoRoot, baselineRef, 'catalog/moonshot-catalog.json'));
  const candidateCatalogByName = new Map(candidateCatalog.publicEntrypoints.map((entry) => [entry.name, entry]));
  const baselineCatalogByName = new Map(baselineCatalog.publicEntrypoints.map((entry) => [entry.name, entry]));
  const modelEval = modelEvalPath ? JSON.parse(await readFile(modelEvalPath, 'utf8')) : null;
  const evaluationMode = modelEval ? await validateBoundEvalEvidence(modelEval, rawResultsDir) : '';
  const hasBoundModelSelections = modelEval?.schemaVersion === 'moonshot-model-skill-eval.v2'
    && ['baseline', 'candidate'].every((variant) => modelEval?.variants?.[variant]?.runs?.length === 3);
  const skills = [];
  for (const fixtureSkill of fixture.skills) {
    const cases = [];
    for (const [positiveIndex, prompt] of fixtureSkill.positive.entries()) {
      const direct = prompt.startsWith('$');
      const route = direct ? await resolveExplicitSkillInvocation(prompt, { repoRoot }) : await routeSkill(prompt, { repoRoot });
      const selected = direct ? route.selected : route.route?.selectedEntrypoint;
      const promptHash = hash(prompt);
      const canonicalId = `${fixtureSkill.name}:positive:${positiveIndex + 1}`;
      const baselineSelected = hasBoundModelSelections ? majoritySelection(modelEval, 'baseline', canonicalId, promptHash) : '';
      const candidateSelected = hasBoundModelSelections ? majoritySelection(modelEval, 'candidate', canonicalId, promptHash) : '';
      const empty = { tokens: 0, loadedReferences: [], loadedInternalSkills: [], includedKinds: [], excludedKinds: ['tool_output', 'runtime_log'] };
      const baseline = baselineSelected && baselineSelected !== 'none' ? await caseContext({ repoRoot, ref: baselineRef, skill: baselineSelected, prompt, direct, catalogEntry: baselineCatalogByName.get(baselineSelected) }) : empty;
      const candidate = candidateSelected && candidateSelected !== 'none' ? await caseContext({ repoRoot, skill: candidateSelected, prompt, direct, catalogEntry: candidateCatalogByName.get(candidateSelected) }) : empty;
      cases.push({ promptHash, mode: direct ? 'direct' : 'implicit', deterministicSelected: selected || '', deterministicRoutingMatched: selected === fixtureSkill.name, baselineModelSelected: baselineSelected, candidateModelSelected: candidateSelected, modelRoutingMatched: candidateSelected === fixtureSkill.name, baselineTokens: baseline.tokens, candidateTokens: candidate.tokens, reductionPercent: baseline.tokens ? reduction(baseline.tokens, candidate.tokens) : null, loadedReferences: candidate.loadedReferences, loadedInternalSkills: candidate.loadedInternalSkills, includedKinds: candidate.includedKinds, excludedKinds: candidate.excludedKinds });
    }
    const directCases = cases.filter((item) => item.mode === 'direct'); const implicitCases = cases.filter((item) => item.mode === 'implicit');
    const baselineContract = baselineManifest.skills.find((item) => item.name === fixtureSkill.name);
    const candidateContract = candidateManifest.skills.find((item) => item.name === fixtureSkill.name);
    const invariantKeys = ['name', 'publicPosition', 'descriptionIntent', 'triggers', 'outputArtifacts', 'requiredOutputs', 'conditionalOutputs', 'defaultPaths', 'hardStopIds', 'completionSemantics', 'directInvocationExamples'];
    const behaviorDrift = invariantKeys.filter((key) => JSON.stringify(baselineContract[key]) !== JSON.stringify(candidateContract[key]));
    const directMedianReductionPercent = median(directCases.map((item) => item.reductionPercent).filter(Number.isFinite));
    const implicitMedianReductionPercent = median(implicitCases.map((item) => item.reductionPercent).filter(Number.isFinite));
    skills.push({ name: fixtureSkill.name, directMedianReductionPercent, implicitMedianReductionPercent, macroMedianReductionPercent: median([directMedianReductionPercent, implicitMedianReductionPercent]), behaviorDrift, cases });
  }
  const macroMedianReductionPercent = median(skills.map((item) => item.macroMedianReductionPercent));
  const regressions = skills.filter((item) => item.directMedianReductionPercent < -maxRegressionPercent || item.implicitMedianReductionPercent < -maxRegressionPercent).map((item) => item.name);
  const deterministicRoutingMatched = skills.every((item) => item.cases.every((entry) => entry.deterministicRoutingMatched));
  const modelRoutingMatched = hasBoundModelSelections && skills.every((item) => item.cases.every((entry) => entry.modelRoutingMatched));
  const selectionAuthority = hasBoundModelSelections ? `${evaluationMode}_raw_digest_bound_majority_per_case` : 'unverified';
  const result = { schemaVersion: 'moonshot-skill-context-comparison.v2', baselineRef, fixtureHash: routingBaseline.fixtureHash, metric: 'utf8_bytes_divided_by_4_ceiling', contextContract: { includes: ['selected_public_skill_body', 'case_loaded_references', 'condition_activated_internal_skill_bodies'], excludes: ['tool_output', 'runtime_log'], selectionAuthority }, macroMedianReductionPercent, minimumRequiredPercent: 20, maxEntrypointRegressionPercent: maxRegressionPercent, regressions, deterministicRoutingMatched, modelRoutingMatched, exactBehaviorCompatibility: skills.every((item) => item.behaviorDrift.length === 0), skills };
  if (out) { const target = path.resolve(out); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, `${JSON.stringify(result, null, 2)}\n`); }
  return result;
}

async function main() {
  const args = process.argv.slice(2); const repoRoot = path.resolve(option(args, '--repo-root', process.cwd()));
  const result = await evaluateSkillLightweightComparison({ repoRoot, baselineManifestPath: path.resolve(option(args, '--baseline-manifest')), routingBaselinePath: path.resolve(option(args, '--routing-baseline')), modelEvalPath: option(args, '--model-eval'), rawResultsDir: option(args, '--raw-results-dir'), out: option(args, '--out'), maxRegressionPercent: Number(option(args, '--max-regression-percent', '5')) });
  console.log(JSON.stringify(result, null, 2));
  if (result.contextContract.selectionAuthority === 'unverified' || !result.exactBehaviorCompatibility || result.macroMedianReductionPercent < 20 || result.regressions.length) process.exitCode = 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
