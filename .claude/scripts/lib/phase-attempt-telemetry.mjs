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
  const cacheEvents = allEvents
    .map((event) => normalizeCacheSignal(eventField(event, 'cache') || eventField(event, 'cacheStatus') || eventField(event, 'cacheResult')))
    .filter(Boolean);

  return {
    source: 'manifest_events',
    eventCount: allEvents.length,
    runnerStartedAt: runnerStarted?.timestamp || manifest?.runnerStartedAt || '',
    childStartedAt: childStarted?.timestamp || manifest?.childProcessStartTime || '',
    runnerFinishedAt: runnerFinished?.timestamp || manifest?.runnerFinishedAt || '',
    runnerActiveSeconds: durationSeconds(
      runnerStarted?.timestamp || manifest?.runnerStartedAt,
      runnerFinished?.timestamp || manifest?.runnerFinishedAt,
    ),
    workerStartupSeconds: durationSeconds(
      runnerStarted?.timestamp || manifest?.runnerStartedAt,
      childStarted?.timestamp || manifest?.childProcessStartTime,
    ),
    cache: {
      hits: cacheEvents.filter((signal) => signal === 'hit').length,
      misses: cacheEvents.filter((signal) => signal === 'miss').length,
      signals: cacheEvents,
    },
  };
}

