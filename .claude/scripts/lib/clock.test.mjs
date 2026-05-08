import assert from 'node:assert/strict';
import test from 'node:test';

import { createClock, nowIso } from './clock.mjs';

test('nowIso uses an injected clock instead of wall clock time', () => {
  const clock = createClock(() => new Date('2026-05-08T12:00:00.000Z'));

  assert.equal(nowIso(clock), '2026-05-08T12:00:00.000Z');
});

test('future timestamp validation is deterministic against injected now', () => {
  const clock = createClock(() => new Date('2026-05-08T12:00:00.000Z'));

  assert.equal(clock.isFutureIso('2026-05-08T12:00:04.999Z'), false);
  assert.equal(clock.isFutureIso('2026-05-08T12:00:05.001Z'), true);
});
