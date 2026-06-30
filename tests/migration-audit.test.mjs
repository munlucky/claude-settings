import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { test } from 'node:test';

import {
  DEFAULT_RUNTIME_STATE_ROOT,
  LEGACY_CLAUDE_STATE_ROOT,
  resolveLegacyClaudeStatePath,
  resolveRuntimeStatePath,
  resolveRuntimeStateRoot,
  runtimeStateRelativePath,
  LEGACY_STATE_OVERRIDE_COMPAT_FLAG,
} from '../scripts/lib/runtime-state-root.mjs';
import { resolveDbPath } from '../scripts/lib/runtime-state-db-path.mjs';
import { defaultPhaseEventLedgerPath } from '../scripts/lib/phase-event-ledger.mjs';
import { resolveLeaseFiles } from '../scripts/lib/phase-run-lease-store.mjs';
import { resolveRunCacheFiles } from '../scripts/lib/runtime-unavailable-cache.mjs';
import { DEFAULT_MEMORY_CANDIDATE_OUTPUT } from '../scripts/lib/awtl-memory-candidate.mjs';
import { DEFAULT_TRACE_ROOT } from '../scripts/lib/awtl-trace-sink.mjs';
import { accountStateRoot } from '../scripts/project-identity.mjs';

const root = process.cwd();
const fromRoot = (...segments) => path.join(root, ...segments);
const relative = (target) => path.relative(root, target).replaceAll(path.sep, '/');

const legacyStatePaths = [
  '.claude/logs/',
  '.claude/cache/',
  '.claude/traces/',
  '.claude/browser-artifacts/',
  '.claude/browser-runtime/',
  '.claude/memorygraph/',
  '.claude/runtime-state.sqlite',
  '.claude/memory.json',
  '.claude/*verdict*.json',
  '.claude/knowledge-repo-audit-*.json',
  '.code-review-graph/',
];

