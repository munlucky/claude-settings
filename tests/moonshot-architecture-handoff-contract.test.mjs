import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const fromRoot = (...segments) => path.join(root, ...segments);
const readRoot = (...segments) => readFile(fromRoot(...segments), 'utf8');

test('product orchestrator routes architecture-heavy PRDs through moonshot architecture', async () => {
  for (const file of [
    ['skills', 'product-orchestrator', 'SKILL.md'],
    ['skills', 'product-orchestrator', 'SKILL.ko.md'],
  ]) {
    const content = await readRoot(...file);

    assert.match(content, /architecture-heavy PRD/i);
    assert.match(content, /moonshot-architecture/);
    assert.match(content, /REQUIREMENT_INVENTORY\.md/);
    assert.match(content, /TRACEABILITY_MATRIX\.md/);
    assert.match(content, /ARCHITECTURE_REVIEW\.md/);
    assert.match(content, /moonshot-orchestrator/);
    assert.match(content, /moonshot-phase-runner/);
  }
});

test('plan writer requires architecture package traceability before execution readiness', async () => {
  for (const file of [
    ['skills', 'moonshot-plan-writer', 'SKILL.md'],
    ['skills', 'moonshot-plan-writer', 'SKILL.ko.md'],
  ]) {
    const content = await readRoot(...file);

    assert.match(content, /TRACEABILITY_MATRIX\.md/);
    assert.match(content, /ADR\/\*\.md/);
    assert.match(content, /ARCHITECTURE_REVIEW\.md/);
    assert.match(content, /owner/i);
    assert.match(content, /verification signal/i);
    assert.match(content, /phase metadata/i);
  }
});

test('orchestrator and phase runner consume selected architecture slices without bypassing route boundaries', async () => {
  for (const file of [
    ['skills', 'moonshot-orchestrator', 'SKILL.md'],
    ['skills', 'moonshot-orchestrator', 'SKILL.ko.md'],
  ]) {
    const content = await readRoot(...file);

    assert.match(content, /moonshot-architecture/);
    assert.match(content, /ADR\/\*\.md/);
    assert.match(content, /TRACEABILITY_MATRIX\.md/);
    assert.match(content, /ARCHITECTURE_REVIEW\.md/);
    assert.match(content, /selected ADR/i);
    assert.match(content, /traceability slice/i);
  }

  for (const file of [
    ['skills', 'moonshot-phase-runner', 'SKILL.md'],
    ['skills', 'moonshot-phase-runner', 'SKILL.ko.md'],
  ]) {
    const content = await readRoot(...file);

    assert.match(content, /architecture package/i);
    assert.match(content, /selected ADR/i);
    assert.match(content, /traceability/i);
    assert.match(content, /owner/i);
    assert.match(content, /verification signal/i);
    assert.match(content, /Phase 08 owns controlled adoption|controlled adoption phase/i);
  }
});

test('public references describe source-first architecture handoff and controlled adoption', async () => {
  const skillSurface = await readRoot('docs', 'public', 'reference', 'runtime-skill-surface.md');
  const workflow = await readRoot('docs', 'public', 'reference', 'phase-runner-user-workflow.md');
  const guideline = await readRoot('docs', 'public', 'guidelines', 'moonshot-architecture.md');
  const guidelineKo = await readRoot('docs', 'public', 'guidelines', 'moonshot-architecture.ko.md');

  for (const content of [skillSurface, workflow, guideline, guidelineKo]) {
    assert.match(content, /TRACEABILITY_MATRIX\.md/);
    assert.match(content, /ADR\/\*\.md/);
    assert.match(content, /ARCHITECTURE_REVIEW\.md/);
  }

  assert.match(skillSurface, /package dry-run/);
  assert.match(skillSurface, /installer dry-run/);
  assert.match(workflow, /build-package\.mjs --runtime all --dry-run --json/);
  assert.match(workflow, /install-account-root-harness\.mjs --runtime all --dry-run --json/);
});
