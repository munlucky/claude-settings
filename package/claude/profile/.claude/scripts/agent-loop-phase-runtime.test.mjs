#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const runtimeScript = path.join(scriptDir, 'agent-loop-phase-runtime.mjs');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-loop-phase-runtime-'));
}

test('classify-timeout-reason maps codex reconnect loop to upstream stall', () => {
  const tempDir = makeTempDir();
  const logFile = path.join(tempDir, 'phase.log');
  fs.writeFileSync(logFile, 'ERROR: Reconnecting... 3/5\n', 'utf8');

  const result = spawnSync(process.execPath, [
    runtimeScript,
    'classify-timeout-reason',
    logFile,
  ], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'codex_upstream_stream_stalled');
});

test('completion-gate runner stops a codex upstream reconnect loop', { timeout: 20000 }, () => {
  const tempDir = makeTempDir();
  const logFile = path.join(tempDir, 'phase.log');

  const result = spawnSync(process.execPath, [
    runtimeScript,
    'run-worker-prompt-with-completion-gate',
    '--log-file',
    logFile,
    '--heartbeat-seconds',
    '0',
    '--watchdog-max-seconds',
    '60',
    '--watchdog-check-seconds',
    '1',
    '--',
    process.execPath,
    '-e',
    "console.error('stream disconnected - retrying sampling request (3/5 in 100ms)'); setInterval(() => {}, 1000);",
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      AGENT_LOOP_CODEX_UPSTREAM_STALL_SECONDS: '1',
      AGENT_LOOP_CODEX_UPSTREAM_RECONNECT_THRESHOLD: '3',
    },
    timeout: 20000,
  });

  assert.equal(result.status, 125, result.stderr || result.stdout);
  const text = fs.readFileSync(logFile, 'utf8');
  assert.match(text, /SUPERVISOR_EVENT .*"event":"upstream-stream-stalled"/);
  assert.match(text, /UPSTREAM_STREAM_STALL reconnect=3 threshold=3 after=1s/);
});

test('classify-timeout-reason maps raw diff dominated timeout logs', () => {
  const tempDir = makeTempDir();
  const logFile = path.join(tempDir, 'phase.log');
  const diffBody = Array.from({ length: 90 }, (_, index) => `+changed line ${index}`).join('\n');
  fs.writeFileSync(logFile, `worker output timeout\n\ndiff --git a/app.js b/app.js\nindex 123..456\n@@ -1,3 +1,3 @@\n${diffBody}\n`, 'utf8');

  const result = spawnSync(process.execPath, [
    runtimeScript,
    'classify-timeout-reason',
    logFile,
  ], {
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), 'raw_diff_output_timeout');
});

test('classify-timeout-reason maps broad search and parity timeout logs', () => {
  const tempDir = makeTempDir();
  const broadLog = path.join(tempDir, 'broad.log');
  const parityLog = path.join(tempDir, 'parity.log');
  fs.writeFileSync(broadLog, 'broad_search_timeout skipped_root=C:/Users/moon/AppData/Local/npm-cache/_npx inspected=200 output_lines=80\n', 'utf8');
  fs.writeFileSync(parityLog, 'WATCHDOG_TIMEOUT after 120s\nbash .claude/scripts/verify-phase-runtime-parity.sh\n', 'utf8');

  const broad = spawnSync(process.execPath, [runtimeScript, 'classify-timeout-reason', broadLog], { encoding: 'utf8' });
  const parity = spawnSync(process.execPath, [runtimeScript, 'classify-timeout-reason', parityLog], { encoding: 'utf8' });

  assert.equal(broad.status, 0, broad.stderr);
  assert.equal(parity.status, 0, parity.stderr);
  assert.equal(broad.stdout.trim(), 'broad_search_timeout');
  assert.equal(parity.stdout.trim(), 'phaseRuntimeParity_timeout');
});

test('runtime health ignores log warnings older than the active run attachment', () => {
  const tempDir = makeTempDir();
  const logDir = path.join(tempDir, '.claude', 'logs', 'agent-loop');
  const statusDir = path.join(tempDir, '.claude', 'docs');
  fs.mkdirSync(logDir, { recursive: true });
  fs.mkdirSync(statusDir, { recursive: true });

  const oldLog = path.join(logDir, 'phase-6_older.log');
  fs.writeFileSync(oldLog, 'Failed to kill MCP process group: EPERM\n', 'utf8');
  const oldTime = new Date(Date.now() - 60_000);
  fs.utimesSync(oldLog, oldTime, oldTime);

  const attachedAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(statusDir, 'phase-status.yaml'),
    `activeExecutionAttachedAt: "${attachedAt}"\n`,
    'utf8',
  );

  const result = spawnSync(process.execPath, [
    runtimeScript,
    'assess-runtime-health',
    'codex',
    tempDir,
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      AGENT_LOOP_RUNTIME_HEALTH_WINDOW_MS: String(2 * 60 * 60 * 1000),
      AGENT_LOOP_RUNTIME_HEALTH_MAX_LOGS: '5',
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /HEALTHY='true'/);
  assert.doesNotMatch(result.stdout, /runtime-log-health-check-failed/);
});
