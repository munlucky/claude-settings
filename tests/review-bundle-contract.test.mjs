import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';

import { sha256Hex } from '../scripts/lib/candidate-identity.mjs';
import { buildReviewBundle } from '../scripts/lib/review-bundle.mjs';

const tempRoots = [];

after(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
});

const input = () => ({
  candidate_id: `cand_${'a'.repeat(32)}`,
  sourceDigest: sha256Hex('source'),
  contractRevision: 3,
  freshSessionId: 'fresh-review-session-1',
  spec: { id: 'spec' },
  plan: { id: 'plan' },
  done: { id: 'done' },
  diff: { files: ['a.js'] },
  testResults: { status: 'passed' },
});

test('review bundle includes only fresh review input surface and digest', () => {
  const bundle = buildReviewBundle(input());

  assert.equal(bundle.artifactId, 'REVIEW_BUNDLE');
  assert.equal(bundle.candidate_id, input().candidate_id);
  assert.equal(bundle.freshSessionId, 'fresh-review-session-1');
  assert.match(bundle.bundleDigest, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(bundle.input).sort(), ['diff', 'done', 'plan', 'spec', 'testResults']);
});

test('review bundle rejects implementation transcript hidden reasoning and self evaluation', () => {
  assert.throws(() => buildReviewBundle({
    ...input(),
    spec: { implementationTranscript: 'do not leak' },
  }), /forbidden context/);
  assert.throws(() => buildReviewBundle({
    ...input(),
    plan: { nested: { hiddenReasoning: 'do not leak' } },
  }), /forbidden context/);
  assert.throws(() => buildReviewBundle({
    ...input(),
    testResults: { selfEvaluation: 'looks good' },
  }), /forbidden context/);
});

test('review bundle CLI emits JSON digest', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-review-bundle-'));
  tempRoots.push(tempRoot);
  const inputPath = path.join(tempRoot, 'input.json');
  await writeFile(inputPath, JSON.stringify(input(), null, 2));

  const result = spawnSync(process.execPath, ['scripts/review-bundle-build.mjs', '--input', inputPath, '--json'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.match(payload.bundleDigest, /^[a-f0-9]{64}$/);
});
