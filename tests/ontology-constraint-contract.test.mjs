import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';

const tempRoots = [];

after(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
});

test('ontology constraint validator accepts executable memory control-plane constraints', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'ontology-constraint-'));
  tempRoots.push(dir);
  const constraints = path.join(dir, 'constraints.jsonl');
  await writeFile(constraints, `${JSON.stringify({
    type: 'ontology_constraint',
    id: 'ONT-MEM-001',
    projectId: 'munlucky-moonshot-relay',
    status: 'verified',
    origin: 'project',
    scope: 'memory-control-plane',
    appliesTo: ['TestResult'],
    severity: 'error',
    enforcedBy: 'scripts/memory-claim-validate.mjs',
    sourceRef: 'docs/public/guidelines/memory-control-plane.md',
    supersedes: [],
  })}\n`, 'utf8');

  const result = spawnSync(process.execPath, [
    'scripts/ontology-constraint-validate.mjs',
    '--project-root',
    process.cwd(),
    '--project-constraints',
    constraints,
    '--json',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.checked, 1);
});
