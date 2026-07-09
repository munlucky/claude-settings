import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';

import {
  appendMemoryClaimDecision,
  normalizeMemoryClaim,
} from '../scripts/lib/memory-claim-ledger.mjs';
import {
  buildMemoryGateResult,
  validateEpisodeLedgerRecord,
  validateMemoryClaim,
} from '../scripts/lib/memory-control-plane-contracts.mjs';

const tempRoots = [];

after(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
});

const verifiedClaim = () => normalizeMemoryClaim({
  claimId: 'claim:pytest-fixture',
  status: 'verified',
  scope: 'project',
  stage: 'execute',
  claim: 'pytest fixture setup failed before command evidence was refreshed',
  confidence: 'verified',
  sensitivity: 'internal',
  validity: {
    validFrom: '2026-07-09T00:00:00.000Z',
    validTo: null,
    supersedes: [],
  },
  provenance: {
    sourceRef: 'artifacts/logs/pytest.log',
    sourceCommand: 'node --test tests/memory-claim-ledger-contract.test.mjs',
    artifactSha256: '0'.repeat(64),
  },
  evidence: [
    { type: 'CommandRun', ref: 'cmd:pytest' },
    { type: 'TestResult', ref: 'test:memory-claim' },
  ],
});

test('verified memory claim requires evidence and provenance', () => {
  const accepted = validateMemoryClaim(verifiedClaim());
  assert.equal(accepted.ok, true);

  const rejected = validateMemoryClaim({
    ...verifiedClaim(),
    evidence: [],
  });
  assert.equal(rejected.ok, false);
  assert.ok(rejected.violations.includes('candidate or verified memory claim requires evidence'));
});

test('candidate memory claim requires evidence and artifact before durable use', () => {
  const rejected = validateMemoryClaim({
    ...verifiedClaim(),
    status: 'candidate',
    confidence: 'candidate',
    evidence: [],
    provenance: {
      sourceRef: 'artifacts/logs/pytest.log',
      sourceCommand: 'node --test tests/memory-claim-ledger-contract.test.mjs',
      artifactSha256: '',
    },
  });

  assert.equal(rejected.ok, false);
  assert.ok(rejected.violations.includes('candidate or verified memory claim requires evidence'));
  assert.ok(rejected.violations.includes('candidate or verified memory claim requires artifactSha256'));
});

test('secret-like or raw graph memory cannot become a claim', () => {
  const rejected = validateMemoryClaim({
    ...verifiedClaim(),
    claimId: 'claim:raw-graph',
    claim: '{"nodes":[],"relationships":[]}',
  });

  assert.equal(rejected.ok, false);
  assert.ok(rejected.violations.includes('secret-like or raw memory text cannot become a memory claim'));
});

test('episode ledger separates prompt-safe summaries from raw generated state', () => {
  const unsafe = validateEpisodeLedgerRecord({
    schemaVersion: 1,
    episodeId: 'episode:1',
    runId: 'run:1',
    stage: 'execute',
    eventType: 'command_run',
    timestamp: '2026-07-09T00:00:00.000Z',
    sourceRef: 'runtime/logs/raw.log',
    rawRef: 'runtime/logs/raw.log',
    summary: 'contains sk-secret-token',
    promptSafe: true,
    omittedReasons: [],
  });

  assert.equal(unsafe.ok, false);
  assert.ok(unsafe.violations.includes('prompt-safe episode projection contains unsafe raw content'));

  const rawOnly = validateEpisodeLedgerRecord({
    schemaVersion: 1,
    episodeId: 'episode:2',
    runId: 'run:1',
    stage: 'execute',
    eventType: 'command_run',
    timestamp: '2026-07-09T00:00:00.000Z',
    sourceRef: 'runtime/logs/raw.log',
    rawRef: 'runtime/logs/raw.log',
    summary: '',
    promptSafe: false,
    omittedReasons: ['raw-log'],
  });
  assert.equal(rawOnly.ok, true);
});

test('claim ledger records rejected decisions without mutating runtime state', () => {
  const ledger = appendMemoryClaimDecision([], {
    claimId: 'claim:no-evidence',
    status: 'verified',
    scope: 'project',
    stage: 'execute',
    claim: 'missing evidence',
    confidence: 'verified',
    sensitivity: 'internal',
    validity: { validFrom: '2026-07-09T00:00:00.000Z', validTo: null, supersedes: [] },
    provenance: { sourceRef: '', sourceCommand: '', artifactSha256: '' },
    evidence: [],
  });

  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].status, 'rejected');
  assert.ok(ledger[0].violations.includes('memory claim requires sourceRef or sourceCommand'));
});

test('memory gate fails stale and candidate-as-fact violations', () => {
  const gate = buildMemoryGateResult({
    claims: [
      verifiedClaim(),
      {
        ...normalizeMemoryClaim({
          claimId: 'claim:candidate',
          claim: 'candidate rendered unsafely',
          validity: { validFrom: '2026-07-09T00:00:00.000Z', validTo: null, supersedes: [] },
          provenance: { sourceRef: 'review.md', sourceCommand: '', artifactSha256: '' },
          evidence: [],
        }),
        renderedAsSemanticFact: true,
      },
    ],
  });

  assert.equal(gate.status, 'failed');
  assert.equal(gate.candidateAsFactViolations, 1);
});

test('memory claim validator CLI reports failed validation', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'memory-claim-cli-'));
  tempRoots.push(dir);
  const file = path.join(dir, 'claim.json');
  await writeFile(file, JSON.stringify({ ...verifiedClaim(), evidence: [] }), 'utf8');

  const result = spawnSync(process.execPath, [
    'scripts/memory-claim-validate.mjs',
    '--type',
    'claim',
    '--file',
    file,
    '--json',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(result.status, 2);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, 'failed');
  assert.ok(payload.violations.includes('candidate or verified memory claim requires evidence'));
});
