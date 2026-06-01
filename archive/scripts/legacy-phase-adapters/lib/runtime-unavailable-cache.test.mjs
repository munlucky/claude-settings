#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  buildPhaseRuntimeParityTimeoutKey,
  hasPhaseRuntimeParityTimeout,
  recordPhaseRuntimeParityTimeout,
} from './runtime-unavailable-cache.mjs';

test('phase runtime parity same run timeout suppresses identical retry key', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-unavailable-cache-'));
  const originalCwd = process.cwd();
  process.chdir(root);
  try {
    const statusFile = '.claude/docs/phase-status.yaml';
    const input = {
      runId: 'run-1',
      verifierId: 'phaseRuntimeParity',
      referencePlanHash: 'reference-hash',
      runtimeTarget: 'codex',
      evidencePath: '.claude/logs/phase-3.log',
    };

    assert.equal(
      buildPhaseRuntimeParityTimeoutKey(input),
      'run-1|phaseRuntimeParity|reference-hash|codex',
    );
    assert.equal(hasPhaseRuntimeParityTimeout(statusFile, input), false);

    recordPhaseRuntimeParityTimeout(statusFile, input);

    assert.equal(hasPhaseRuntimeParityTimeout(statusFile, input), true);
    assert.equal(hasPhaseRuntimeParityTimeout(statusFile, { ...input, runtimeTarget: 'claude' }), false);
  } finally {
    process.chdir(originalCwd);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
