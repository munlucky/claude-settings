import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';

import {
  assertEvidenceCurrent,
  classifyAmbiguity,
  createSpecRevision,
  invalidatesForChange,
} from '../scripts/lib/contract-invalidation.mjs';

const tempRoots = [];

after(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
});

const clearContract = () => ({
  schemaVersion: 1,
  contractId: 'EDAH-P03',
  revision: 1,
  frozen: true,
  changeType: 'spec',
  revisionReason: 'freeze initial contract',
  requirements: [{ id: 'REQ-1', summary: 'require contract revision' }],
  acceptanceCriteria: [{ id: 'AC-1', summary: 'tests pass', verification: 'node --test tests/contract-engine-contract.test.mjs', covered: true }],
  constraints: [{ id: 'CON-1', summary: 'no silent overwrite', status: 'resolved' }],
});

test('contract engine classifies ambiguity from typed contract fields', () => {
  assert.equal(classifyAmbiguity(clearContract()).status, 'clear');
  const ambiguous = classifyAmbiguity({
    ...clearContract(),
    acceptanceCriteria: [{ id: 'AC-2', summary: 'missing verification', verification: '', covered: false }],
    constraints: [{ id: 'CON-2', summary: 'unresolved path owner', status: 'unresolved' }],
  });

  assert.equal(ambiguous.status, 'ambiguous');
  assert.deepEqual(ambiguous.blockers.map((item) => item.type), ['unresolved_constraint', 'uncovered_acceptance']);
});

test('frozen contract changes require explicit revision reason', () => {
  const previousRevision = createSpecRevision({
    nextContract: clearContract(),
    reason: 'initial',
  });

  assert.throws(() => createSpecRevision({
    previousRevision,
    nextContract: { ...clearContract(), requirements: [{ id: 'REQ-2', summary: 'changed' }] },
  }), /explicit revision reason/);

  const next = createSpecRevision({
    previousRevision,
    nextContract: { ...clearContract(), requirements: [{ id: 'REQ-2', summary: 'changed' }] },
    reason: 'scope changed',
  });
  assert.equal(next.revision, previousRevision.revision + 1);
  assert.deepEqual(next.invalidates, ['plan', 'run', 'review', 'verify', 'score', 'submission']);
});

test('invalidation matrix covers source lockfile and policy changes', () => {
  assert.deepEqual(invalidatesForChange('source'), ['review', 'verify', 'score', 'submission']);
  assert.deepEqual(invalidatesForChange('lockfile'), ['environment', 'verify', 'score', 'submission']);
  assert.deepEqual(invalidatesForChange('policy'), ['score', 'submission']);
});

test('forward state movement rejects stale evidence without matching waiver', () => {
  assert.equal(assertEvidenceCurrent({ evidenceRevision: 2, activeRevision: 2 }), true);
  assert.throws(() => assertEvidenceCurrent({ evidenceRevision: 1, activeRevision: 2 }), /stale evidence revision/);
  assert.equal(assertEvidenceCurrent({
    evidenceRevision: 1,
    activeRevision: 2,
    waiver: { approved: true, activeRevision: 2 },
  }), true);
});

test('contract engine CLI validates clear JSON contract', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-contract-engine-'));
  tempRoots.push(tempRoot);
  const contractPath = path.join(tempRoot, 'contract.json');
  await writeFile(contractPath, JSON.stringify(clearContract(), null, 2));

  const result = spawnSync(process.execPath, ['scripts/contract-engine.mjs', 'validate', '--contract', contractPath, '--json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, 'pass');
  assert.equal(payload.ambiguity.status, 'clear');
});
