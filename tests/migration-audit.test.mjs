import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  DEFAULT_RUNTIME_STATE_ROOT,
  LEGACY_CLAUDE_STATE_ROOT,
  resolveLegacyClaudeStatePath,
  resolveRuntimeStatePath,
  resolveRuntimeStateRoot,
  runtimeStateRelativePath,
} from '../.claude/scripts/lib/runtime-state-root.mjs';
import { resolveDbPath } from '../.claude/scripts/runtime-state.mjs';
import { defaultPhaseEventLedgerPath } from '../.claude/scripts/lib/phase-event-ledger.mjs';
import { resolveLeaseFiles } from '../.claude/scripts/lib/phase-run-lease-store.mjs';
import { resolveRunCacheFiles } from '../.claude/scripts/lib/runtime-unavailable-cache.mjs';

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
  '.claude/README.md',
  'docs/public/repository-layout.md',
  'docs/public/installer-usage.md',
  'docs/public/compatibility-migration.md',
];

test('runtime state resolver defaults new writes to .moonshot-state', () => {
  assert.equal(DEFAULT_RUNTIME_STATE_ROOT, '.moonshot-state');
  assert.equal(relative(resolveRuntimeStateRoot(root, {})), '.moonshot-state');
  assert.equal(relative(resolveRuntimeStatePath('logs', 'workflow-enforcement')), '.moonshot-state/logs/workflow-enforcement');
  assert.equal(relative(resolveDbPath()), '.moonshot-state/runtime-state.sqlite');
  assert.equal(runtimeStateRelativePath('cache', 'codex-mcp-singleton'), '.moonshot-state/cache/codex-mcp-singleton');
});

test('runtime state resolver exposes legacy .claude compatibility paths for reads', () => {
  assert.equal(LEGACY_CLAUDE_STATE_ROOT, '.claude');
  assert.equal(relative(resolveLegacyClaudeStatePath('memorygraph')), '.claude/memorygraph');
  assert.equal(relative(resolveLegacyClaudeStatePath('runtime-state.sqlite')), '.claude/runtime-state.sqlite');
});

test('workflow lease and unavailable-capability caches write under .moonshot-state by default', () => {
  const leaseFiles = resolveLeaseFiles('.claude/docs/phase-status.yaml');
  assert.equal(leaseFiles.mirrorGlobalCurrentRun, true);
  assert.equal(leaseFiles.activeRunFile, '.moonshot-state/logs/workflow-enforcement/active-phase-run.json');
  assert.equal(leaseFiles.currentRunFile, '.moonshot-state/logs/workflow-enforcement/current-run.json');

  const cacheFiles = resolveRunCacheFiles('.claude/docs/phase-status.yaml');
  assert.equal(cacheFiles.activeRunFile, '.moonshot-state/logs/workflow-enforcement/active-phase-run.json');
  assert.equal(cacheFiles.currentRunFile, '.moonshot-state/logs/workflow-enforcement/current-run.json');
});

test('phase event ledger writes under .moonshot-state workflow logs', () => {
  assert.equal(
    relative(defaultPhaseEventLedgerPath('.claude/docs/phase-status.yaml')),
    '.moonshot-state/logs/workflow-enforcement/events.jsonl',
  );
});

test('migration audit reports old generated state paths and cleanup instructions', async () => {
  const cleanupGuide = await fs.promises.readFile(fromRoot('docs/public/runtime-state-cleanup.md'), 'utf8');
  for (const statePath of legacyStatePaths) {
    assert.match(cleanupGuide, new RegExp(statePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(cleanupGuide, /Do not delete `.claude\/docs/);
  assert.match(cleanupGuide, /`.claude\/scripts\/`/);
  assert.match(cleanupGuide, /\.moonshot-state\//);
});

test('public migration docs distinguish source, wrappers, profiles, and generated state', async () => {
  const docs = [
    await fs.promises.readFile(fromRoot('docs/public/repository-layout.md'), 'utf8'),
    await fs.promises.readFile(fromRoot('docs/public/installer-usage.md'), 'utf8'),
    await fs.promises.readFile(fromRoot('docs/public/compatibility-migration.md'), 'utf8'),
    await fs.promises.readFile(fromRoot('.claude/README.md'), 'utf8'),
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

  for (const canonicalRoot of ['skills/', 'agents/', 'rules/', 'scripts/', 'schemas/', 'templates/', 'tests/', 'docs/public/']) {
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
    '.claude/scripts/moonshot-phase-dispatch.sh',
    '.claude/scripts/workflow-enforcement.sh',
    '.claude/agents/verification/verify-changes.sh',
  ];

  for (const wrapperPath of wrapperPaths) {
    const content = await fs.promises.readFile(fromRoot(wrapperPath), 'utf8');
    assert.match(content, /compatibility/i, `${wrapperPath} should document compatibility`);
    assert.match(content, /installed.*\.claude\//is, `${wrapperPath} should document installed .claude runtime behavior`);
  }
});
