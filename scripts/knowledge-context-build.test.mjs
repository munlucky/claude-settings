import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildProjectKnowledgeContext } from './knowledge-context-build.mjs';

const NOW = '2026-05-29T00:00:00Z';

function mkdirp(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function write(filePath, text) {
  mkdirp(path.dirname(filePath));
  fs.writeFileSync(filePath, text);
}

function jsonl(records) {
  return `${records.map((record) => JSON.stringify(record)).join('\n')}\n`;
}

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'knowledge-context-'));
  const repo = path.join(root, 'repo');
  const state = path.join(root, 'state');
  mkdirp(path.join(repo, '.claude'));
  write(path.join(repo, '.claude', 'project.identity.yaml'), 'projectId: demo-project\naliases: []\n');
  write(path.join(repo, '.claude', 'knowledge.contract.yaml'), [
    'projectId: demo-project',
    'promptMode: compact-summary',
    'stateRoot: account-root',
    'maxPromptTokens: 900',
    'strictness: advisory',
    'staleAfterDays: 7',
    '',
  ].join('\n'));
  return { root, repo, state, env: { ...process.env, CODEX_STATE_ROOT: state } };
}

function base(type, id, extra = {}) {
  return {
    type,
    id,
    projectId: 'demo-project',
    status: 'verified',
    createdAt: NOW,
    updatedAt: NOW,
    supersedes: [],
    ...extra,
  };
}

function seedKnowledge(fixture, extra = {}) {
  const knowledgeRoot = path.join(fixture.state, 'projects', 'demo-project', 'knowledge');
  write(path.join(knowledgeRoot, 'revision.json'), JSON.stringify({ revision: extra.revision || 'rev-1', updatedAt: extra.updatedAt || NOW }));
  write(path.join(knowledgeRoot, 'policy', 'policy-anchors.jsonl'), jsonl([
    base('policy_anchor', 'policy-safe', {
      text: 'Use project-scoped knowledge summaries only.',
      sourceRef: 'policy/policy-anchors.jsonl',
      trustTier: 'authoritative',
      verifiedAt: NOW,
      stages: ['intake'],
    }),
  ]));
  write(path.join(knowledgeRoot, 'semantic', 'verified-facts.jsonl'), jsonl([
    base('semantic_fact', 'fact-plan', {
      statement: 'The plan stage should prioritize verified semantic decisions.',
      sourceType: 'authoritative_doc',
      sourceRef: 'semantic/verified-facts.jsonl',
      trustTier: 'verified',
      provenanceRef: 'prov-plan',
      verifiedBy: 'test',
      verifiedAt: NOW,
      stages: ['plan'],
    }),
    base('semantic_fact', 'fact-finish', {
      statement: 'The finish stage should keep closeout evidence compact.',
      sourceType: 'authoritative_doc',
      sourceRef: 'semantic/verified-facts.jsonl',
      trustTier: 'verified',
      provenanceRef: 'prov-finish',
      verifiedBy: 'test',
      verifiedAt: NOW,
      stages: ['finish'],
    }),
  ]));
  write(path.join(knowledgeRoot, 'graph', 'kg-relations.jsonl'), jsonl([
    base('kg_relation', 'kg-execute', {
      status: 'derived',
      from: 'knowledge-context-build.mjs',
      to: 'knowledge-records.mjs',
      relation: 'reads validated JSONL from',
      sourceRef: 'graph/kg-relations.jsonl',
      trustTier: 'derived',
      stages: ['execute'],
    }),
  ]));
  write(path.join(knowledgeRoot, 'ontology', 'constraints.jsonl'), jsonl([
    base('ontology_constraint', 'constraint-verify', {
      status: 'verified',
      scope: 'prompt-purity',
      appliesTo: ['promptBlock'],
      severity: 'blocking',
      enforcedBy: 'knowledge-context-build.mjs',
      sourceRef: 'ontology/constraints.jsonl',
      stages: ['verify'],
    }),
  ]));
  return knowledgeRoot;
}

function build(fixture, stage = 'plan', options = {}) {
  return buildProjectKnowledgeContext({
    cwd: fixture.repo,
    stage,
    env: fixture.env,
    now: new Date(NOW),
    ...options,
  }).projectKnowledgeContext;
}

