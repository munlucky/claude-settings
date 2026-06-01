import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

function findRepoRoot(startDir) {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.git'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  throw new Error(`Unable to locate repository root from ${startDir}`);
}

const repoRoot = findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function assertFilesEqual(paths) {
  const [first, ...rest] = paths;
  const expected = readRepoFile(first);
  for (const candidate of rest) {
    assert.equal(
      readRepoFile(candidate),
      expected,
      `${candidate} must stay synchronized with ${first}`,
    );
  }
}

test('harness TDD and readiness contracts stay synchronized across root and profiles', () => {
  const syncedGroups = [
    [
      'skills/moonshot-relay-maintainer/SKILL.md',
      '.claude/skills/moonshot-relay-maintainer/SKILL.md',
      '.codex/skills/moonshot-relay-maintainer/SKILL.md',
    ],
    [
      'skills/moonshot-relay-maintainer/SKILL.ko.md',
      '.claude/skills/moonshot-relay-maintainer/SKILL.ko.md',
      '.codex/skills/moonshot-relay-maintainer/SKILL.ko.md',
    ],
    [
      'skills/test-driven-development/SKILL.md',
      '.claude/skills/test-driven-development/SKILL.md',
      '.codex/skills/test-driven-development/SKILL.md',
    ],
    [
      'skills/test-driven-development/SKILL.ko.md',
      '.claude/skills/test-driven-development/SKILL.ko.md',
      '.codex/skills/test-driven-development/SKILL.ko.md',
    ],
    [
      'skills/moonshot-plan-writer/SKILL.md',
      '.claude/skills/moonshot-plan-writer/SKILL.md',
      '.codex/skills/moonshot-plan-writer/SKILL.md',
    ],
    [
      'skills/moonshot-plan-writer/SKILL.ko.md',
      '.claude/skills/moonshot-plan-writer/SKILL.ko.md',
      '.codex/skills/moonshot-plan-writer/SKILL.ko.md',
    ],
    [
      'skills/moonshot-plan-writer/assets/master-plan.template.md',
      '.claude/skills/moonshot-plan-writer/assets/master-plan.template.md',
      '.codex/skills/moonshot-plan-writer/assets/master-plan.template.md',
    ],
    [
      'skills/moonshot-plan-writer/assets/master-plan.template.ko.md',
      '.claude/skills/moonshot-plan-writer/assets/master-plan.template.ko.md',
      '.codex/skills/moonshot-plan-writer/assets/master-plan.template.ko.md',
    ],
  ];

  for (const group of syncedGroups) {
    assertFilesEqual(group);
  }
});

test('meta-harness behavior fixes require executable regression assets', () => {
  const maintainer = readRepoFile('skills/moonshot-relay-maintainer/SKILL.md');
  const tdd = readRepoFile('skills/test-driven-development/SKILL.md');

  assert.match(maintainer, /TDD Incident Regression Contract/);
  assert.match(maintainer, /Every harness behavior fix must follow TDD/);
  assert.match(maintainer, /authoritative recurrence guard is the executable regression/);
  assert.match(maintainer, /project-owned CLI/);
  assert.match(maintainer, /source-plan command surface/);
  assert.match(tdd, /Meta-Harness Asset Rule/);
  assert.match(tdd, /MemoryGraph may index the incident and the test path, but the test file is the source of enforcement/);
});

test('plan-writer packages cannot hide runnable readiness blockers as caveats', () => {
  const skill = readRepoFile('skills/moonshot-plan-writer/SKILL.md');
  const template = readRepoFile('skills/moonshot-plan-writer/assets/master-plan.template.md');

  assert.match(skill, /Plan Package Readiness Closeout/);
  assert.match(skill, /Do not close with a bare caveat/);
  assert.match(skill, /prep_phase_required/);
  assert.match(skill, /must not dispatch implementation phases until readiness is `prepared_now`/);
  assert.match(template, /planPackageReadiness:/);
  assert.match(template, /mode: "prepared_now \| prep_phase_required \| docs_only \| blocked"/);
});
