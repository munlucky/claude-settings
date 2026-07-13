import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

import { generateSkillCompatibilityManifest, validateSkillCompatibilityManifest } from '../tools/evals/skill-compatibility-manifest.mjs';
import { captureSkillRoutingBaseline } from '../tools/evals/skill-routing-baseline.mjs';
import { evaluateProductionCase, registerProductionEvaluator } from '../tools/evals/production-evaluators.mjs';
import { caseContext } from '../tools/evals/skill-lightweight-comparison.mjs';

const root = process.cwd();

test('compatibility manifest deterministically freezes all seven public entrypoints in order', async () => {
  const first = await generateSkillCompatibilityManifest({ repoRoot: root, sourceFingerprint: 'test-source' });
  const second = await generateSkillCompatibilityManifest({ repoRoot: root, sourceFingerprint: 'test-source' });
  const runtimeSurface = JSON.parse(await readFile(path.join(root, 'package/runtime-surface.json'), 'utf8'));
  assert.deepEqual(first, second);
  assert.deepEqual(first.skills.map((skill) => skill.name), runtimeSurface.publicRuntimeSkills);
  assert.equal(new Set(first.skills.map((skill) => skill.contractHash)).size, 7);
  assert.ok(first.skills.every((skill) => skill.directInvocationExamples.includes(`$${skill.name}`)));
  assert.ok(first.skills.every((skill) => skill.hardStopIds.length > 0));
  assert.ok(first.skills.every((skill) => skill.requiredOutputs.length > 0));
  assert.equal(validateSkillCompatibilityManifest(first, runtimeSurface.publicRuntimeSkills), true);
});

