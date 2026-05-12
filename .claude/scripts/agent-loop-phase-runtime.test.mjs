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
