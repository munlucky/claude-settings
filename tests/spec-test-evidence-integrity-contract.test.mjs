import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, test } from 'node:test';

const root = process.cwd();
const fixtureRoot = path.join(root, 'tests', 'fixtures', 'spec-test-obligations', 'valid-mixed');
const temporaryRoots = [];
const closeoutFiles = [
  'SPRINT_CONTRACT.md',
  'QA_REPORT.md',
  'REQUIREMENTS_TRACEABILITY.md',
  'SCENARIO_MATRIX.md',
  'SCORECARD.md',
];
const evidenceFiles = [
  'required-marker.json',
  '.moonshot-relay/evidence/req-001-red.json',
  '.moonshot-relay/evidence/req-001-green.json',
  '.moonshot-relay/evidence/legacy-pin.json',
  '.moonshot-relay/evidence/scn-001.json',
  '.moonshot-relay/evidence/uat-critical.json',
];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((target) => rm(target, { recursive: true, force: true })));
});

const canonicalJson = (value) => {
  if (Array.isArray(value)) return value.map(canonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalJson(value[key])]));
  }
  return value;
};

const contentHash = (payload) => createHash('sha256')
  .update(JSON.stringify(canonicalJson(payload)))
  .digest('hex');

const prepareCandidate = async () => {
  const candidate = await mkdtemp(path.join(os.tmpdir(), 'moonshot-spec-evidence-'));
  temporaryRoots.push(candidate);
  for (const file of closeoutFiles) {
    await copyFile(path.join(fixtureRoot, file), path.join(candidate, file));
  }
  for (const file of evidenceFiles) {
    const target = path.join(candidate, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, '{"status":"pass"}\n', 'utf8');
  }
  return candidate;
};

const validatorArgs = (candidate, extra = []) => [
  'scripts/spec-test-obligations.mjs',
  'validate',
  '--sprint-contract', path.join(candidate, 'SPRINT_CONTRACT.md'),
  '--qa-report', path.join(candidate, 'QA_REPORT.md'),
  '--requirements-traceability', path.join(candidate, 'REQUIREMENTS_TRACEABILITY.md'),
  '--scenario-matrix', path.join(candidate, 'SCENARIO_MATRIX.md'),
  '--scorecard', path.join(candidate, 'SCORECARD.md'),
  '--evidence-root', candidate,
  '--require-fixed-evidence',
  '--required-evidence', 'required-marker.json',
  '--json',
  ...extra,
];

const runValidator = (candidate, extra = []) => spawnSync(process.execPath, validatorArgs(candidate, extra), {
  cwd: root,
  encoding: 'utf8',
});

test('fixed evidence creates one immutable result with a reproducible content hash', async () => {
  const candidate = await prepareCandidate();
  const output = path.join(candidate, 'spec-test-result.json');
  const args = ['--atomic-create', '--require-output-absent', '--out', output];

  const first = runValidator(candidate, args);
  assert.equal(first.status, 0, first.stderr || first.stdout);
  const payload = JSON.parse(first.stdout);
  const written = JSON.parse(await readFile(output, 'utf8'));
  assert.deepEqual(written, payload);
  assert.match(payload.contentSha256, /^[a-f0-9]{64}$/);
  const { contentSha256, ...hashInput } = payload;
  assert.equal(contentSha256, contentHash(hashInput));

  const second = runValidator(candidate, args);
  assert.equal(second.status, 2, second.stdout || second.stderr);
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), payload);
});

test('fixed evidence rejects paths outside the canonical evidence root', async () => {
  const candidate = await prepareCandidate();
  const outside = path.join(path.dirname(candidate), `${path.basename(candidate)}-outside.json`);
  temporaryRoots.push(outside);
  await writeFile(outside, '{"status":"pass"}\n', 'utf8');

  const result = spawnSync(process.execPath, validatorArgs(candidate, [
    '--required-evidence', outside,
  ]), { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.ok(payload.findings.some((entry) => (
    entry.class === 'spec_test_obligation_result_missing'
    && entry.message.includes('escapes canonical evidence root')
  )));
});

test('output cannot alias or overwrite a closeout input', async () => {
  const candidate = await prepareCandidate();
  const sprintContract = path.join(candidate, 'SPRINT_CONTRACT.md');
  const before = await readFile(sprintContract, 'utf8');
  const result = runValidator(candidate, [
    '--atomic-create',
    '--require-output-absent',
    '--out', sprintContract,
  ]);

  assert.equal(result.status, 2, result.stdout || result.stderr);
  assert.match(result.stderr, /aliases an input document or evidence file/);
  assert.equal(await readFile(sprintContract, 'utf8'), before);
});
