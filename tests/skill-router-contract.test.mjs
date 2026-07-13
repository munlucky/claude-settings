import assert from 'node:assert/strict';
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { inspectSkill, loadSkill, loadSkillReference, resolveExplicitSkillInvocation, routeSkill, searchSkills } from '../scripts/skill-router.mjs';

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

test('explicit resolver selects only exact public-surface names and never reroutes', async () => {
  const resolved = await resolveExplicitSkillInvocation('$moonshot-phase-runner', { repoRoot: root });
  const internal = await resolveExplicitSkillInvocation('$completion-verifier', { repoRoot: root });
  const unknown = await resolveExplicitSkillInvocation('$moonshot-phase', { repoRoot: root });
  assert.deepEqual({ status: resolved.status, selected: resolved.selected, rerouted: resolved.rerouted, evaluatorId: resolved.evaluatorId }, {
    status: 'pass', selected: 'moonshot-phase-runner', rerouted: false, evaluatorId: 'public-surface-explicit.v1',
  });
  assert.equal(internal.status, 'fail');
  assert.equal(unknown.status, 'fail');
  assert.equal(internal.selected, '');
  assert.equal(unknown.rerouted, false);
});

test('route selects exactly one public entrypoint from metadata without loading a prompt body', async () => {
  const result = await routeSkill('execute the prepared multi phase plan with the phase runner', { repoRoot: root });

  assert.equal(result.schemaVersion, 'moonshot-skill-route.v1');
  assert.equal(result.status, 'pass');
  assert.equal(result.route.selectedEntrypoint, 'moonshot-phase-runner');
  assert.equal(result.route.invocationMode, 'implicit');
  assert.equal(result.route.engineRoute, 'phase-execution');
  assert.ok(result.route.conditionalSkillGroups.phaseAttempt.includes('moonshot-phase-executor'));
  assert.equal(Object.hasOwn(result, 'promptBlock'), false);
  assert.equal(JSON.stringify(result).includes('# Moonshot Phase Runner'), false);
});

