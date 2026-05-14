import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-capability-preflight-'));
process.env.WORKFLOW_ENFORCEMENT_LOG_DIR = path.join(tempRoot, 'workflow-enforcement');

const unavailableCache = await import('./lib/runtime-unavailable-cache.mjs');

test.after(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('non-strict MemoryGraph unavailable record is superseded after same-run healthy probe', () => {
  const statusFile = path.join(tempRoot, '.claude/docs/phase-status.yaml');
  process.env.PHASE_RUN_ID = 'phase-05-run-a';

  unavailableCache.recordUnavailableCapability(statusFile, {
    capability: 'memorygraph',
    code: 'memorygraph_unavailable',
    fingerprint: 'memorygraph-fingerprint',
    source: 'memorygraph.health',
    evidencePath: '.claude/logs/agent-loop/capabilities-first.json',
    strict: 'false',
    checkId: 'memorygraph.health',
  });

  assert.equal(unavailableCache.hasUnavailableCapability(statusFile, {
    code: 'memorygraph_unavailable',
    fingerprint: 'memorygraph-fingerprint',
    strict: 'false',
  }), true);

  unavailableCache.recordHealthyCapability(statusFile, {
    capability: 'memorygraph',
    code: 'memorygraph_unavailable',
    fingerprint: 'memorygraph-fingerprint',
    source: 'memorygraph.health',
    strict: 'false',
    checkId: 'memorygraph.health',
  });

  const records = unavailableCache.readUnavailableCapabilities(statusFile);
  const superseded = records.find((entry) => entry.status === 'superseded');
  const healthy = records.find((entry) => entry.status === 'healthy');

  assert.ok(superseded);
  assert.equal(superseded.capability, 'memorygraph');
  assert.equal(superseded.freshnessState, 'recovered');
  assert.equal(superseded.decayReason, 'healthy_probe');
  assert.ok(superseded.decayedAt);
  assert.ok(healthy);
  assert.equal(healthy.lastHealthyAt, healthy.observedAt);
  assert.equal(unavailableCache.hasUnavailableCapability(statusFile, {
    code: 'memorygraph_unavailable',
    fingerprint: 'memorygraph-fingerprint',
    strict: 'false',
  }), false);
});

test('new run marks previous non-strict MemoryGraph unavailable warning stale', () => {
  const statusFile = path.join(tempRoot, '.claude/docs/phase-status-new-run.yaml');
  process.env.PHASE_RUN_ID = 'phase-05-run-a';
  unavailableCache.recordUnavailableCapability(statusFile, {
    capability: 'memorygraph',
    code: 'memorygraph_unavailable',
    fingerprint: 'memorygraph-fingerprint',
    source: 'memorygraph.health',
    strict: 'false',
    checkId: 'memorygraph.health',
  });

  process.env.PHASE_RUN_ID = 'phase-05-run-b';
  const records = unavailableCache.readUnavailableCapabilities(statusFile);
  const stale = records.find((entry) => entry.code === 'memorygraph_unavailable');

  assert.ok(stale);
  assert.equal(stale.status, 'stale');
  assert.equal(stale.freshnessState, 'stale');
  assert.equal(stale.decayReason, 'new_run');
  assert.equal(unavailableCache.hasUnavailableCapability(statusFile, {
    code: 'memorygraph_unavailable',
    fingerprint: 'memorygraph-fingerprint',
    strict: 'false',
  }), false);
});

test('broad search debug caps', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./phase-capability-preflight.mjs', import.meta.url)), '--json'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CRG_DEBUG_BROAD_SEARCH: 'true',
      PHASE_CAPABILITY_PREFLIGHT_FIXTURE_BROAD_SEARCH_TIMEOUT: 'true',
      PHASE_CAPABILITY_PREFLIGHT_FIXTURE_SKIPPED_ROOT: 'C:\\Users\\fixture\\AppData\\Local\\npm-cache\\_npx',
    },
    encoding: 'utf8',
  });

  assert.ok(result.stdout, result.stderr || 'expected JSON output');
  const report = JSON.parse(result.stdout);
  const broadSearch = report.checks.find((entry) => entry.name === 'crg.broadsearch');

  assert.ok(broadSearch);
  assert.equal(broadSearch.failureClass, 'broad_search_timeout');
  assert.equal(broadSearch.retryPolicy, 'no_retry');
  assert.equal(broadSearch.broadSearch.maxFiles, 200);
  assert.equal(broadSearch.broadSearch.timeoutSeconds, 10);
  assert.equal(broadSearch.broadSearch.maxOutputLines, 80);
  assert.match(broadSearch.broadSearch.skippedRoot, /npm-cache\\_npx/);
});
