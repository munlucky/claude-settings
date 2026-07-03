import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { lintSkillsAndAgents } from '../scripts/lint-skills.mjs';

const root = process.cwd();

const writeJson = (target, value) => writeFile(target, `${JSON.stringify(value, null, 2)}\n`);

test('skill and agent lint passes for current public runtime surface', async () => {
  const result = await lintSkillsAndAgents({ repoRoot: root });

  assert.equal(result.status, 'pass', JSON.stringify(result.findings.filter((finding) => finding.severity === 'blocking'), null, 2));
  assert.ok(result.publicSkills.includes('moonshot-phase-runner'));
});

test('skill and agent lint fails for missing public headings and agent output contract', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'skill-lint-'));
  await mkdir(path.join(temp, 'package'), { recursive: true });
  await mkdir(path.join(temp, 'skills', 'public-skill'), { recursive: true });
  await mkdir(path.join(temp, 'agents'), { recursive: true });
  await writeJson(path.join(temp, 'package', 'runtime-surface.json'), {
    publicRuntimeSkills: ['public-skill'],
  });
  await writeFile(path.join(temp, 'skills', 'public-skill', 'SKILL.md'), `---
name: public-skill
description: Fixture
---

# Public Skill

## Role

Only role exists.
`);
  await writeFile(path.join(temp, 'skills', 'public-skill', 'SKILL.ko.md'), '# 공개 스킬\n\n## 역할\n');
  await writeFile(path.join(temp, 'agents', 'bad-agent.md'), '# Bad Agent\n\n## Role\n\nNo input or output.\n');

  const result = await lintSkillsAndAgents({ repoRoot: temp });

  assert.equal(result.status, 'fail');
  assert.ok(result.findings.some((finding) => finding.code === 'skill.public_heading_missing'));
  assert.ok(result.findings.some((finding) => finding.code === 'agent.heading_missing'));
  assert.ok(result.findings.some((finding) => finding.code === 'agent.output_heading_missing'));
});

test('skill and agent lint blocks profile-local paths presented as durable source', async () => {
  const temp = await mkdtemp(path.join(os.tmpdir(), 'skill-lint-profile-ref-'));
  await mkdir(path.join(temp, 'package'), { recursive: true });
  await mkdir(path.join(temp, 'skills', 'public-skill'), { recursive: true });
  await mkdir(path.join(temp, 'agents'), { recursive: true });
  await writeJson(path.join(temp, 'package', 'runtime-surface.json'), {
    publicRuntimeSkills: ['public-skill'],
  });
  await writeFile(path.join(temp, 'skills', 'public-skill', 'SKILL.md'), `---
name: public-skill
description: Fixture
---

# Public Skill

## Purpose

Fixture.

## Required flow

Edit .claude/skills as durable source.

## Hard rules

Do not skip.

## Required Evidence

Report it.

## References

- source
`);
  const result = await lintSkillsAndAgents({ repoRoot: temp });

  assert.equal(result.status, 'fail');
  assert.ok(result.findings.some((finding) => finding.code === 'skill.profile_local_source_reference_blocking'));
});

test('skill and agent lint CLI reports pass for source checkout', () => {
  const result = spawnSync(process.execPath, [
    'scripts/lint-skills.mjs',
    '--json',
  ], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, 'pass', JSON.stringify(payload.findings.filter((finding) => finding.severity === 'blocking'), null, 2));
});
