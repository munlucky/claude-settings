import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const fromRoot = (...segments) => path.join(root, ...segments);

const internalSupportingSkills = [
  'asr-extractor',
  'architecture-option-generator',
  'architecture-tradeoff-reviewer',
  'adr-c4-writer',
  'architecture-gate-reviewer',
  'codebase-architecture-recovery',
];

const expectedArtifacts = new Map([
  ['asr-extractor', ['ASR_CATALOG.md', 'QUALITY_ATTRIBUTE_SCENARIOS.md']],
  ['architecture-option-generator', ['ARCHITECTURE_OPTIONS.md', 'CAPABILITY_MAP.md']],
  ['architecture-tradeoff-reviewer', ['TRADEOFF_ANALYSIS.md', 'TRACEABILITY_MATRIX.md']],
  ['adr-c4-writer', ['C4/C4_CONTEXT.md', 'ADR/*.md']],
  ['architecture-gate-reviewer', ['ARCHITECTURE_REVIEW.md', 'TRACEABILITY_MATRIX.md']],
  ['codebase-architecture-recovery', ['CURRENT_ARCHITECTURE.md', 'SPEC_DELTA.md']],
]);

const runtimeSurface = JSON.parse(await readFile(fromRoot('package', 'runtime-surface.json'), 'utf8'));

test('supporting architecture skills exist as internal bilingual source skills', async () => {
  for (const skill of internalSupportingSkills) {
    for (const file of ['SKILL.md', 'SKILL.ko.md']) {
      const skillPath = fromRoot('skills', skill, file);
      assert.equal(existsSync(skillPath), true, `${skill}/${file} should exist`);
      const text = await readFile(skillPath, 'utf8');

      assert.match(text, new RegExp(`^name: ${skill}$`, 'm'));
      assert.match(text, /^layer: internal$/m, `${skill}/${file} should be internal`);
      assert.match(text, /## Role|## 역할/);
      assert.match(text, /## Flow|## 흐름/);
      assert.match(text, /## Hard Stops/);
      assert.match(text, /## Required Evidence/);
      assert.match(text, /not a public runtime entrypoint|public runtime entrypoint가 아닙니다/);

      for (const artifact of expectedArtifacts.get(skill)) {
        assert.ok(text.includes(artifact), `${skill}/${file} should mention ${artifact}`);
      }
    }
  }
});

test('supporting architecture skills are absent from public runtime surface', () => {
  assert.equal(runtimeSurface.publicRuntimeSkills.includes('moonshot-architecture'), true);

  for (const skill of internalSupportingSkills) {
    assert.equal(
      runtimeSurface.publicRuntimeSkills.includes(skill),
      false,
      `${skill} must remain source-only internal skill`,
    );
  }
});

test('moonshot-architecture references every internal stage owner', async () => {
  for (const file of ['SKILL.md', 'SKILL.ko.md']) {
    const text = await readFile(fromRoot('skills', 'moonshot-architecture', file), 'utf8');

    assert.match(text, /## Internal Stage Owners/);
    assert.match(text, /ARCHITECTURE_REVIEW\.md/);
    assert.match(text, /architecture-gate-reviewer/);
    assert.match(text, /readiness evidence|readiness/);
    for (const skill of internalSupportingSkills) {
      assert.match(text, new RegExp(`\`${skill}\``), `${file} should reference ${skill}`);
    }
  }
});

test('tradeoff reviewer does not claim ADR file ownership', async () => {
  for (const file of ['SKILL.md', 'SKILL.ko.md']) {
    const text = await readFile(fromRoot('skills', 'architecture-tradeoff-reviewer', file), 'utf8');
    const frontMatter = text.match(/^---[\s\S]*?---/)?.[0] || '';

    assert.doesNotMatch(frontMatter, /ADR\/\*\.md/);
    assert.match(text, /adr-c4-writer/);
  }
});

test('package contract preserves internal skills in common payload without public exposure', async () => {
  const contract = await readFile(fromRoot('package', 'package-contract.yaml'), 'utf8');
  const internalPolicy = contract.match(/internalSkillPolicy:[\s\S]*?bootstrapSkillPolicy:/)?.[0] || '';

  assert.match(contract, /skills\/\*\*/);
  assert.match(internalPolicy, /common payload/);
  assert.match(internalPolicy, /profile-local skills/);
  for (const skill of internalSupportingSkills) {
    assert.doesNotMatch(runtimeSurface.publicRuntimeSkills.join('\n'), new RegExp(`^${skill}$`, 'm'));
  }
});
