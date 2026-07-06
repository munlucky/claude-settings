import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const readRoot = (...segments) => readFile(path.join(root, ...segments), 'utf8');

test('skill readiness records task-relevant consultation without expanding public surface', async () => {
  const guideline = await readRoot('docs', 'public', 'guidelines', 'skill-readiness-policy.md');
  const schema = await readRoot('schemas', 'skill-readiness.schema.yaml');
  const runtimeSurface = JSON.parse(await readRoot('package', 'runtime-surface.json'));

  assert.match(guideline, /task-relevant skills/);
  assert.match(guideline, /Do not read every skill by default/);
  assert.match(schema, /detectedTaskProfiles/);
  assert.match(schema, /consultedSkills/);
  assert.equal(runtimeSurface.publicRuntimeSkills.includes('assumption-ledger'), false);
  assert.equal(runtimeSurface.publicRuntimeSkills.includes('completion-verifier'), false);
});

test('phase and product skills keep skill readiness as evidence', async () => {
  const phaseRunner = await readRoot('skills', 'moonshot-phase-runner', 'SKILL.md');
  const product = await readRoot('skills', 'product-orchestrator', 'SKILL.md');

  assert.match(phaseRunner, /skill-readiness-policy\.md/);
  assert.match(product, /skill-readiness-policy\.md/);
  assert.match(phaseRunner, /not a public runtime surface change/i);
});
