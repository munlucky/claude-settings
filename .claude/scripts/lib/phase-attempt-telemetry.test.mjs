import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { readPhaseAttemptTelemetry } from './phase-attempt-telemetry.mjs';

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
