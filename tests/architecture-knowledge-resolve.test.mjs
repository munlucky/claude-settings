import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

import { parseKnowledgeAnchors } from '../scripts/architecture-knowledge-resolve.mjs';

const root = process.cwd();

const writeJsonl = async (filePath, records) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`, 'utf8');
};

const runResolver = (args, options = {}) => {
  const result = spawnSync(process.execPath, ['scripts/architecture-knowledge-resolve.mjs', ...args, '--json'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...(options.env || {}) },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
};

const baseRecord = (overrides) => ({
  projectId: 'demo-project',
  createdAt: '2026-06-09T00:00:00.000Z',
  updatedAt: '2026-06-09T00:00:00.000Z',
  status: 'verified',
  supersedes: [],
  sourceRef: 'AGREEMENT.md',
  trustTier: 'verified',
  stages: ['plan', 'execute', 'verify'],
  ...overrides,
});

test('parseKnowledgeAnchors ignores fenced examples and reads top-level anchors', () => {
  const anchors = parseKnowledgeAnchors(`Before
\`\`\`yaml
knowledgeAnchors:
  - id: ignored-example
\`\`\`
knowledgeAnchors:
  - id: auth-boundary
    title: Auth Boundary
    package: .moonshot-relay/docs/agreements/auth-boundary
    startHere: AGREEMENT.md
    keywords: [auth, token]
    mustConsultFor:
      - token
      - server-only
    summary: Auth token boundary.
`);

  assert.equal(anchors.length, 1);
  assert.equal(anchors[0].id, 'auth-boundary');
  assert.deepEqual(anchors[0].keywords, ['auth', 'token']);
  assert.deepEqual(anchors[0].mustConsultFor, ['token', 'server-only']);
});

test('resolver selects objective path and stage applicable records without raw payloads', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'akcb-resolver-'));
  try {
    const projectRoot = path.join(tempRoot, 'project');
    const knowledgeRoot = path.join(tempRoot, 'knowledge');
    await mkdir(path.join(projectRoot, '.moonshot-relay', 'docs', 'agreements', 'auth-boundary'), { recursive: true });
    await writeFile(path.join(projectRoot, '.moonshot-relay', 'docs', 'agreements', 'auth-boundary', 'AGREEMENT.md'), '# Auth Boundary\n', 'utf8');
    await writeFile(path.join(projectRoot, 'AGENTS.md'), `# Demo
knowledgeAnchors:
  - id: auth-boundary
    title: Auth Boundary
    package: .moonshot-relay/docs/agreements/auth-boundary
    startHere: AGREEMENT.md
    keywords: [auth, token, bff]
    mustConsultFor:
      - token
    summary: Auth token boundary.
`, 'utf8');
    await writeFile(path.join(projectRoot, 'package.json'), '{"name":"demo-project"}\n', 'utf8');

    await writeJsonl(path.join(knowledgeRoot, 'semantic', 'verified-facts.jsonl'), [
      baseRecord({
        type: 'semantic_fact',
        id: 'fact-auth-token-boundary',
        statement: 'Auth token access must remain behind the BFF boundary.',
        sourceType: 'authoritative_doc',
        provenanceRef: 'prov-auth',
        verifiedBy: 'reviewer',
        verifiedAt: '2026-06-09T00:00:00.000Z',
      }),
      baseRecord({
        type: 'semantic_fact',
        id: 'fact-raw',
        statement: 'Unsafe fact',
        sourceType: 'authoritative_doc',
        provenanceRef: 'prov-raw',
        verifiedBy: 'reviewer',
        verifiedAt: '2026-06-09T00:00:00.000Z',
        rawMemoryGraph: { nodes: ['nope'] },
      }),
    ]);
    await writeJsonl(path.join(knowledgeRoot, 'graph', 'kg-relations.jsonl'), [
      baseRecord({
        type: 'kg_relation',
        id: 'kg-auth-applies-path',
        from: 'DECISION.auth-boundary',
        relation: 'applies_to',
        to: 'CodePath:src/app/api/auth/**',
      }),
    ]);
    await writeJsonl(path.join(knowledgeRoot, 'ontology', 'constraints.jsonl'), [
      baseRecord({
        type: 'ontology_constraint',
        id: 'constraint-no-client-token',
        scope: 'auth-boundary',
        appliesTo: ['src/app/api/auth/**'],
        severity: 'blocking',
        enforcedBy: 'lint:architecture-import-boundary',
      }),
    ]);

    const output = runResolver([
      '--cwd', projectRoot,
      '--mode', 'brownfield_codebase',
      '--stage', 'execute',
      '--objective', 'auth token refresh',
      '--changed-files-json', '["src/app/api/auth/route.ts"]',
      '--knowledge-root', knowledgeRoot,
    ]);

    assert.equal(output.artifactId, 'APPLICABLE_KNOWLEDGE_SLICE');
    assert.equal(output.status, 'ready');
    assert.equal(output.selected.semanticFacts.some((fact) => fact.id === 'fact-auth-token-boundary'), true);
    assert.equal(output.selected.kgRelations.some((relation) => relation.id === 'kg-auth-applies-path'), true);
    assert.equal(output.selected.ontologyConstraints.some((constraint) => constraint.id === 'constraint-no-client-token'), true);
    assert.equal(output.selected.knowledgeAnchors[0].status, 'consulted');
    assert.equal(JSON.stringify(output).includes('rawMemoryGraph'), false);
    assert.equal(output.skipped.some((record) => record.id === 'fact-raw' && /unsafe/.test(record.reason)), true);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test('resolver degrades without configured knowledge records', () => {
  const output = runResolver([
    '--cwd', root,
    '--mode', 'brownfield_codebase',
    '--stage', 'execute',
    '--objective', 'missing records',
    '--knowledge-root', path.join(os.tmpdir(), 'missing-akcb-knowledge-root'),
  ]);

  assert.equal(output.status, 'degraded');
  assert.equal(output.metadata.unavailableCount, 1);
  assert.equal(output.blocking, false);
  assert.ok(output.warnings.some((warning) => warning.code === 'knowledge_not_configured'));
});
