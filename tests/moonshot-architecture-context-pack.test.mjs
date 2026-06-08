import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();

const runArchitectureContext = (args = []) => {
  const env = { ...process.env };
  const maybeEnv = args[0]?.env ? args.shift().env : null;
  if (maybeEnv) Object.assign(env, maybeEnv);
  const result = spawnSync(process.execPath, [
    'scripts/architecture-context-build.mjs',
    '--cwd',
    root,
    '--json',
    ...args,
  ], {
    cwd: root,
    encoding: 'utf8',
    env,
  });
  const output = result.stdout.trim() ? JSON.parse(result.stdout) : null;
  return { ...result, output };
};

const forbiddenPromptPatterns = [
  /"?nodes"?\s*:\s*\[/i,
  /"?edges"?\s*:\s*\[/i,
  /@prefix|owl:|rdf:|sh:NodeShape/i,
  /runtime log|transcript|browser scrape/i,
  /sk-[A-Za-z0-9_-]{6,}/,
  /ghp_[A-Za-z0-9_]{6,}/,
  /password\s*=/i,
];

test('architecture-context-build emits greenfield architecture context pack', () => {
  const result = runArchitectureContext(['--stage', 'plan', '--mode', 'greenfield_prd']);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.output.status, 'degraded');
  const context = result.output.architectureContext;

  assert.equal(context.schemaVersion, 2);
  assert.equal(context.artifactId, 'ARCHITECTURE_CONTEXT_PACK');
  assert.equal(context.owner, 'moonshot-architecture');
  assert.equal(context.mode, 'greenfield_prd');
  assert.equal(context.stage, 'plan');
  assert.equal(context.promptFacingAuthority, 'architectureContext.promptBlock');
  assert.equal(context.sourceContextAuthority, 'projectKnowledgeContext.promptBlock');
  assert.ok(context.requiredArtifacts.includes('ASR_CATALOG.md'));
  assert.ok(context.requiredArtifacts.includes('ARCHITECTURE_REVIEW.md'));
  assert.ok(context.internalStageOwners.includes('asr-extractor'));
  assert.ok(context.internalStageOwners.includes('architecture-gate-reviewer'));
  assert.match(context.promptBlock, /^## Moonshot Architecture Context/m);
});

test('architecture-context-build emits brownfield-specific context requirements', () => {
  const result = runArchitectureContext(['--stage', 'execute', '--mode', 'brownfield_codebase']);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const context = result.output.architectureContext;

  assert.equal(context.mode, 'brownfield_codebase');
  assert.equal(context.stage, 'execute');
  assert.ok(context.requiredArtifacts.includes('CURRENT_ARCHITECTURE.md'));
  assert.ok(context.requiredArtifacts.includes('SPEC_DELTA.md'));
  assert.ok(context.requiredArtifacts.includes('IMPACT_MAP.md'));
});

test('architecture context prompt block excludes raw unsafe context bodies', () => {
  const result = runArchitectureContext(['--stage', 'plan', '--mode', 'greenfield_prd']);
  const promptBlock = result.output.architectureContext.promptBlock;
  const projectKnowledgePromptBlock = result.output.projectKnowledgeContext.promptBlock;

  for (const pattern of forbiddenPromptPatterns) {
    assert.doesNotMatch(promptBlock, pattern);
    assert.doesNotMatch(projectKnowledgePromptBlock, pattern);
  }
});

test('architecture-context-build rejects unsafe caller-provided context notes', () => {
  const result = runArchitectureContext([
    '--stage',
    'plan',
    '--mode',
    'greenfield_prd',
    '--context-note',
    '{"nodes":[{"id":"raw"}],"relationships":[{"from":"a","to":"b"}]}',
  ]);

  assert.notEqual(result.status, 0);
  assert.equal(result.output.status, 'failed');
  assert.ok(result.output.architectureContext.errors.some((error) => error.code === 'prompt_unsafe_context_note'));
});

test('architecture-context-build rejects nodes plus edges graph notes', () => {
  const result = runArchitectureContext([
    '--stage',
    'plan',
    '--mode',
    'greenfield_prd',
    '--context-note',
    '{"nodes":[{"id":"raw"}],"edges":[{"from":"a","to":"b"}]}',
  ]);

  assert.notEqual(result.status, 0);
  assert.equal(result.output.status, 'failed');
  assert.ok(result.output.architectureContext.errors.some((error) => error.message.includes('raw_graph_nodes_edges')));
});

test('architecture-context-build rejects env-style secret notes', () => {
  const result = runArchitectureContext([
    '--stage',
    'plan',
    '--mode',
    'greenfield_prd',
    '--context-note',
    'API_KEY=abcdef123456',
  ]);

  assert.notEqual(result.status, 0);
  assert.equal(result.output.status, 'failed');
  assert.ok(result.output.architectureContext.errors.some((error) => error.message.includes('env_secret_assignment')));
});

test('architecture-context-build rejects bearer token notes', () => {
  const result = runArchitectureContext([
    '--stage',
    'plan',
    '--mode',
    'greenfield_prd',
    '--context-note',
    'Authorization: Bearer abcdef123456',
  ]);

  assert.notEqual(result.status, 0);
  assert.equal(result.output.status, 'failed');
  assert.ok(result.output.architectureContext.errors.some((error) => error.message.includes('authorization_bearer')));
});

test('architecture-context-build preserves degraded project knowledge status as degraded architecture context', () => {
  const moonshotHome = mkdtempSync(path.join(os.tmpdir(), 'moonshot-architecture-context-'));
  try {
    const knowledgeRoot = path.join(moonshotHome, 'state', 'projects', 'munlucky-moonshot-relay', 'knowledge');
    mkdirSync(knowledgeRoot, { recursive: true });
    writeFileSync(path.join(knowledgeRoot, 'revision.json'), '{invalid json', 'utf8');

    const result = runArchitectureContext([
      { env: { MOONSHOT_RELAY_HOME: moonshotHome } },
      '--stage',
      'execute',
      '--mode',
      'brownfield_codebase',
    ]);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.output.projectKnowledgeContext.status, 'degraded_read');
    assert.equal(result.output.status, 'degraded');
    assert.equal(result.output.architectureContext.status, 'degraded');
    assert.equal(result.output.architectureContext.blocking, false);
  } finally {
    rmSync(moonshotHome, { recursive: true, force: true });
  }
});

test('architecture-context-build preserves stale project knowledge status as degraded architecture context', () => {
  const moonshotHome = mkdtempSync(path.join(os.tmpdir(), 'moonshot-architecture-context-'));
  try {
    const knowledgeRoot = path.join(moonshotHome, 'state', 'projects', 'munlucky-moonshot-relay', 'knowledge');
    mkdirSync(path.join(knowledgeRoot, 'semantic'), { recursive: true });
    writeFileSync(path.join(knowledgeRoot, 'revision.json'), JSON.stringify({
      revision: 'stale-test',
      updatedAt: '2020-01-01T00:00:00.000Z',
    }), 'utf8');
    writeFileSync(path.join(knowledgeRoot, 'semantic', 'verified-facts.jsonl'), `${JSON.stringify({
      type: 'semantic_fact',
      id: 'fact-stale-test',
      projectId: 'munlucky-moonshot-relay',
      status: 'verified',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
      statement: 'Architecture context stale fixture is valid.',
      sourceType: 'test',
      sourceRef: 'tests/moonshot-architecture-context-pack.test.mjs',
      trustTier: 'verified',
      provenanceRef: 'prov-stale-test',
      verifiedBy: 'test',
      verifiedAt: '2020-01-01T00:00:00.000Z',
      supersedes: [],
      stages: ['execute'],
    })}\n`, 'utf8');

    const result = runArchitectureContext([
      { env: { MOONSHOT_RELAY_HOME: moonshotHome } },
      '--stage',
      'execute',
      '--mode',
      'brownfield_codebase',
    ]);

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.output.projectKnowledgeContext.status, 'stale');
    assert.equal(result.output.status, 'degraded');
    assert.equal(result.output.architectureContext.status, 'degraded');
    assert.equal(result.output.architectureContext.blocking, false);
  } finally {
    rmSync(moonshotHome, { recursive: true, force: true });
  }
});

test('architecture-context-build emits json for argument errors', () => {
  const result = runArchitectureContext(['--stage', 'plan']);

  assert.notEqual(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(result.output.status, 'failed');
  assert.equal(result.output.errors[0].code, 'missing_required_argument');
});
