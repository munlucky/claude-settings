import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { bindArchitectureContract } from '../scripts/architecture-contract-bind.mjs';
import { renderArchitectureFeedback, renderTextFeedback } from '../scripts/architecture-feedback-render.mjs';
import { buildArchitectureHandoff } from '../scripts/architecture-handoff-build.mjs';
import { buildApplicableKnowledgeSlice } from '../scripts/architecture-knowledge-resolve.mjs';

const writeJsonl = async (filePath, records) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`, 'utf8');
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const baseRecord = (overrides) => ({
  projectId: 'demo-contract-binding-flow',
  createdAt: '2026-06-09T00:00:00.000Z',
  updatedAt: '2026-06-09T00:00:00.000Z',
  sourceRef: 'AGREEMENT.md',
  trustTier: 'verified',
  status: 'verified',
  stages: ['plan', 'execute', 'verify'],
  ...overrides,
});

const createKnowledgeFixture = async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'akcb-flow-'));
  const projectRoot = path.join(tempRoot, 'project');
  const knowledgeRoot = path.join(tempRoot, 'knowledge');
  const agreementRoot = path.join(projectRoot, '.moonshot-relay', 'docs', 'agreements', 'auth-boundary');

  await mkdir(agreementRoot, { recursive: true });
  await writeFile(path.join(projectRoot, 'package.json'), '{"name":"demo-contract-binding-flow"}\n', 'utf8');
  await writeFile(path.join(agreementRoot, 'AGREEMENT.md'), '# Auth Boundary\n', 'utf8');
  await writeFile(path.join(projectRoot, 'AGENTS.md'), `# Demo
knowledgeAnchors:
  - id: auth-boundary
    title: Auth Boundary
    package: .moonshot-relay/docs/agreements/auth-boundary
    startHere: AGREEMENT.md
    keywords: [auth, token, bff]
    mustConsultFor:
      - architecture auth token boundary
    summary: Auth token boundary must be server-owned.
