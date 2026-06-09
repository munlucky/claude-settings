import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

import { bindArchitectureContract } from '../scripts/architecture-contract-bind.mjs';

const root = process.cwd();

const baseSlice = (overrides = {}) => ({
  schemaVersion: 1,
  artifactId: 'APPLICABLE_KNOWLEDGE_SLICE',
  owner: 'moonshot-architecture',
  mode: 'brownfield_codebase',
  stage: 'execute',
  status: 'ready',
  selected: {
    policyAnchors: [],
    semanticFacts: [
      {
        id: 'REQ.auth-boundary',
        type: 'semantic_fact',
        summary: 'Auth token must remain behind BFF boundary.',
        sourceRef: 'AGREEMENT.md',
        trustTier: 'verified',
        status: 'verified',
      },
    ],
    kgRelations: [
      {
        id: 'kg-decision',
        type: 'kg_relation',
        summary: 'Auth boundary applies to API route.',
        sourceRef: 'ADR-0001.md',
        trustTier: 'verified',
        status: 'verified',
        from: 'DECISION.auth-boundary',
        relation: 'applies_to',
        to: 'CodePath:src/app/api/auth/**',
      },
      {
        id: 'kg-owned',
        type: 'kg_relation',
        summary: 'Own API route.',
        sourceRef: 'ADR-0001.md',
        trustTier: 'verified',
        status: 'verified',
        from: 'DECISION.auth-boundary',
        relation: 'owns_path',
        to: 'CodePath:src/app/api/auth/**',
      },
      {
        id: 'kg-verify',
        type: 'kg_relation',
        summary: 'Auth tests verify boundary.',
        sourceRef: 'ADR-0001.md',
        trustTier: 'verified',
        status: 'verified',
        from: 'DECISION.auth-boundary',
        relation: 'verified_by',
        to: 'VerificationSignal:npm run test:auth',
      },
    ],
    ontologyConstraints: [
      {
        id: 'constraint-no-client-token',
        type: 'ontology_constraint',
        summary: 'No client token access.',
        sourceRef: 'ADR-0001.md',
        trustTier: 'verified',
        status: 'verified',
        severity: 'blocking',
        appliesTo: ['src/app/api/auth/**'],
        enforcedBy: 'lint:architecture-import-boundary',
      },
    ],
    knowledgeAnchors: [],
  },
  skipped: [],
  blocking: false,
  warnings: [],
  errors: [],
  ...overrides,
});

test('contract binder maps selected knowledge into contract slice', () => {
  const result = bindArchitectureContract(baseSlice(), { artifactDir: 'docs/architecture' });

  assert.equal(result.artifactId, 'ARCHITECTURE_CONTRACT_SLICE');
  assert.equal(result.status, 'ready');
  assert.equal(result.requirements.length, 1);
  assert.equal(result.decisions.some((decision) => decision.id === 'DECISION.auth-boundary'), true);
  assert.equal(result.constraints[0].id, 'constraint-no-client-token');
  assert.equal(result.enforcementRules[0].id, 'lint:architecture-import-boundary');
  assert.equal(result.verificationSignals[0].commandOrEvidence, 'npm run test:auth');
  assert.deepEqual(result.pathBoundaries.ownedPaths, ['src/app/api/auth/**']);
  assert.equal(result.handoffRecommendation.target, 'moonshot-orchestrator');
});

test('contract binder blocks missing enforcement for blocking constraints', () => {
  const slice = baseSlice();
  slice.selected.ontologyConstraints[0].enforcedBy = '';
  const result = bindArchitectureContract(slice, { artifactDir: 'docs/architecture' });

  assert.equal(result.status, 'blocked');
  assert.ok(result.errors.some((error) => error.code === 'blocking_constraint_without_enforcement'));
});

test('contract binder blocks missing verification signal', () => {
  const slice = baseSlice();
  slice.selected.kgRelations = slice.selected.kgRelations.filter((relation) => relation.relation !== 'verified_by');
  const result = bindArchitectureContract(slice, { artifactDir: 'docs/architecture' });

  assert.equal(result.status, 'blocked');
  assert.ok(result.errors.some((error) => error.code === 'missing_verification_signal'));
});

test('contract binder blocks owned read-only path overlap', () => {
  const slice = baseSlice();
  slice.selected.kgRelations.push({
    id: 'kg-readonly',
    type: 'kg_relation',
    summary: 'Read-only API route.',
    sourceRef: 'ADR-0001.md',
    trustTier: 'verified',
    status: 'verified',
    from: 'DECISION.auth-boundary',
    relation: 'read_only_path',
    to: 'CodePath:src/app/api/auth/**',
  });
  const result = bindArchitectureContract(slice, { artifactDir: 'docs/architecture' });

  assert.equal(result.status, 'blocked');
  assert.ok(result.errors.some((error) => error.code === 'path_boundary_overlap'));
});

test('contract binder omits unsafe raw payloads by blocking output', () => {
  const slice = baseSlice({ rawGraph: { nodes: ['no'] } });
  const result = bindArchitectureContract(slice, { artifactDir: 'docs/architecture' });

  assert.equal(result.status, 'blocked');
  assert.ok(result.errors.some((error) => error.code === 'unsafe_raw_payload'));
  assert.equal(JSON.stringify(result).includes('rawGraph'), false);
});

test('contract bind CLI reads knowledge slice file', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'akcb-binder-'));
  try {
    const slicePath = path.join(tempRoot, 'ARCHITECTURE_KNOWLEDGE_SLICE.json');
    await mkdir(tempRoot, { recursive: true });
    await writeFile(slicePath, JSON.stringify(baseSlice(), null, 2), 'utf8');
    const result = spawnSync(process.execPath, [
      'scripts/architecture-contract-bind.mjs',
      '--knowledge-slice',
      slicePath,
      '--artifact-dir',
      tempRoot,
      '--json',
    ], {
      cwd: root,
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, 'ready');
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});
