import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { buildBottleneckWarnings } from './phase-attempt-telemetry.mjs';

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-overhead-regression-'));
process.env.WORKFLOW_ENFORCEMENT_LOG_DIR = path.join(tempRoot, 'workflow-enforcement');

const promptRedaction = await import('./prompt-redaction.mjs');
const unavailableCache = await import('./runtime-unavailable-cache.mjs');

test.after(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('spawn command summaries redact prompts while preserving hash-addressed archives', () => {
  const prompt = 'UNIQUE_PHASE_PROMPT_BODY_SHOULD_NOT_APPEAR_IN_SPAWN_EVENT';
  const summary = promptRedaction.summarizeSpawnCommand([
    'codex',
    'exec',
    '--sandbox',
    'workspace-write',
    '-C',
    tempRoot,
    prompt,
  ], tempRoot);

  assert.equal(summary.commandName, 'codex');
  assert.equal(summary.argvSummary.includes(prompt), false);
  assert.ok(summary.argvSummary.includes('<prompt-redacted>'));
  assert.equal(summary.promptBytes, Buffer.byteLength(prompt, 'utf8'));
  assert.equal(
    summary.promptHash,
    `sha256:${crypto.createHash('sha256').update(prompt, 'utf8').digest('hex')}`,
  );
  assert.equal(fs.readFileSync(path.join(tempRoot, summary.promptArchivePath), 'utf8'), prompt);
});

test('runtime unavailable cache records once and returns stable summaries for repeated observations', () => {
  const statusFile = path.join(tempRoot, '.claude/docs/phase-status.yaml');
  const first = unavailableCache.recordUnavailableCapability(statusFile, {
    code: 'memorygraph_unavailable',
    fingerprint: 'memorygraph-fingerprint',
    source: 'memorygraph.health',
    evidencePath: '.claude/logs/memorygraph/first.json',
    strict: 'false',
  });
  const second = unavailableCache.recordUnavailableCapability(statusFile, {
    code: 'memorygraph_unavailable',
    fingerprint: 'memorygraph-fingerprint',
    source: 'memorygraph.health',
    evidencePath: '.claude/logs/memorygraph/repeated.json',
    strict: 'false',
  });

  assert.equal(first.unavailableCapabilities.length, 1);
  assert.equal(second.unavailableCapabilities.length, 1);
  assert.equal(
    unavailableCache.hasUnavailableCapability(statusFile, {
      code: 'memorygraph_unavailable',
      fingerprint: 'memorygraph-fingerprint',
      strict: 'false',
    }),
    true,
  );
  assert.match(
    unavailableCache.knownUnavailableSummary(statusFile, { code: 'memorygraph_unavailable' }),
    /memorygraph_unavailable:false@memorygraph\.health/,
  );
});

test('codex base args use trusted local sandbox and do not reintroduce removed automation flags', () => {
  const result = spawnSync('node', [
    '.claude/scripts/runtime-cli.mjs',
    'codex-base-args',
    process.cwd(),
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  const args = String(result.stdout || '').trim().split(/\r?\n/).filter(Boolean);
  assert.ok(args.includes('--sandbox'));
  assert.ok(args.includes('danger-full-access'));
  assert.equal(args.includes('--ask-for-approval'), false);
  assert.equal(args.includes('--full-auto'), false);
});

test('codex base args allow explicit sandbox override for trusted local phase runners', () => {
  const result = spawnSync('node', [
    '.claude/scripts/runtime-cli.mjs',
    'codex-base-args',
    process.cwd(),
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: {
      ...process.env,
      CODEX_EXEC_SANDBOX: 'workspace-write',
    },
  });

  assert.equal(result.status, 0, result.stderr);
  const args = String(result.stdout || '').trim().split(/\r?\n/).filter(Boolean);
  assert.ok(args.includes('--sandbox'));
  assert.ok(args.includes('workspace-write'));
  assert.equal(args.includes('danger-full-access'), false);
  assert.equal(args.includes('--full-auto'), false);
});

test('slow narrow phase emits dominant timing bucket warning', () => {
  const warnings = buildBottleneckWarnings({
    wallClockSeconds: 120,
    workerStartupSeconds: 4,
    workerActiveSeconds: 6,
    verificationSeconds: 2,
    closeoutSeconds: 98,
    idleWaitSeconds: 10,
    runtimeFallbackSeconds: 0,
  }, { thresholdSeconds: 30, ratio: 0.7 });

  assert.deepEqual(warnings, ['phase_attempt_bottleneck:closeoutSeconds:98s_of_120s']);
});
