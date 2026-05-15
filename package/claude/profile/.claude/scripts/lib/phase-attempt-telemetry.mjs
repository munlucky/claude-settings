import fs from 'node:fs';

function parseTimestamp(value) {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function readJsonLines(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return [];
  }
  return fs.readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function eventField(event, name) {
  return event?.[name] ?? event?.payload?.[name];
}

function firstEvent(events, predicate) {
  return events.find(predicate) || null;
}

function lastEvent(events, predicate) {
  return [...events].reverse().find(predicate) || null;
}

function durationSeconds(start, end) {
  const startedAt = parseTimestamp(start);
  const endedAt = parseTimestamp(end);
  if (startedAt === null || endedAt === null || endedAt < startedAt) {
    return null;
  }
  return (endedAt - startedAt) / 1000;
}

function numericSeconds(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function eventTimestamp(event) {
  return event?.timestamp || event?.payload?.timestamp || '';
}

function pairedDurationSeconds(events, startTypes, endTypes) {
  let total = 0;
  let openStart = null;
  for (const event of events) {
    if (startTypes.has(event.eventType)) {
      openStart = eventTimestamp(event);
      continue;
    }
    if (openStart && endTypes.has(event.eventType)) {
      total += numericSeconds(durationSeconds(openStart, eventTimestamp(event)));
      openStart = null;
    }
  }
  return total;
}

function bucketValue(source, fieldName) {
  return numericSeconds(source?.[fieldName] ?? source?.timing?.[fieldName]);
}

export function summarizeTimingBuckets(timing = {}) {
  const wallClockSeconds = bucketValue(timing, 'wallClockSeconds') || bucketValue(timing, 'runnerActiveSeconds');
  const workerStartupSeconds = bucketValue(timing, 'workerStartupSeconds');
  const verificationSeconds = bucketValue(timing, 'verificationSeconds');
  const closeoutSeconds = bucketValue(timing, 'closeoutSeconds') || bucketValue(timing, 'manualCloseoutSeconds');
  const runtimeFallbackSeconds = bucketValue(timing, 'runtimeFallbackSeconds');
  const explicitIdleWaitSeconds = bucketValue(timing, 'idleWaitSeconds');
  const workerActiveSeconds = bucketValue(timing, 'workerActiveSeconds');
  const knownWithoutIdle = workerStartupSeconds + workerActiveSeconds + verificationSeconds + closeoutSeconds + runtimeFallbackSeconds;
  const idleWaitSeconds = explicitIdleWaitSeconds || Math.max(wallClockSeconds - knownWithoutIdle, 0);
  const buckets = {
    workerStartupSeconds,
    workerActiveSeconds,
    verificationSeconds,
    closeoutSeconds,
    idleWaitSeconds,
    runtimeFallbackSeconds,
  };
  const bucketTotalSeconds = Object.values(buckets).reduce((sum, value) => sum + value, 0);
  const driftSeconds = wallClockSeconds > 0 ? Math.abs(bucketTotalSeconds - wallClockSeconds) : 0;
  const dominantBucket = Object.entries(buckets)
    .sort((left, right) => right[1] - left[1])[0]?.[0] || '';
  return {
    wallClockSeconds,
    buckets,
    bucketTotalSeconds,
    driftSeconds,
    withinTolerance: wallClockSeconds === 0 || driftSeconds <= Math.max(1, wallClockSeconds * 0.05),
    dominantBucket,
  };
}

export function buildBottleneckWarnings(timing = {}, { thresholdSeconds = 60, ratio = 0.75 } = {}) {
  const summary = summarizeTimingBuckets(timing);
  const dominantValue = summary.buckets[summary.dominantBucket] || 0;
  if (summary.wallClockSeconds <= thresholdSeconds || dominantValue / summary.wallClockSeconds < ratio) {
    return [];
  }
  return [`phase_attempt_bottleneck:${summary.dominantBucket}:${dominantValue}s_of_${summary.wallClockSeconds}s`];
}

function normalizeCacheSignal(value) {
  const text = String(value || '').trim().toLowerCase();
  if (['hit', 'cache_hit', 'true'].includes(text)) {
    return 'hit';
  }
  if (['miss', 'cache_miss', 'false'].includes(text)) {
    return 'miss';
  }
  return '';
}

export function readPhaseAttemptTelemetry({ manifest, heartbeatPath = '', events = [] } = {}) {
  const manifestEvents = Array.isArray(manifest?.events) ? manifest.events : [];
  const heartbeatEvents = Array.isArray(events) ? events : [];
  const allEvents = [...manifestEvents, ...heartbeatEvents, ...readJsonLines(heartbeatPath)]
    .sort((left, right) => (parseTimestamp(left.timestamp) ?? 0) - (parseTimestamp(right.timestamp) ?? 0));

  const runnerStarted = firstEvent(allEvents, (event) => (
    event.eventType === 'runner.started' || event.eventType === 'manifest.intent'
  ));
  const childStarted = firstEvent(allEvents, (event) => (
    event.eventType === 'child.started' || event.eventType === 'worker.started'
  ));
  const runnerFinished = lastEvent(allEvents, (event) => (
    event.eventType === 'runner.finished' || event.eventType === 'manifest.exit'
  ));
  const runnerActiveSeconds = durationSeconds(
    runnerStarted?.timestamp || manifest?.runnerStartedAt,
    runnerFinished?.timestamp || manifest?.runnerFinishedAt,
  );
  const workerStartupSeconds = durationSeconds(
    runnerStarted?.timestamp || manifest?.runnerStartedAt,
    childStarted?.timestamp || manifest?.childProcessStartTime,
  );
  const verificationSeconds = bucketValue(manifest, 'verificationSeconds') || pairedDurationSeconds(
    allEvents,
    new Set(['verification.started', 'verifier.started', 'verify.started']),
    new Set(['verification.finished', 'verifier.finished', 'verify.finished']),
  );
  const closeoutSeconds = bucketValue(manifest, 'closeoutSeconds') || bucketValue(manifest, 'manualCloseoutSeconds') || pairedDurationSeconds(
    allEvents,
    new Set(['closeout.started', 'finish.started', 'handoff.started']),
    new Set(['closeout.finished', 'finish.finished', 'handoff.finished']),
  );
  const runtimeFallbackSeconds = bucketValue(manifest, 'runtimeFallbackSeconds') || pairedDurationSeconds(
    allEvents,
    new Set(['runtime_fallback.started', 'fallback.started']),
    new Set(['runtime_fallback.finished', 'fallback.finished']),
  );
  const explicitIdleWaitSeconds = bucketValue(manifest, 'idleWaitSeconds') || pairedDurationSeconds(
    allEvents,
    new Set(['idle_wait.started', 'wait.started']),
    new Set(['idle_wait.finished', 'wait.finished']),
  );
  const workerActiveSeconds = Math.max(
    numericSeconds(durationSeconds(
      childStarted?.timestamp || manifest?.childProcessStartTime,
      runnerFinished?.timestamp || manifest?.runnerFinishedAt,
    )) - verificationSeconds - closeoutSeconds - runtimeFallbackSeconds - explicitIdleWaitSeconds,
    0,
  );
  const timingInput = {
    wallClockSeconds: numericSeconds(runnerActiveSeconds),
    workerStartupSeconds: numericSeconds(workerStartupSeconds),
    workerActiveSeconds,
    verificationSeconds,
    closeoutSeconds,
    idleWaitSeconds: explicitIdleWaitSeconds,
    runtimeFallbackSeconds,
  };
  const timingSummary = summarizeTimingBuckets(timingInput);
  const cacheEvents = allEvents
    .map((event) => normalizeCacheSignal(eventField(event, 'cache') || eventField(event, 'cacheStatus') || eventField(event, 'cacheResult')))
    .filter(Boolean);

  return {
    source: 'manifest_events',
    eventCount: allEvents.length,
    runnerStartedAt: runnerStarted?.timestamp || manifest?.runnerStartedAt || '',
    childStartedAt: childStarted?.timestamp || manifest?.childProcessStartTime || '',
    runnerFinishedAt: runnerFinished?.timestamp || manifest?.runnerFinishedAt || '',
    runnerActiveSeconds,
    workerStartupSeconds,
    workerActiveSeconds,
    verificationSeconds,
    closeoutSeconds,
    idleWaitSeconds: timingSummary.buckets.idleWaitSeconds,
    runtimeFallbackSeconds,
    timingBuckets: timingSummary,
    bottleneckWarnings: buildBottleneckWarnings(timingInput),
    cache: {
      hits: cacheEvents.filter((signal) => signal === 'hit').length,
      misses: cacheEvents.filter((signal) => signal === 'miss').length,
      signals: cacheEvents,
    },
  };
}
