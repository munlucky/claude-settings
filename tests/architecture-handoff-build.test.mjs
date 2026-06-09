import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

import { buildArchitectureHandoff } from '../scripts/architecture-handoff-build.mjs';

const root = process.cwd();

const readyContract = (overrides = {}) => ({
  schemaVersion: 1,
  artifactId: 'ARCHITECTURE_CONTRACT_SLICE',
  owner: 'moonshot-architecture',
  status: 'ready',
  sourceKnowledgeSliceRef: 'ARCHITECTURE_KNOWLEDGE_SLICE.json',
  requirements: [],
  asrs: [],
  decisions: [
    { id: 'DECISION.auth-boundary', summary: 'Keep auth behind BFF.', sourceRef: 'ADR/ADR-0001.md', derivedFrom: ['kg-decision'] },
  ],
  constraints: [
    {
      id: 'constraint-no-client-token',
      summary: 'No client token access.',
      sourceRef: 'ADR/ADR-0001.md',
      derivedFrom: ['constraint-no-client-token'],
      severity: 'blocking',
      appliesTo: ['src/app/api/auth/**'],
      enforcedBy: ['lint:architecture-import-boundary'],
    },
  ],
  enforcementRules: [],
  verificationSignals: [
    { id: 'VerificationSignal:npm run test:auth', summary: 'Auth test', commandOrEvidence: 'npm run test:auth', sourceRef: 'ADR/ADR-0001.md' },
  ],
  pathBoundaries: {
    ownedPaths: ['src/app/api/auth/**'],
    readOnlyPaths: ['src/server/auth/**'],
    stagedPaths: [],
  },
  handoffRecommendation: { target: 'moonshot-orchestrator', reason: 'bounded change', blocking: false },
  warnings: [],
  errors: [],
  ...overrides,
});

test('handoff builder creates compact ready handoff prompt', () => {
  const handoff = buildArchitectureHandoff(readyContract(), { sourceContractRef: 'ARCHITECTURE_CONTRACT_SLICE.json' });

  assert.equal(handoff.artifactId, 'ARCHITECTURE_HANDOFF');
  assert.equal(handoff.status, 'ready');
  assert.equal(handoff.blocking, false);
  assert.equal(handoff.handoffTarget, 'moonshot-orchestrator');
  assert.ok(handoff.promptBlock.includes('DECISION.auth-boundary'));
  assert.ok(handoff.promptBlock.includes('constraint-no-client-token'));
  assert.deepEqual(handoff.metadata.ownedPaths, ['src/app/api/auth/**']);
  assert.ok(handoff.readBeforeRetry.includes('ADR/ADR-0001.md'));
});

test('handoff builder blocks blocked contract dispatch', () => {
  const handoff = buildArchitectureHandoff(readyContract({
    status: 'blocked',
    handoffRecommendation: { target: 'none', reason: 'blocked', blocking: true },
    errors: [{ code: 'missing_verification_signal', message: 'missing', severity: 'blocking' }],
  }));

  assert.equal(handoff.status, 'blocked');
  assert.equal(handoff.blocking, true);
  assert.equal(handoff.handoffTarget, 'none');
});

test('handoff builder omits unsafe raw payloads from output', () => {
  const handoff = buildArchitectureHandoff(readyContract({ rawOntology: { records: ['no'] } }));

  assert.equal(handoff.status, 'blocked');
  assert.equal(JSON.stringify(handoff).includes('rawOntology'), false);
  assert.ok(handoff.errors.some((error) => error.code === 'unsafe_raw_payload'));
});

test('handoff build CLI reads contract slice file', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'akcb-handoff-'));
  try {
    const contractPath = path.join(tempRoot, 'ARCHITECTURE_CONTRACT_SLICE.json');
    await writeFile(contractPath, JSON.stringify(readyContract(), null, 2), 'utf8');
    const result = spawnSync(process.execPath, [
      'scripts/architecture-handoff-build.mjs',
      '--contract-slice',
      contractPath,
      '--json',
    ], {
      cwd: root,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, 'ready');
    assert.equal(output.sourceContractRef, contractPath);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