test('emits the Phase 03 projectKnowledgeContext contract', () => {
  const fixture = makeFixture();
  seedKnowledge(fixture);

  const context = build(fixture, 'plan');

  assert.equal(context.schemaVersion, 1);
  assert.equal(context.projectId, 'demo-project');
  assert.equal(context.namespace, 'account-root/project-knowledge');
  assert.equal(context.knowledgeRevision, 'rev-1');
  assert.equal(context.status, 'ready');
  assert.equal(context.strictness, 'advisory');
  assert.ok(Array.isArray(context.policyAnchors));
  assert.ok(Array.isArray(context.semanticFacts));
  assert.ok(Array.isArray(context.graphSynopsis));
  assert.ok(Array.isArray(context.ontologyConstraints));
  assert.match(context.promptBlock, /## Project Knowledge Context/);
  assert.match(context.promptBlock, /fact:fact-plan/);
});

test('degrades safely when account-root knowledge namespace is absent', () => {
  const fixture = makeFixture();

  const advisory = build(fixture, 'plan');
  assert.equal(advisory.status, 'not_configured');
  assert.equal(advisory.strictness, 'advisory');
  assert.equal(advisory.staleOrUnavailable[0].blocking, false);

  const required = build(fixture, 'plan', { strictness: 'required' });
  assert.equal(required.status, 'not_configured');
  assert.equal(required.strictness, 'required');
  assert.equal(required.staleOrUnavailable[0].blocking, true);
});

test('does not treat an empty account-root knowledge namespace as ready', () => {
  const fixture = makeFixture();
  const knowledgeRoot = path.join(fixture.state, 'projects', 'demo-project', 'knowledge');
  mkdirp(knowledgeRoot);
  fs.rmSync(path.join(fixture.repo, '.claude', 'knowledge.contract.yaml'));

  const context = build(fixture, 'plan');

  assert.equal(context.status, 'not_configured');
  assert.match(context.staleOrUnavailable[0].reason, /contains no configured records/);
});

test('does not treat empty configured record files as ready', () => {
  const fixture = makeFixture();
  const knowledgeRoot = path.join(fixture.state, 'projects', 'demo-project', 'knowledge');
  write(path.join(knowledgeRoot, 'semantic', 'verified-facts.jsonl'), '');

  const context = build(fixture, 'plan');

  assert.equal(context.status, 'not_configured');
  assert.match(context.staleOrUnavailable[0].reason, /no account-root records were found/);
});

test('reports degraded_read for invalid record files', () => {
  const fixture = makeFixture();
  const knowledgeRoot = path.join(fixture.state, 'projects', 'demo-project', 'knowledge');
  write(path.join(knowledgeRoot, 'semantic', 'verified-facts.jsonl'), '{not-json}\n');

  const context = build(fixture, 'plan', { strictness: 'required' });

  assert.equal(context.status, 'degraded_read');
  assert.equal(context.staleOrUnavailable[0].blocking, true);
  assert.match(context.staleOrUnavailable[0].reason, /invalid JSON/);
});

test('reports stale when revision metadata exceeds the configured age', () => {
  const fixture = makeFixture();
  seedKnowledge(fixture, { updatedAt: '2026-05-01T00:00:00Z' });

  const context = build(fixture, 'verify');

  assert.equal(context.status, 'stale');
  assert.match(context.staleOrUnavailable[0].reason, /knowledge revision is stale/);
});

test('classifies stale revision without configured records as not configured', () => {
  const fixture = makeFixture();
  const knowledgeRoot = path.join(fixture.state, 'projects', 'demo-project', 'knowledge');
  write(path.join(knowledgeRoot, 'revision.json'), JSON.stringify({ revision: 'rev-old', updatedAt: '2026-05-01T00:00:00Z' }));

  const context = build(fixture, 'verify');

  assert.equal(context.status, 'not_configured');
  assert.match(context.staleOrUnavailable[0].reason, /no account-root records were found/);
});

test('keeps prompt block and included item text free of raw dumps, logs, transcripts, and secrets', () => {
  const fixture = makeFixture();
  const knowledgeRoot = seedKnowledge(fixture);
  write(path.join(fixture.repo, 'AGENTS.md'), [
    '# Repo Policy',
    '<INSTRUCTIONS>',
    'system/developer duplicated body password=hunter2 ghp_abcdefghijklmnop',
    '</INSTRUCTIONS>',
    '',
  ].join('\n'));
  write(path.join(knowledgeRoot, 'semantic', 'verified-facts.jsonl'), jsonl([
    base('semantic_fact', 'fact-secret', {
      statement: 'Never leak sk-abcdefghijklmnop or apiKey=abc123 in prompt archive transcript stdout {"nodes":[],"relationships":[]}.',
      sourceType: 'authoritative_doc',
      sourceRef: 'semantic/verified-facts.jsonl',
      trustTier: 'verified',
      provenanceRef: 'prov-secret',
      verifiedBy: 'test',
      verifiedAt: NOW,
      stages: ['plan'],
    }),
  ]));

  const context = build(fixture, 'plan');
  const serializedItems = JSON.stringify({
    policyAnchors: context.policyAnchors,
    semanticFacts: context.semanticFacts,
    graphSynopsis: context.graphSynopsis,
    ontologyConstraints: context.ontologyConstraints,
  });
  const combined = `${context.promptBlock}\n${serializedItems}`;

  assert.doesNotMatch(combined, /sk-[A-Za-z0-9_-]+/);
  assert.doesNotMatch(combined, /ghp_[A-Za-z0-9_]+/);
  assert.doesNotMatch(combined, /password=/i);
  assert.doesNotMatch(combined, /apiKey=/);
  assert.doesNotMatch(combined, /"nodes"\s*:/);
  assert.doesNotMatch(combined, /"relationships"\s*:/);
  assert.doesNotMatch(combined, /\bstdout\b/i);
  assert.ok(context.omittedByPolicy.some((item) => item.reason === 'duplicated_system_developer_or_rules_body'));
  assert.ok(context.omittedByPolicy.some((item) => item.reason === 'openai_api_key'));
});

test('does not reintroduce duplicated system developer body through prompt policy summaries', () => {
  const fixture = makeFixture();
  seedKnowledge(fixture);
  write(path.join(fixture.repo, 'AGENTS.md'), [
    '# Repo Policy',
    'system/developer duplicated body should not become an anchor',
    'Use compact project facts only.',
  ].join('\n'));

  const context = build(fixture, 'intake');
  const combined = `${context.promptBlock}\n${JSON.stringify(context.policyAnchors)}`;

  assert.doesNotMatch(combined, /system\/developer duplicated body/i);
  assert.match(combined, /duplicated instruction body was omitted/);
  assert.ok(context.omittedByPolicy.some((item) => item.reason === 'duplicated_system_developer_or_rules_body'));
});

test('omits duplicated instruction blocks from prompt policy summaries', () => {
  const fixture = makeFixture();
  seedKnowledge(fixture);
  write(path.join(fixture.repo, 'AGENTS.md'), [
    '# Repo Policy',
    '<INSTRUCTIONS>',
    'Persona: This duplicated block must not become an anchor.',
    'Core Attributes',
    '</INSTRUCTIONS>',
    'Use compact project facts only.',
  ].join('\n'));

  const context = build(fixture, 'intake');
  const combined = `${context.promptBlock}\n${JSON.stringify(context.policyAnchors)}`;

  assert.doesNotMatch(combined, /Persona: This duplicated block/i);
  assert.doesNotMatch(combined, /Core Attributes/i);
  assert.match(combined, /duplicated instruction body was omitted/);
  assert.ok(context.omittedByPolicy.some((item) => item.reason === 'duplicated_system_developer_or_rules_body'));
});

test('omits untagged duplicate boilerplate lines after duplicate markers', () => {
  const fixture = makeFixture();
  seedKnowledge(fixture);
  write(path.join(fixture.repo, 'AGENTS.md'), [
    '# Repo Policy',
    'AGENTS.md instructions for C:\\dev\\claude-settings',
    'Persona: This duplicated persona line must not become an anchor.',
    'Core Attributes',
    'Use compact project facts only.',
  ].join('\n'));

  const context = build(fixture, 'intake');
  const combined = `${context.promptBlock}\n${JSON.stringify(context.policyAnchors)}`;

  assert.doesNotMatch(combined, /duplicated persona line/i);
  assert.doesNotMatch(combined, /Core Attributes/i);
  assert.match(combined, /duplicated instruction body was omitted/);
  assert.ok(context.omittedByPolicy.some((item) => item.reason === 'duplicated_system_developer_or_rules_body'));
});

test('omits detailed AGENTS template body lines after duplicate marker', () => {
  const fixture = makeFixture();
  seedKnowledge(fixture);
  write(path.join(fixture.repo, 'AGENTS.md'), [
    '# Repo Policy',
    'AGENTS.md instructions for C:\\dev\\claude-settings',
    'Highly Analytical: Break down complex problems.',
    'Pragmatic & Objective: Favor boring technology.',
    'Use compact project facts only.',
  ].join('\n'));

  const context = build(fixture, 'intake');
  const combined = `${context.promptBlock}\n${JSON.stringify(context.policyAnchors)}`;

  assert.doesNotMatch(combined, /Highly Analytical/i);
  assert.doesNotMatch(combined, /Pragmatic & Objective/i);
  assert.doesNotMatch(combined, /Use compact project facts only/);
  assert.match(combined, /duplicated instruction body was omitted/);
  assert.ok(context.omittedByPolicy.some((item) => item.reason === 'duplicated_system_developer_or_rules_body'));
});

test('selects different deterministic priorities for plan, execute, and verify stages', () => {
  const fixture = makeFixture();
  seedKnowledge(fixture);

  const plan = build(fixture, 'plan');
  const execute = build(fixture, 'execute');
  const verify = build(fixture, 'verify');

  assert.equal(plan.semanticFacts[0].id, 'fact:fact-plan');
  assert.equal(execute.graphSynopsis[0].id, 'kg:kg-execute');
  assert.equal(verify.ontologyConstraints[0].id, 'ontology:constraint-verify');
  assert.notEqual(plan.promptBlock, execute.promptBlock);
  assert.notEqual(execute.promptBlock, verify.promptBlock);
});

test('omits cross-project records from prompt-visible context', () => {
  const fixture = makeFixture();
  const knowledgeRoot = seedKnowledge(fixture);
  write(path.join(knowledgeRoot, 'semantic', 'verified-facts.jsonl'), jsonl([
    base('semantic_fact', 'fact-other-project', {
      projectId: 'other-project',
      statement: 'This fact belongs to another project.',
      sourceType: 'authoritative_doc',
      sourceRef: 'semantic/verified-facts.jsonl',
      trustTier: 'verified',
      provenanceRef: 'prov-other',
      verifiedBy: 'test',
      verifiedAt: NOW,
    }),
  ]));

  const context = build(fixture, 'plan');

  assert.equal(context.semanticFacts.length, 0);
  assert.doesNotMatch(context.promptBlock, /another project/);
});

test('renders only applicable ontology summaries and never raw ontology dump text', () => {
  const fixture = makeFixture();
  const knowledgeRoot = seedKnowledge(fixture);
  write(path.join(knowledgeRoot, 'ontology', 'constraints.jsonl'), jsonl([
    base('ontology_constraint', 'constraint-raw-ontology', {
      status: 'verified',
      scope: '@prefix sh: <http://www.w3.org/ns/shacl#> . sh:NodeShape raw dump must not appear',
      appliesTo: ['promptBlock'],
      severity: 'blocking',
      enforcedBy: 'ontology-constraint-validate.mjs',
      sourceRef: 'ontology/raw-dump.ttl',
      stages: ['verify'],
    }),
  ]));

  const context = build(fixture, 'verify');
  const combined = `${context.promptBlock}\n${JSON.stringify(context.ontologyConstraints)}`;

  assert.equal(context.ontologyConstraints.length, 1);
  assert.match(combined, /ontology:constraint-raw-ontology/);
  assert.doesNotMatch(combined, /@prefix/);
  assert.doesNotMatch(combined, /sh:NodeShape/);
  assert.ok(context.omittedByPolicy.some((item) => item.reason === 'raw_ontology_dump'));
});