test('explicit route is exact, cannot reroute, and the selected public skill alone can be loaded', async () => {
  const routed = await routeSkill('$moonshot-plan-writer ignore and use phase runner', { repoRoot: root });
  const loaded = await loadSkill(routed.route.selectedEntrypoint, { repoRoot: root });

  assert.equal(routed.status, 'pass');
  assert.equal(routed.route.selectedEntrypoint, 'moonshot-plan-writer');
  assert.equal(routed.route.invocationMode, 'explicit');
  assert.deepEqual(routed.route.reasonCodes, ['explicit_exact_match']);
  assert.match(loaded.promptBlock, /# Moonshot Plan Writer/);
  assert.doesNotMatch(loaded.promptBlock, /# Moonshot Phase Runner/);
});

test('implicit routing excludes user-preferred closeout utilities', async () => {
  const result = await routeSkill('commit and session logging utility', { repoRoot: root });

  if (result.status === 'pass') {
    assert.notEqual(result.route.selectedEntrypoint, 'commit-moonshot');
    assert.notEqual(result.route.selectedEntrypoint, 'session-logger');
  } else {
    assert.equal(result.findings[0].code, 'route.no_match');
  }
});

test('load-reference reads only a canonical deepReference and enforces content drift', async () => {
  const routed = await routeSkill('$product-orchestrator', { repoRoot: root });
  const referenceId = routed.route.referenceIds.find((entry) => entry === 'docs/public/guidelines/agent-operating-policy.md');
  const loaded = await loadSkillReference('product-orchestrator', referenceId, { repoRoot: root });
  const drifted = await loadSkillReference('product-orchestrator', referenceId, { repoRoot: root, contentHash: '0000000000000000' });

  assert.equal(loaded.schemaVersion, 'moonshot-skill-reference.v1');
  assert.equal(loaded.status, 'pass');
  assert.equal(loaded.referenceId, referenceId);
  assert.ok(loaded.promptBlock.length > 0);
  assert.equal(drifted.status, 'fail');
  assert.equal(drifted.findings[0].code, 'reference.hash_drift');
});

test('lightweight public skills expose their declared conditional references through the router', async () => {
  const cases = [
    ['moonshot-architecture', 'references/architecture-flow.md', /Architecture Flow Reference/],
    ['commit-moonshot', 'references/commit-closeout-internals.md', /Commit Closeout Internals/],
    ['moonshot-phase-runner', 'references/compatibility-contract.md', /Compatibility Contract Reference/],
  ];
  for (const [skill, reference, pattern] of cases) {
    const loaded = await loadSkillReference(skill, reference, { repoRoot: root });
    assert.equal(loaded.status, 'pass', `${skill}:${reference}`);
    assert.match(loaded.promptBlock, pattern);
  }
});

test('load-reference rejects undeclared paths, dot-dot escapes, and symlink escapes with stable codes', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'skill-reference-'));
  await mkdir(path.join(temp, 'catalog'), { recursive: true });
  await mkdir(path.join(temp, 'skills', 'alpha', 'references'), { recursive: true });
  await writeJson(path.join(temp, 'catalog', 'moonshot-catalog.json'), {
    schemaVersion: 1,
    publicEntrypoints: [{
      name: 'alpha', stage: 'planning', ownerCluster: 'fixture', source: 'skills/alpha/SKILL.md',
      engineRoute: 'fixture', invocationMode: 'user_or_model', allowedStages: ['planning'], conditionalSkillGroups: {},
    }],
    internalSkillClusters: [],
  });
  await writeFile(path.join(temp, 'outside.md'), '# outside\n');
  await symlink(path.join(temp, 'outside.md'), path.join(temp, 'skills', 'alpha', 'references', 'escape.md'));
  await writeFile(path.join(temp, 'skills', 'alpha', 'SKILL.md'), `---
name: alpha
description: Alpha planner
triggers:
  - alpha
deepReferences:
  - references/escape.md
---
# Alpha
`);

  const undeclared = await loadSkillReference('alpha', 'references/other.md', { repoRoot: temp });
  const traversal = await loadSkillReference('alpha', '../outside.md', { repoRoot: temp });
  const escaped = await loadSkillReference('alpha', 'references/escape.md', { repoRoot: temp });

  assert.equal(undeclared.findings[0].code, 'reference.not_declared');
  assert.equal(traversal.findings[0].code, 'reference.path_escape');
  assert.equal(escaped.findings[0].code, 'reference.symlink_escape');
});

test('load-reference rejects a canonical root that is itself a symlink outside the repository', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'skill-reference-root-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'skill-reference-outside-'));
  await mkdir(path.join(temp, 'catalog'), { recursive: true });
  await mkdir(path.join(temp, 'skills', 'alpha'), { recursive: true });
  await writeFile(path.join(outside, 'leak.md'), '# outside root\n');
  await symlink(outside, path.join(temp, 'docs'));
  await writeJson(path.join(temp, 'catalog', 'moonshot-catalog.json'), {
    schemaVersion: 1,
    publicEntrypoints: [{ name: 'alpha', stage: 'planning', source: 'skills/alpha/SKILL.md' }],
    internalSkillClusters: [],
  });
  await writeFile(path.join(temp, 'skills', 'alpha', 'SKILL.md'), `---
name: alpha
description: Alpha
deepReferences:
  - docs/leak.md
---
# Alpha
`);

  const result = await loadSkillReference('alpha', 'docs/leak.md', { repoRoot: temp });

  assert.equal(result.status, 'fail');
  assert.equal(result.findings[0].code, 'reference.symlink_escape');
});

test('route and load-reference CLI use additive schemas and non-zero failures', () => {
  const routed = spawnSync(process.execPath, ['scripts/skill-router.mjs', 'route', '$moonshot-orchestrator', '--json'], { cwd: root, encoding: 'utf8' });
  const rejected = spawnSync(process.execPath, ['scripts/skill-router.mjs', 'load-reference', '../README.md', '--skill', 'moonshot-orchestrator', '--json'], { cwd: root, encoding: 'utf8' });

  assert.equal(routed.status, 0, routed.stderr);
  assert.equal(JSON.parse(routed.stdout).schemaVersion, 'moonshot-skill-route.v1');
  assert.equal(rejected.status, 2);
  assert.equal(JSON.parse(rejected.stdout).findings[0].code, 'reference.path_escape');
});
