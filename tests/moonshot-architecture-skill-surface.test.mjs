import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const fromRoot = (...segments) => path.join(root, ...segments);

const runtimeSurface = JSON.parse(await readFile(fromRoot('package/runtime-surface.json'), 'utf8'));

const internalSupportingSkills = [
  'asr-extractor',
  'architecture-option-generator',
  'architecture-tradeoff-reviewer',
  'adr-c4-writer',
  'architecture-gate-reviewer',
  'codebase-architecture-recovery',
];

test('moonshot-architecture skill contracts exist and define the public entrypoint boundary', async () => {
  for (const file of ['SKILL.md', 'SKILL.ko.md']) {
    const skillPath = fromRoot('skills', 'moonshot-architecture', file);
    assert.equal(existsSync(skillPath), true, `${file} should exist`);
    const text = await readFile(skillPath, 'utf8');

    assert.match(text, /^name: moonshot-architecture/m);
    assert.match(text, /layer: orchestrator/);
    assert.match(text, /greenfield_prd/);
    assert.match(text, /brownfield_codebase/);
    assert.match(text, /TRACEABILITY_MATRIX\.md/);
    assert.match(text, /runtime-state\.mjs assess-completion/);
    assert.match(text, /raw MemoryGraph|raw MemoryGraph record/);
    assert.match(text, /knowledgeAnchors/);
    assert.match(text, /consulted anchor|consulted anchor ID|consulted anchor IDs|anchor ID/i);
  }
});

test('moonshot-architecture is public while supporting architecture skills remain internal', () => {
  assert.equal(runtimeSurface.publicRuntimeSkills.includes('moonshot-architecture'), true);

  for (const internalSkill of internalSupportingSkills) {
    assert.equal(
      runtimeSurface.publicRuntimeSkills.includes(internalSkill),
      false,
      `${internalSkill} must not be profile-local public runtime skill`,
    );
  }
});

test('runtime surface and package contract both expose moonshot-architecture', async () => {
  const contract = await readFile(fromRoot('package', 'package-contract.yaml'), 'utf8');
  const runtimeSurfaceDocs = await readFile(fromRoot('docs', 'public', 'reference', 'runtime-skill-surface.md'), 'utf8');

  assert.match(contract.match(/publicRuntimeSkills:[\s\S]*?internalSkillPolicy:/)?.[0] || '', /moonshot-architecture/);
  assert.match(runtimeSurfaceDocs, /`moonshot-architecture`/);
});