`, 'utf8');

  await writeJsonl(path.join(knowledgeRoot, 'semantic', 'verified-facts.jsonl'), [
    baseRecord({
      type: 'semantic_fact',
      id: 'REQ.auth-token-boundary',
      statement: 'Auth token access must stay behind the server BFF boundary.',
      sourceType: 'authoritative_doc',
      provenanceRef: 'prov-auth-token-boundary',
      verifiedBy: 'architecture-reviewer',
      verifiedAt: '2026-06-09T00:00:00.000Z',
    }),
    baseRecord({
      type: 'semantic_fact',
      id: 'REQ.raw-omitted',
      statement: 'This raw payload must never reach prompt artifacts.',
      sourceType: 'authoritative_doc',
      provenanceRef: 'prov-raw',
      verifiedBy: 'architecture-reviewer',
      verifiedAt: '2026-06-09T00:00:00.000Z',
      rawGraph: { nodes: ['unsafe'] },
    }),
  ]);
  await writeJsonl(path.join(knowledgeRoot, 'graph', 'kg-relations.jsonl'), [
    baseRecord({
      type: 'kg_relation',
      id: 'KG.decision-applies',
      from: 'DECISION.auth-boundary',
      relation: 'applies_to',
      to: 'CodePath:src/app/api/auth/**',
    }),
    baseRecord({
      type: 'kg_relation',
      id: 'KG.staged-path',
      from: 'DECISION.auth-boundary',
      relation: 'staged_path',
      to: 'CodePath:src/app/api/auth/**',
    }),
    baseRecord({
      type: 'kg_relation',
      id: 'KG.verified-by',
      from: 'DECISION.auth-boundary',
      relation: 'verified_by',
      to: 'VerificationSignal:npm run test:auth',
    }),
  ]);
  await writeJsonl(path.join(knowledgeRoot, 'ontology', 'constraints.jsonl'), [
    baseRecord({
      type: 'ontology_constraint',
      id: 'CONSTRAINT.no-client-token',
      scope: 'auth token boundary',
      appliesTo: ['src/app/api/auth/**'],
      severity: 'blocking',
      enforcedBy: 'lint:architecture-import-boundary',
    }),
  ]);

  return { tempRoot, projectRoot, knowledgeRoot };
};

test('architecture knowledge contract binding produces ready handoff and feedback loop artifacts', async () => {
  const fixture = await createKnowledgeFixture();
  try {
    const knowledgeSlice = await buildApplicableKnowledgeSlice({
      cwd: fixture.projectRoot,
      mode: 'brownfield_codebase',
      stage: 'execute',
      objective: 'architecture auth token boundary implementation',
      changedFiles: ['src/app/api/auth/route.ts'],
      knowledgeRoot: fixture.knowledgeRoot,
    });

    assert.equal(knowledgeSlice.status, 'ready');
    assert.equal(knowledgeSlice.selected.semanticFacts.some((fact) => fact.id === 'REQ.auth-token-boundary'), true);
    assert.equal(knowledgeSlice.skipped.some((record) => record.id === 'REQ.raw-omitted'), true);
    assert.equal(JSON.stringify(knowledgeSlice).includes('rawGraph'), false);

    const contract = bindArchitectureContract(knowledgeSlice, {
      artifactDir: path.join(fixture.projectRoot, 'docs', 'architecture'),
      knowledgeSliceRef: 'ARCHITECTURE_KNOWLEDGE_SLICE.json',
    });

    assert.equal(contract.status, 'ready');
    assert.equal(contract.handoffRecommendation.target, 'moonshot-phase-runner');
    assert.deepEqual(contract.pathBoundaries.stagedPaths, ['src/app/api/auth/**']);
    assert.equal(contract.verificationSignals[0].commandOrEvidence, 'npm run test:auth');

    const handoff = buildArchitectureHandoff(contract, {
      sourceContractRef: 'ARCHITECTURE_CONTRACT_SLICE.json',
    });

    assert.equal(handoff.status, 'ready');
    assert.equal(handoff.blocking, false);
    assert.equal(handoff.handoffTarget, 'moonshot-phase-runner');
    assert.match(handoff.promptBlock, /Architecture Handoff Context/);
    assert.doesNotMatch(handoff.promptBlock, /rawGraph|nodes/);
    assert.deepEqual(handoff.metadata.verificationSignalIds, ['VerificationSignal:npm run test:auth']);

    const feedback = renderArchitectureFeedback({
      contract,
      handoff,
      violation: {
        constraintId: 'CONSTRAINT.no-client-token',
        sourceRef: 'src/app/page.tsx',
        summary: 'Client component attempted token access.',
        requiredActions: ['Move token access back behind the server BFF boundary.'],
      },
      refs: {
        contractSlice: 'ARCHITECTURE_CONTRACT_SLICE.json',
        handoff: 'ARCHITECTURE_HANDOFF.json',
      },
    });
    const textFeedback = renderTextFeedback(feedback);

    assert.equal(feedback.status, 'ready');
    assert.match(textFeedback, /ARCHITECTURE_CONTRACT_FAILED/);
    assert.match(textFeedback, /CONSTRAINT\.no-client-token/);
    assert.match(textFeedback, /npm run test:auth/);
  } finally {
    await rm(fixture.tempRoot, { recursive: true, force: true });
  }
});

test('architecture contract binding blocks unsafe or unenforceable handoffs', async () => {
  const fixture = await createKnowledgeFixture();
  try {
    const knowledgeSlice = await buildApplicableKnowledgeSlice({
      cwd: fixture.projectRoot,
      mode: 'brownfield_codebase',
      stage: 'execute',
      objective: 'architecture auth token boundary implementation',
      changedFiles: ['src/app/api/auth/route.ts'],
      knowledgeRoot: fixture.knowledgeRoot,
    });

    const unenforced = clone(knowledgeSlice);
    unenforced.selected.ontologyConstraints[0].enforcedBy = '';
    const unenforcedContract = bindArchitectureContract(unenforced, { artifactDir: fixture.projectRoot });
    const unenforcedHandoff = buildArchitectureHandoff(unenforcedContract);
    assert.equal(unenforcedContract.status, 'blocked');
    assert.ok(unenforcedContract.errors.some((error) => error.code === 'blocking_constraint_without_enforcement'));
    assert.equal(unenforcedHandoff.status, 'blocked');
    assert.equal(unenforcedHandoff.handoffTarget, 'none');

    const unverified = clone(knowledgeSlice);
    unverified.selected.kgRelations = unverified.selected.kgRelations.filter((relation) => relation.relation !== 'verified_by');
    const unverifiedContract = bindArchitectureContract(unverified, { artifactDir: fixture.projectRoot });
    assert.equal(unverifiedContract.status, 'blocked');
    assert.ok(unverifiedContract.errors.some((error) => error.code === 'missing_verification_signal'));

    const unsafe = clone(knowledgeSlice);
    unsafe.rawMemoryGraph = { nodes: ['unsafe'] };
    const unsafeContract = bindArchitectureContract(unsafe, { artifactDir: fixture.projectRoot });
    assert.equal(unsafeContract.status, 'blocked');
    assert.ok(unsafeContract.errors.some((error) => error.code === 'unsafe_raw_payload'));
    assert.equal(JSON.stringify(unsafeContract).includes('rawMemoryGraph'), false);
  } finally {
    await rm(fixture.tempRoot, { recursive: true, force: true });
  }
});
