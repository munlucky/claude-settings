import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { inspectSkill, loadSkill, searchSkills } from '../scripts/skill-router.mjs';

const root = process.cwd();

const writeJson = (target, value) => writeFile(target, `${JSON.stringify(value, null, 2)}\n`);

test('skill router search and inspect expose metadata without skill body', async () => {
  const search = await searchSkills('architecture gate', { repoRoot: root });

  assert.equal(search.status, 'pass');
  assert.ok(search.results.some((skill) => skill.name === 'architecture-gate-reviewer'));
  assert.equal(Object.hasOwn(search.results[0], 'promptBlock'), false);

  const inspect = await inspectSkill('moonshot-phase-runner', { repoRoot: root });
  assert.equal(inspect.status, 'pass');
  assert.equal(inspect.skill.exposure, 'public');
  assert.equal(Object.hasOwn(inspect, 'promptBlock'), false);
});

test('skill router resolves repo-root deep references without skill-local prefixes', async () => {
  const inspect = await inspectSkill('product-orchestrator', { repoRoot: root });

  assert.equal(inspect.status, 'pass');
  assert.ok(inspect.skill.references.includes('docs/public/guidelines/agent-operating-policy.md'));
  assert.ok(inspect.skill.references.includes('docs/public/guidelines/retrieval-and-recency-policy.md'));
  assert.equal(
    inspect.skill.references.some((reference) => reference.startsWith('skills/product-orchestrator/docs/')),
    false,
  );
});

test('skill router load returns selected prompt block and redacts unsafe lines', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'skill-router-'));
  await mkdir(path.join(temp, 'catalog'), { recursive: true });
  await mkdir(path.join(temp, 'skills', 'unsafe-skill'), { recursive: true });
  await writeJson(path.join(temp, 'catalog', 'moonshot-catalog.json'), {
    schemaVersion: 1,
    publicEntrypoints: [],
    internalSkillClusters: [
      { id: 'fixture', stage: 'verification', skills: ['unsafe-skill'] },
    ],
  });
  await writeFile(path.join(temp, 'skills', 'unsafe-skill', 'SKILL.md'), `---
name: unsafe-skill
description: Fixture
triggers:
  - fixture
---

# Unsafe Skill

## Role

Use this fixture.

runtimeLogBody:
  account=should-not-leak
rawMemoryGraph:
  node=should-not-leak
browserScrapeBody:
  html=should-not-leak
- runtimeLogBody:
  account=bullet-leak

## Flow

Continue safely.
`);

  const result = await loadSkill('unsafe-skill', { repoRoot: temp });

  assert.equal(result.status, 'pass');
  assert.equal(result.promptSafety.status, 'redacted');
  assert.match(result.promptBlock, /Continue safely/);
  assert.doesNotMatch(result.promptBlock, /should-not-leak/);
  assert.doesNotMatch(result.promptBlock, /runtimeLogBody/);
  assert.doesNotMatch(result.promptBlock, /rawMemoryGraph/);
  assert.doesNotMatch(result.promptBlock, /browserScrapeBody/);
  assert.doesNotMatch(result.promptBlock, /bullet-leak/);
});

test('skill router CLI search works for source catalog', () => {
  const result = spawnSync(process.execPath, [
    'scripts/skill-router.mjs',
    'search',
    'phase runner',
    '--json',
  ], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, 'pass');
  assert.ok(payload.results.some((skill) => skill.name === 'moonshot-phase-runner'));
});
