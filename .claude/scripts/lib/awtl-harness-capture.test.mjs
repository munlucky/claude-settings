#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createPhaseHarnessCaptureSession,
  normalizeArtifactRefs,
  normalizeRepoRelativePath,
} from './awtl-harness-capture.mjs';

function tempTraceRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'awtl-harness-capture-'));
}

function cleanup(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

test('lifecycle capture preserves ordered semantic events and repo-relative artifacts', async () => {
  const traceRoot = tempTraceRoot();
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'awtl-harness-repo-'));
  const session = createPhaseHarnessCaptureSession({
    traceRoot,
    repoRoot,
    traceId: 'phase-03-native-capture',
    runId: 'run-03',
    taskId: 'phase-03',
    sessionId: 'session-03',
    stage: 'ready/isolate',
    source: 'moonshot-phase-runner',
  });

  try {
    const run = await session.recordRunStarted({
      phaseNum: '3',
      phaseTitle: 'Phase 03: Native Harness Capture (v1)',
      summary: 'run_started',
    });
    const attempt = await session.recordAttemptStarted({
      parentSpanId: run.event.span_id,
      attemptIndex: 1,
      summary: 'attempt_started',
    });
    const span = await session.recordSpanStarted({
      parentSpanId: attempt.event.span_id,
      spanName: 'worker-prompt',
      summary: 'span_started',
    });
    const actionStart = await session.recordActionStarted({
      spanId: span.event.span_id,
      actionName: 'worker-prompt',
      summary: 'action_started',
    });
    const actionCompleted = await session.recordActionCompleted({
      spanId: span.event.span_id,
      actionId: actionStart.event.action_id,
      actionName: 'worker-prompt',
      actionResult: 'exit_code=0',
      exitCode: 0,
      summary: 'action_completed',
    });
    const judge = await session.recordJudgeResult({
      spanId: span.event.span_id,
      actionId: actionCompleted.event.action_id,
      judgeName: 'phase-03-verifier',
      result: 'pass',
      artifactRefs: [
        path.join(repoRoot, 'docs/implementation/harness-native-awtl-rsme-2026-05-06/03-native-harness-capture-v1.md'),
      ],
      detail: 'completion gate passed',
    });
    const memory = await session.recordMemoryRead({
      spanId: span.event.span_id,
      queryHash: 'sha256:abc123',
      nodeIds: ['node-1', 'node-2'],
      tags: ['phase-03', 'capture'],
      scope: 'execute',
      resultCount: 2,
      summary: 'memory_read',
    });
    const reconciliation = await session.recordFileReconciliation({
      spanId: span.event.span_id,
      artifactRefs: [
        path.join(repoRoot, 'docs/implementation/harness-native-awtl-rsme-2026-05-06/03-native-harness-capture-v1.md'),
        '.claude/scripts/lib/awtl-harness-capture.mjs',
      ],
      reconcileMode: 'git-diff-name-only',
      summary: 'file_reconciliation',
    });
    const privacy = await session.recordPrivacyEvent({
      spanId: span.event.span_id,
      privacyEvent: 'redaction',
      redactionMode: 'hash',
      detailHash: 'sha256:def456',
      summary: 'privacy_event',
    });
    const completed = await session.recordRunCompleted({
      summary: 'run_completed',
      completionStatus: 'completed',
    });

    assert.ok(run.ok);
    assert.ok(attempt.ok);
    assert.ok(span.ok);
    assert.ok(actionStart.ok);
    assert.ok(actionCompleted.ok);
    assert.ok(judge.ok);
    assert.ok(memory.ok);
    assert.ok(reconciliation.ok);
    assert.ok(privacy.ok);
    assert.ok(completed.ok);

    const events = fs
      .readFileSync(session.paths.canonicalPath, 'utf8')
      .trim()
      .split(/\r?\n/)
      .map((line) => JSON.parse(line));

    assert.deepEqual(events.map((event) => event.payload.lifecycle_event), [
      'run_started',
      'attempt_started',
      'span_started',
      'action_started',
      'action_completed',
      'judge_result',
      'memory_read',
      'file_reconciliation',
      'privacy_event',
      'run_completed',
    ]);
    assert.ok(events.some((event) => event.event_type === 'judge_result' && event.action_id === actionCompleted.event.action_id));
    assert.ok(!JSON.stringify(events).includes('classified memory note'));
    assert.ok(!JSON.stringify(events).includes(`${path.sep}tmp${path.sep}`));
    assert.ok(events.find((event) => event.event_type === 'artifact_ref').payload.artifact_refs.every((ref) => !ref.startsWith('/')));
    assert.equal(normalizeRepoRelativePath(path.join(repoRoot, 'docs/example.md'), repoRoot), 'docs/example.md');
    assert.deepEqual(normalizeArtifactRefs([
      path.join(repoRoot, 'docs/example.md'),
      '/tmp/not-allowed.md',
      '../escape.md',
    ], repoRoot), ['docs/example.md']);
  } finally {
    cleanup(traceRoot);
    cleanup(repoRoot);
  }
});
