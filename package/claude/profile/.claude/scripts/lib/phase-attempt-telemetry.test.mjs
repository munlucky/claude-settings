import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  readPhaseAttemptTelemetry,
  summarizeTimingBuckets,
} from './phase-attempt-telemetry.mjs';

test('telemetry derives runner timing from manifest events', () => {
  const telemetry = readPhaseAttemptTelemetry({
    manifest: {
      runnerStartedAt: '2026-05-12T00:00:00.000Z',
      runnerFinishedAt: '2026-05-12T00:00:99.000Z',
      events: [
        { eventType: 'manifest.intent', timestamp: '2026-05-12T00:00:10.000Z' },
        { eventType: 'child.started', timestamp: '2026-05-12T00:00:12.000Z' },
        { eventType: 'manifest.exit', timestamp: '2026-05-12T00:00:40.000Z' },
      ],
    },
  });

  assert.equal(telemetry.source, 'manifest_events');
  assert.equal(telemetry.runnerStartedAt, '2026-05-12T00:00:10.000Z');
  assert.equal(telemetry.runnerFinishedAt, '2026-05-12T00:00:40.000Z');
  assert.equal(telemetry.runnerActiveSeconds, 30);
  assert.equal(telemetry.workerStartupSeconds, 2);
});

test('telemetry counts verification and closeout events into wall-clock buckets', () => {
  const telemetry = readPhaseAttemptTelemetry({
    manifest: {
      events: [
        { eventType: 'manifest.intent', timestamp: '2026-05-12T00:00:00.000Z' },
        { eventType: 'child.started', timestamp: '2026-05-12T00:00:03.000Z' },
        { eventType: 'verification.started', timestamp: '2026-05-12T00:00:10.000Z' },
        { eventType: 'verification.finished', timestamp: '2026-05-12T00:00:18.000Z' },
        { eventType: 'runtime_fallback.started', timestamp: '2026-05-12T00:00:20.000Z' },
        { eventType: 'runtime_fallback.finished', timestamp: '2026-05-12T00:00:25.000Z' },
        { eventType: 'closeout.started', timestamp: '2026-05-12T00:00:30.000Z' },
        { eventType: 'closeout.finished', timestamp: '2026-05-12T00:00:36.000Z' },
        { eventType: 'manifest.exit', timestamp: '2026-05-12T00:00:40.000Z' },
      ],
    },
  });

  assert.equal(telemetry.verificationSeconds, 8);
  assert.equal(telemetry.closeoutSeconds, 6);
  assert.equal(telemetry.runtimeFallbackSeconds, 5);
  assert.equal(telemetry.timingBuckets.buckets.workerStartupSeconds, 3);
  assert.equal(telemetry.timingBuckets.withinTolerance, true);
});

test('timing bucket summary fills residual wall time as idle wait', () => {
  const summary = summarizeTimingBuckets({
    wallClockSeconds: 20,
    workerStartupSeconds: 2,
    workerActiveSeconds: 8,
    verificationSeconds: 4,
    closeoutSeconds: 3,
  });

  assert.equal(summary.buckets.idleWaitSeconds, 3);
  assert.equal(summary.bucketTotalSeconds, 20);
  assert.equal(summary.withinTolerance, true);
});

test('telemetry derives cache hit and miss signals from event fields', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-attempt-telemetry-'));
  try {
    const heartbeatPath = path.join(root, 'attempt-heartbeat.jsonl');
    fs.writeFileSync(heartbeatPath, [
      JSON.stringify({ eventType: 'heartbeat', timestamp: '2026-05-12T00:00:11.000Z', payload: { cacheStatus: 'hit' } }),
      JSON.stringify({ eventType: 'heartbeat', timestamp: '2026-05-12T00:00:12.000Z', payload: { cacheResult: 'miss' } }),
      '',
    ].join('\n'), 'utf8');

    const telemetry = readPhaseAttemptTelemetry({
      heartbeatPath,
      events: [
        { eventType: 'runner.started', timestamp: '2026-05-12T00:00:10.000Z', payload: { cache: 'cache_hit' } },
      ],
    });

    assert.deepEqual(telemetry.cache.signals, ['hit', 'hit', 'miss']);
    assert.equal(telemetry.cache.hits, 2);
    assert.equal(telemetry.cache.misses, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
