import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { assessRuntimeHealthFromVerdictFiles } from './verification-verdict-state.mjs';

function writeVerdict(filePath, payload, mtime) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.utimesSync(filePath, mtime, mtime);
}

test('runtime health clears older active runtime blocker superseded by same-phase passed verdict', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verification-verdict-state-'));
  try {
    const claudeDir = path.join(root, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });

    const blockedPath = path.join(claudeDir, 'verification-verdict-phase03-blocked.json');
    const finalPath = path.join(claudeDir, 'verification-verdict-phase03-final.json');
    writeVerdict(blockedPath, {
      verdict: 'failed',
      blocking: true,
      blockerClass: 'runtime_unavailable',
      blockingReasonCode: 'running-harness-state-mismatch',
      phase: { number: 3 },
      runtimeContext: { requestedRuntime: 'codex' },
    }, new Date('2026-05-19T00:00:00Z'));
    writeVerdict(finalPath, {
      verdict: 'passed',
      blocking: false,
      phase: { number: 3 },
      runtimeContext: { requestedRuntime: 'codex' },
    }, new Date('2026-05-19T00:01:00Z'));

    const result = assessRuntimeHealthFromVerdictFiles('codex', root, 0, 10);
    assert.equal(result?.HEALTHY, 'true');
    assert.equal(result?.REASON, 'phase-verification-passed');
    assert.equal(result?.VERDICT_PATH, finalPath);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runtime health keeps newer runtime blocker when same-phase passed verdict is older', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verification-verdict-state-'));
  try {
    const claudeDir = path.join(root, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });

    writeVerdict(path.join(claudeDir, 'verification-verdict-phase03-final.json'), {
      verdict: 'passed',
      blocking: false,
      phase: { number: 3 },
      runtimeContext: { requestedRuntime: 'codex' },
    }, new Date('2026-05-19T00:00:00Z'));
    writeVerdict(path.join(claudeDir, 'verification-verdict-phase03-blocked.json'), {
      verdict: 'failed',
      blocking: true,
      blockerClass: 'runtime_unavailable',
      blockingReasonCode: 'running-harness-state-mismatch',
      phase: { number: 3 },
      runtimeContext: { requestedRuntime: 'codex' },
    }, new Date('2026-05-19T00:01:00Z'));

    const result = assessRuntimeHealthFromVerdictFiles('codex', root, 0, 10);
    assert.equal(result?.HEALTHY, 'false');
    assert.equal(result?.REASON, 'runtime-structured-verdict-blocked');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runtime health does not clear runtime blocker with passed verdict from different phase', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'verification-verdict-state-'));
  try {
    const claudeDir = path.join(root, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });

    writeVerdict(path.join(claudeDir, 'verification-verdict-phase03-blocked.json'), {
      verdict: 'failed',
      blocking: true,
      blockerClass: 'runtime_unavailable',
      blockingReasonCode: 'running-harness-state-mismatch',
      phase: { number: 3 },
      runtimeContext: { requestedRuntime: 'codex' },
    }, new Date('2026-05-19T00:00:00Z'));
    writeVerdict(path.join(claudeDir, 'verification-verdict-phase04-final.json'), {
      verdict: 'passed',
      blocking: false,
      phase: { number: 4 },
      runtimeContext: { requestedRuntime: 'codex' },
    }, new Date('2026-05-19T00:01:00Z'));

    const result = assessRuntimeHealthFromVerdictFiles('codex', root, 0, 10);
    assert.equal(result?.HEALTHY, 'false');
    assert.equal(result?.REASON, 'runtime-structured-verdict-blocked');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
