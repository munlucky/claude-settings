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