test('compatibility manifest CLI writes runtime-owned baseline-capable artifact', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-skill-compat-'));
  try {
    const out = path.join(tempRoot, 'runtime/eval/baselines/skill-compatibility/test-source/manifest.json');
    const result = spawnSync(process.execPath, ['tools/evals/skill-compatibility-manifest.mjs', '--repo-root', root, '--source-fingerprint', 'test-source', '--out', out], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const manifest = JSON.parse(await readFile(out, 'utf8'));
    assert.equal(manifest.sourceFingerprint, 'test-source');
    assert.equal(manifest.skills.length, 7);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('compatibility validation rejects public order drift', async () => {
  const manifest = await generateSkillCompatibilityManifest({ repoRoot: root, sourceFingerprint: 'test-source' });
  const reversed = structuredClone(manifest);
  reversed.skills.reverse();
  assert.throws(() => validateSkillCompatibilityManifest(reversed, manifest.skills.map((skill) => skill.name)), /order mismatch|invalid compatibility contract/);
});

test('compatibility validation rejects empty canonical metadata and recomputed hash drift', async () => {
  const manifest = await generateSkillCompatibilityManifest({ repoRoot: root, sourceFingerprint: 'test-source' });
  const empty = structuredClone(manifest);
  empty.skills[0].hardStopIds = [];
  assert.throws(() => validateSkillCompatibilityManifest(empty), /hard-stop metadata/);
  const tampered = structuredClone(manifest);
  tampered.skills[0].descriptionIntent = 'mutated without hash update';
  assert.throws(() => validateSkillCompatibilityManifest(tampered), /hash mismatch/);
});

test('semantic compatibility metadata and malformed ID drift fail closed', async () => {
  const source = JSON.parse(await readFile(path.join(root, 'tools/evals/public-skill-semantic-contract.json'), 'utf8'));
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-skill-semantic-'));
  try {
    const changedPath = path.join(tempRoot, 'changed.json');
    const changed = structuredClone(source);
    changed.skills['moonshot-orchestrator'].defaultPaths.push('references/meaningful-new-contract.md');
    await writeFile(changedPath, `${JSON.stringify(changed, null, 2)}\n`);
    await assert.rejects(
      () => generateSkillCompatibilityManifest({ repoRoot: root, sourceFingerprint: 'semantic-candidate', semanticContractPath: changedPath }),
      /default path semantic contract drift/,
    );

    const malformedPath = path.join(tempRoot, 'malformed.json');
    const malformed = structuredClone(source);
    malformed.skills['moonshot-orchestrator'].hardStopIds[0] = 'wrong-skill.hard-stop.01:tampered';
    await writeFile(malformedPath, `${JSON.stringify(malformed, null, 2)}\n`);
    await assert.rejects(() => generateSkillCompatibilityManifest({ repoRoot: root, semanticContractPath: malformedPath }), /invalid hard-stop IDs/);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('semantic sidecar cannot hide deletion from the declared loadable compatibility reference', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-skill-reference-drift-'));
  try {
    const skillRoot = path.join(tempRoot, 'skills');
    for (const name of Object.keys(JSON.parse(await readFile(path.join(root, 'tools/evals/public-skill-semantic-contract.json'), 'utf8')).skills)) {
      const target = path.join(skillRoot, name, 'references');
      await mkdir(target, { recursive: true });
      await writeFile(path.join(skillRoot, name, 'SKILL.md'), await readFile(path.join(root, 'skills', name, 'SKILL.md'), 'utf8'));
      const source = await readFile(path.join(root, 'skills', name, 'references/compatibility-contract.md'), 'utf8');
      const mutated = name === 'moonshot-orchestrator' ? source.replace(/^- `ADR\/\*\.md`\n/m, '') : source;
      await writeFile(path.join(target, 'compatibility-contract.md'), mutated);
    }
    await assert.rejects(
      () => generateSkillCompatibilityManifest({ repoRoot: root, compatibilityReferenceRoot: skillRoot }),
      /default path semantic contract drift for moonshot-orchestrator/,
    );
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('opposite visible policy edit fails source digest binding even when sidecar invariants are unchanged', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'moonshot-skill-policy-opposite-'));
  try {
    for (const relative of ['package/runtime-surface.json', 'catalog/moonshot-catalog.json', 'schemas/skill-compatibility-manifest.schema.json', 'tools/evals/public-skill-semantic-contract.json']) {
      const target = path.join(temp, relative); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, await readFile(path.join(root, relative), 'utf8'));
    }
    const names = JSON.parse(await readFile(path.join(root, 'package/runtime-surface.json'), 'utf8')).publicRuntimeSkills;
    for (const name of names) {
      const skillDir = path.join(temp, 'skills', name); await mkdir(path.join(skillDir, 'references'), { recursive: true });
      let skill = await readFile(path.join(root, 'skills', name, 'SKILL.md'), 'utf8');
      if (name === 'moonshot-orchestrator') skill = skill.replace('Do not broaden scope beyond the user request.', 'Always broaden scope beyond the user request.');
      await writeFile(path.join(skillDir, 'SKILL.md'), skill);
      await writeFile(path.join(skillDir, 'references/compatibility-contract.md'), await readFile(path.join(root, 'skills', name, 'references/compatibility-contract.md'), 'utf8'));
    }
    await assert.rejects(() => generateSkillCompatibilityManifest({ repoRoot: temp }), /source policy binding drift for moonshot-orchestrator/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('routing baseline defines ten positive and five negative cases per public entrypoint', async () => {
  const fixture = JSON.parse(await readFile(path.join(root, 'tests/fixtures/skill-routing/public-entrypoint-cases.json'), 'utf8'));
  const runtimeSurface = JSON.parse(await readFile(path.join(root, 'package/runtime-surface.json'), 'utf8'));
  assert.deepEqual(fixture.skills.map((skill) => skill.name), runtimeSurface.publicRuntimeSkills);
  for (const skill of fixture.skills) {
    assert.equal(skill.positive.length, 10, `${skill.name} positive coverage`);
    assert.equal(skill.negative.length, 5, `${skill.name} negative coverage`);
    assert.equal(skill.positive[0], `$${skill.name}`, `${skill.name} direct invocation case`);
  }
});

test('baseline capture runs production router and freezes contract hashes without claiming model evidence', async () => {
  const baseline = await captureSkillRoutingBaseline({ repoRoot: root });
  assert.equal(baseline.deterministic.results.length, 105);
  assert.equal(baseline.deterministic.directInvocationSuccessRate, 1);
  assert.equal(baseline.deterministic.evaluator, 'scripts/skill-router.mjs#searchSkills');
  assert.match(baseline.sourceHeadSha, /^[a-f0-9]{40}$/);
  assert.equal(Object.hasOwn(baseline, 'previousReleaseSha'), false);
  assert.equal(baseline.previousRelease.status, 'unverified');
  assert.equal(Object.keys(baseline.compatibilityManifestHashes).length, 7);
  assert.equal(baseline.model.status, 'not_run');
  assert.equal(baseline.installedMaterialization.liveAdoptionBlocked, true);
});

test('production evaluator exceptions and timeouts are typed failures', async () => {
  registerProductionEvaluator('test-exception', () => { throw new Error('boom'); });
  registerProductionEvaluator('test-timeout', () => new Promise(() => {}));
  const exception = await evaluateProductionCase({ category: 'test-exception' });
  const timeout = await evaluateProductionCase({ category: 'test-timeout' }, { timeoutMs: 5 });
  assert.equal(exception.failureClass, 'evaluator_exception');
  assert.equal(timeout.failureClass, 'evaluator_timeout');
});

test('token evidence context is not a SKILL-only byte proxy', async () => {
  const catalog = JSON.parse(await readFile(path.join(root, 'catalog/moonshot-catalog.json'), 'utf8'));
  const entry = catalog.publicEntrypoints.find((item) => item.name === 'moonshot-architecture');
  const implicit = await caseContext({ repoRoot: root, skill: 'moonshot-architecture', prompt: 'architecture handoff 준비', direct: false, catalogEntry: entry });
  const direct = await caseContext({ repoRoot: root, skill: 'moonshot-architecture', prompt: '$moonshot-architecture', direct: true, catalogEntry: entry });
  assert.ok(implicit.loadedReferences.some((item) => item.includes('handoff-boundaries')));
  assert.ok(implicit.loadedInternalSkills.includes('architecture-gate-reviewer'));
  assert.ok(implicit.tokens > direct.tokens);
  assert.deepEqual(implicit.excludedKinds, ['tool_output', 'runtime_log']);
  assert.deepEqual(direct.loadedReferences, []);
  assert.deepEqual(direct.loadedInternalSkills, []);
});

test('phase executor context loads only for an explicit attempt handoff', async () => {
  const catalog = JSON.parse(await readFile(path.join(root, 'catalog/moonshot-catalog.json'), 'utf8'));
  const entry = catalog.publicEntrypoints.find((item) => item.name === 'moonshot-phase-runner');
  const selected = await caseContext({ repoRoot: root, skill: 'moonshot-phase-runner', prompt: 'run this plan', direct: false, catalogEntry: entry });
  const attempt = await caseContext({ repoRoot: root, skill: 'moonshot-phase-runner', prompt: 'phaseAttemptMode=true', direct: false, catalogEntry: entry });

  assert.deepEqual(selected.loadedInternalSkills, []);
  assert.ok(attempt.loadedInternalSkills.includes('moonshot-phase-executor'));
  assert.ok(attempt.tokens > selected.tokens);
});