const sourceTruthForbiddenPatterns = [
  /(?:add|modify|update|edit).{0,80}`\.claude\/(?:skills|agents|scripts|schemas|templates)/is,
  /canonical source under `\.claude\//i,
  /source of truth under `\.claude\//i,
];

const docsThatMustAvoidClaudeSourceTruth = [
  'README.md',
  'package/profile-templates/claude/.claude/README.md',
  'docs/public/repository-layout.md',
  'docs/public/installer-usage.md',
  'docs/public/compatibility-migration.md',
];

test('runtime state resolver defaults new writes to account-root project knowledge', () => {
  assert.equal(DEFAULT_RUNTIME_STATE_ROOT, '.moonshot-relay');
  const expectedRoot = fromRoot('.tmp/home/.moonshot-relay/state/projects/munlucky-moonshot-relay/knowledge');
  const env = { USERPROFILE: fromRoot('.tmp/home') };
  assert.equal(resolveRuntimeStateRoot(root, env), expectedRoot);

  const defaultRoot = resolveRuntimeStateRoot(root);
  assert.equal(resolveRuntimeStatePath('logs', 'workflow-enforcement'), path.join(defaultRoot, 'logs', 'workflow-enforcement'));
  assert.equal(resolveDbPath(), path.join(defaultRoot, 'runtime-state.sqlite'));
  assert.equal(runtimeStateRelativePath('cache', 'codex-mcp-singleton'), path.join(defaultRoot, 'cache', 'codex-mcp-singleton'));
});

test('runtime state resolver honors MOONSHOT_RELAY_HOME as the account-root authority', () => {
  const moonshotHome = fromRoot('.tmp/custom-moonshot-home');
  assert.equal(accountStateRoot({ MOONSHOT_RELAY_HOME: moonshotHome }), path.join(moonshotHome, 'state'));
  assert.equal(
    resolveRuntimeStateRoot(root, { MOONSHOT_RELAY_HOME: moonshotHome }),
    path.join(moonshotHome, 'state', 'projects', 'munlucky-moonshot-relay', 'knowledge'),
  );
  assert.equal(
    accountStateRoot({
      MOONSHOT_RELAY_HOME: moonshotHome,
      MOONSHOT_RELAY_STATE_ROOT: fromRoot('.tmp/explicit-state-root'),
    }),
    fromRoot('.tmp/explicit-state-root'),
  );
});

test('runtime state resolver does not let legacy overrides bypass project identity by default', () => {
  const home = fromRoot('.tmp/home');
  const env = {
    USERPROFILE: home,
    MOONSHOT_STATE_ROOT: fromRoot('.tmp/legacy-moonshot-state'),
    PHASE_RUNTIME_STATE_ROOT: fromRoot('.tmp/legacy-phase-state'),
  };

  assert.equal(
    resolveRuntimeStateRoot(root, env),
    fromRoot('.tmp/home/.moonshot-relay/state/projects/munlucky-moonshot-relay/knowledge'),
  );

  assert.equal(
    resolveRuntimeStateRoot(root, {
      ...env,
      [LEGACY_STATE_OVERRIDE_COMPAT_FLAG]: '1',
    }),
    fromRoot('.tmp/legacy-moonshot-state'),
  );
});

test('runtime state resolver exposes legacy .claude compatibility paths for reads', () => {
  assert.equal(LEGACY_CLAUDE_STATE_ROOT, '.claude');
  assert.equal(relative(resolveLegacyClaudeStatePath('memorygraph')), '.claude/memorygraph');
  assert.equal(relative(resolveLegacyClaudeStatePath('runtime-state.sqlite')), '.claude/runtime-state.sqlite');
});

test('workflow lease and unavailable-capability caches write under account-root workflow logs by default', () => {
  const expectedRoot = resolveRuntimeStateRoot(root);
  const leaseFiles = resolveLeaseFiles();
  assert.equal(leaseFiles.mirrorGlobalCurrentRun, true);
  assert.equal(leaseFiles.activeRunFile, path.join(expectedRoot, 'logs', 'workflow-enforcement', 'active-phase-run.json'));
  assert.equal(leaseFiles.currentRunFile, path.join(expectedRoot, 'logs', 'workflow-enforcement', 'current-run.json'));

  const cacheFiles = resolveRunCacheFiles();
  assert.equal(cacheFiles.activeRunFile, path.join(expectedRoot, 'logs', 'workflow-enforcement', 'active-phase-run.json'));
  assert.equal(cacheFiles.currentRunFile, path.join(expectedRoot, 'logs', 'workflow-enforcement', 'current-run.json'));
});

test('phase event ledger writes under account-root workflow logs', () => {
  const expectedRoot = resolveRuntimeStateRoot(root);
  assert.equal(
    defaultPhaseEventLedgerPath(),
    path.join(expectedRoot, 'logs', 'workflow-enforcement', 'events.jsonl'),
  );
});

test('AWTL defaults write cache and traces under account-root project knowledge', () => {
  const expectedRoot = resolveRuntimeStateRoot(root);
  assert.equal(DEFAULT_MEMORY_CANDIDATE_OUTPUT, path.join(expectedRoot, 'cache', 'memorygraph', 'memory_update_candidates.jsonl'));
  assert.equal(DEFAULT_TRACE_ROOT, path.join(expectedRoot, 'traces'));
});

test('project knowledge account state defaults to .moonshot-relay state', () => {
  const home = path.join(root, '.tmp', 'home');
  assert.equal(
    relative(accountStateRoot({ USERPROFILE: home })),
    '.tmp/home/.moonshot-relay/state',
  );
  assert.equal(
    relative(accountStateRoot({ USERPROFILE: home, CODEX_STATE_ROOT: path.join(home, '.codex', 'state') })),
    '.tmp/home/.codex/state',
  );
  assert.equal(
    relative(accountStateRoot({ USERPROFILE: home, MOONSHOT_RELAY_STATE_ROOT: path.join(home, '.moonshot-relay', 'custom-state') })),
    '.tmp/home/.moonshot-relay/custom-state',
  );
});

test('project identity exposes project-scoped planning and execution namespaces', async () => {
  const { resolveProjectIdentity } = await import('../scripts/project-identity.mjs');
  const home = path.join(root, '.tmp', 'home');
  const resolved = resolveProjectIdentity({ cwd: root, env: { USERPROFILE: home } });

  assert.equal(resolved.identity.projectId, 'munlucky-moonshot-relay');
  assert.equal(
    relative(resolved.namespaces.planningRoot),
    '.tmp/home/.moonshot-relay/state/projects/munlucky-moonshot-relay/planning',
  );
  assert.equal(
    relative(resolved.namespaces.planningPackageRoot),
    '.tmp/home/.moonshot-relay/state/projects/munlucky-moonshot-relay/planning/packages',
  );
  assert.match(
    relative(resolved.namespaces.planExecutionRoot),
    /^\.tmp\/home\/\.moonshot-relay\/state\/projects\/munlucky-moonshot-relay\/execution\/worktrees\/wt-[a-f0-9]+\/branches\/[^/]+\/plans$/,
  );
});

test('package-name fallback project identities are path-disambiguated', async () => {
  const { resolveProjectIdentity } = await import('../scripts/project-identity.mjs');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'moonshot-project-id-'));
  const projectA = path.join(tempRoot, 'a');
  const projectB = path.join(tempRoot, 'b');
  fs.mkdirSync(projectA, { recursive: true });
  fs.mkdirSync(projectB, { recursive: true });
  fs.writeFileSync(path.join(projectA, 'package.json'), JSON.stringify({ name: 'web' }));
  fs.writeFileSync(path.join(projectB, 'package.json'), JSON.stringify({ name: 'web' }));
  const env = { MOONSHOT_RELAY_STATE_ROOT: path.join(tempRoot, 'state') };

  try {
    const first = resolveProjectIdentity({ cwd: projectA, env });
    const second = resolveProjectIdentity({ cwd: projectB, env });

    assert.equal(first.source, 'package-name-local');
    assert.equal(second.source, 'package-name-local');
    assert.match(first.identity.projectId, /^web-[a-f0-9]{8}$/);
    assert.match(second.identity.projectId, /^web-[a-f0-9]{8}$/);
    assert.notEqual(first.identity.projectId, second.identity.projectId);
    assert.notEqual(first.namespaces.planningPackageRoot, second.namespaces.planningPackageRoot);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('migration audit reports old generated state paths and cleanup instructions', async () => {
  const cleanupGuide = await fs.promises.readFile(fromRoot('docs/public/runtime-state-cleanup.md'), 'utf8');
  for (const statePath of legacyStatePaths) {
    assert.match(cleanupGuide, new RegExp(statePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(cleanupGuide, /Legacy non-exposed `.claude\/docs\/public\/`/);
  assert.match(cleanupGuide, /`.claude\/scripts\/`/);
  assert.match(cleanupGuide, /\.moonshot-relay\//);
});

test('public migration docs distinguish source, wrappers, profiles, and generated state', async () => {
  const docs = [
    await fs.promises.readFile(fromRoot('docs/public/repository-layout.md'), 'utf8'),
    await fs.promises.readFile(fromRoot('docs/public/installer-usage.md'), 'utf8'),
    await fs.promises.readFile(fromRoot('docs/public/compatibility-migration.md'), 'utf8'),
    await fs.promises.readFile(fromRoot('package/profile-templates/claude/.claude/README.md'), 'utf8'),
  ].join('\n');

  for (const phrase of [
    'canonical source',
    'development profile',
    'compatibility wrapper',
    'generated state',
    'package payload',
    'compatibility window',
    'deprecation',
  ]) {
    assert.match(docs, new RegExp(phrase, 'i'), `${phrase} should be documented`);
  }

  for (const canonicalRoot of ['skills/', 'agents/', 'rules/', 'scripts/', 'bin/', 'tools/', 'schemas/', 'templates/', 'tests/', 'docs/public/']) {
    assert.match(docs, new RegExp(canonicalRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${canonicalRoot} should be named`);
  }
});

test('docs do not treat .claude source trees as canonical source of truth', async () => {
  for (const relativePath of docsThatMustAvoidClaudeSourceTruth) {
    const content = await fs.promises.readFile(fromRoot(relativePath), 'utf8');
    const affirmativeSourceTruthLines = content
      .split(/\r?\n/)
      .filter((line) => !/\b(?:do not|don't|not valid|must not|never)\b/i.test(line));

    for (const line of affirmativeSourceTruthLines) {
      for (const pattern of sourceTruthForbiddenPatterns) {
        assert.doesNotMatch(line, pattern, `${relativePath} should not contain ${pattern}`);
      }
    }
  }
});

test('compatibility wrappers document their installed runtime role', async () => {
  const wrapperPaths = [
    'agents/verification/verify-changes.sh',
  ];

  for (const wrapperPath of wrapperPaths) {
    const content = await fs.promises.readFile(fromRoot(wrapperPath), 'utf8');
    assert.match(content, /compatibility/i, `${wrapperPath} should document compatibility`);
    assert.match(content, /installed.*\.claude\//is, `${wrapperPath} should document installed .claude runtime behavior`);
  }
});
