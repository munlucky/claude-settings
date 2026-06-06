#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { resolveRuntimeStatePath, runtimeStateRelativePath } from './runtime-state-root.mjs';

const DEFAULT_STATUS_FILE = resolveRuntimeStatePath('docs', 'phase-status.yaml');
const WORKFLOW_LOG_DIR = process.env.WORKFLOW_ENFORCEMENT_LOG_DIR || runtimeStateRelativePath('logs', 'workflow-enforcement');
const ACTIVE_RUN_BASENAME = 'active-phase-run.json';
const CURRENT_RUN_BASENAME = 'current-run.json';

function resolveStatusFile(statusFile = DEFAULT_STATUS_FILE) {
  return path.resolve(statusFile || DEFAULT_STATUS_FILE);
}

function statusFileHash(statusFile) {
  return crypto.createHash('sha1').update(resolveStatusFile(statusFile)).digest('hex').slice(0, 12);
}

export function resolveRunCacheFiles(statusFile = DEFAULT_STATUS_FILE) {
  const resolvedStatusFile = resolveStatusFile(statusFile);
  if (resolvedStatusFile === resolveStatusFile(DEFAULT_STATUS_FILE)) {
    return {
      activeRunFile: path.join(WORKFLOW_LOG_DIR, ACTIVE_RUN_BASENAME),
      currentRunFile: path.join(WORKFLOW_LOG_DIR, CURRENT_RUN_BASENAME),
      mirrorGlobalCurrentRun: true,
    };
  }

  const suffix = statusFileHash(resolvedStatusFile);
  return {
    activeRunFile: path.join(WORKFLOW_LOG_DIR, `active-phase-run-${suffix}.json`),
    currentRunFile: path.join(WORKFLOW_LOG_DIR, `current-run-${suffix}.json`),
    mirrorGlobalCurrentRun: false,
  };
}

export function readJson(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function hashText(value) {
  return crypto.createHash('sha1').update(String(value ?? '')).digest('hex');
}

function hashFileOrDirectory(targetPath) {
  const resolved = path.resolve(targetPath || '');
  if (!targetPath || !fs.existsSync(resolved)) {
    return hashText(resolved || 'missing').slice(0, 16);
  }
  const stat = fs.statSync(resolved);
  if (stat.isFile()) {
    return hashText(fs.readFileSync(resolved)).slice(0, 16);
  }
  if (!stat.isDirectory()) {
    return hashText(`${resolved}:${stat.size}:${stat.mtimeMs}`).slice(0, 16);
  }
  const entries = [];
  const stack = [resolved];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const candidate = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(candidate);
      } else if (entry.isFile()) {
        const relative = path.relative(resolved, candidate).replace(/\\/g, '/');
        entries.push(`${relative}:${hashText(fs.readFileSync(candidate))}`);
      }
    }
  }
  return hashText(entries.sort().join('\n')).slice(0, 16);
}

function isoNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function currentRunId(fallback = {}) {
  return normalizeText(
    fallback.runId
      || fallback.stateRunId
      || fallback.activeRunLeaseId
      || process.env.PHASE_RUN_ID
      || process.env.MOONSHOT_RUN_ID
      || process.env.AGENT_LOOP_RUN_ID
      || 'unknown',
  );
}

function currentCheckId(entry = {}, fallback = {}) {
  return normalizeText(entry.checkId || fallback.checkId || entry.source || fallback.source || entry.code || fallback.code || 'capability-check');
}

function capabilityKey(entry = {}) {
  const code = normalizeText(entry.code);
  const capability = normalizeText(entry.capability);
  const fingerprint = normalizeText(entry.fingerprint);
  const strict = normalizeText(entry.strict);
  const source = normalizeText(entry.source);
  const runId = normalizeText(entry.runId);
  return [
    capability || code,
    fingerprint || source,
    strict,
    runId,
    normalizeText(entry.status),
  ].join('|');
}

function normalizeEntry(entry = {}, fallback = {}) {
  const now = isoNow();
  const code = normalizeText(entry.code || fallback.code);
  const capability = normalizeText(entry.capability || fallback.capability || (code === 'memorygraph_unavailable' ? 'memorygraph' : code));
  const strict = normalizeText(entry.strict || fallback.strict);
  const runId = currentRunId({ runId: entry.runId || fallback.runId });
  const observedAt = normalizeText(entry.observedAt || fallback.observedAt || entry.lastSeenAt || fallback.lastSeenAt || now);
  const status = normalizeText(entry.status || fallback.status || 'unavailable');
  return {
    capability,
    code,
    fingerprint: normalizeText(entry.fingerprint || fallback.fingerprint),
    source: normalizeText(fallback.source || entry.source),
    firstSeenAt: normalizeText(fallback.firstSeenAt || entry.firstSeenAt || now),
    lastSeenAt: normalizeText(entry.lastSeenAt || now),
    observedAt,
    runId,
    checkId: currentCheckId(entry, fallback),
    status,
    evidencePath: normalizeText(fallback.evidencePath || entry.evidencePath),
    strict,
    lastHealthyAt: normalizeText(entry.lastHealthyAt || fallback.lastHealthyAt),
    lastUnavailableAt: normalizeText(entry.lastUnavailableAt || fallback.lastUnavailableAt || (status === 'unavailable' ? observedAt : '')),
    freshnessState: normalizeText(entry.freshnessState || fallback.freshnessState || (status === 'unavailable' ? 'current' : status === 'healthy' ? 'current' : 'stale')),
    decayReason: normalizeText(entry.decayReason || fallback.decayReason),
    decayedAt: normalizeText(entry.decayedAt || fallback.decayedAt),
  };
}

function flattenCapabilities(payload) {
  const direct = Array.isArray(payload?.unavailableCapabilities) ? payload.unavailableCapabilities : [];
  const lease = Array.isArray(payload?.phaseRunLease?.unavailableCapabilities) ? payload.phaseRunLease.unavailableCapabilities : [];
  return [...direct, ...lease].filter(Boolean);
}

export function readUnavailableCapabilities(statusFile = DEFAULT_STATUS_FILE) {
  const { currentRunFile } = resolveRunCacheFiles(statusFile);
  const current = readJson(currentRunFile);
  const unique = new Map();
  for (const entry of flattenCapabilities(current)) {
    const normalized = normalizeEntry(entry);
    const currentState = normalized.runId === currentRunId(current) || normalized.runId === 'unknown';
    if (!currentState && normalized.strict !== 'true' && normalized.status === 'unavailable') {
      normalized.status = 'stale';
      normalized.freshnessState = 'stale';
      normalized.decayReason = normalized.decayReason || 'new_run';
      normalized.decayedAt = normalized.decayedAt || isoNow();
    }
    unique.set(capabilityKey(normalized), normalized);
  }
  return [...unique.values()];
}

export function summarizeUnavailableCapabilities(entries = []) {
  return entries
    .map((entry) => `${entry.code || 'unknown'}${entry.strict ? `:${entry.strict}` : ''}${entry.source ? `@${entry.source}` : ''}`)
    .filter(Boolean)
    .join(', ');
}

export function hasUnavailableCapability(statusFile, query = {}) {
  const entries = readUnavailableCapabilities(statusFile);
  const targetCode = normalizeText(query.code);
  const targetFingerprint = normalizeText(query.fingerprint);
  const targetStrict = normalizeText(query.strict);
  if (!targetCode && !targetFingerprint) {
    return false;
  }
  return entries.some((entry) => {
    if (targetCode && normalizeText(entry.code) !== targetCode) {
      return false;
    }
    if (targetStrict && normalizeText(entry.strict) !== targetStrict) {
      return false;
    }
    if (targetFingerprint && normalizeText(entry.fingerprint) && normalizeText(entry.fingerprint) !== targetFingerprint) {
      return false;
    }
    return normalizeText(entry.status || 'unavailable') === 'unavailable'
      && normalizeText(entry.freshnessState || 'current') === 'current';
  });
}

export function recordUnavailableCapability(statusFile, entry = {}) {
  const files = resolveRunCacheFiles(statusFile);
  const current = readJson(files.currentRunFile) || {};
  const existing = flattenCapabilities(current).map((item) => normalizeEntry(item));
  const normalized = normalizeEntry({
    ...entry,
    status: entry.status || 'unavailable',
    freshnessState: entry.freshnessState || 'current',
    lastUnavailableAt: entry.lastUnavailableAt || entry.observedAt || isoNow(),
  });
  const next = new Map(existing.map((item) => [capabilityKey(item), item]));
  const key = capabilityKey(normalized);
  const prior = next.get(key);
  next.set(key, normalizeEntry(normalized, prior || normalized));
  const unavailableCapabilities = [...next.values()].sort((left, right) => {
    const leftFirst = normalizeText(left.firstSeenAt);
    const rightFirst = normalizeText(right.firstSeenAt);
    return leftFirst.localeCompare(rightFirst);
  });

  const nextPayload = {
    ...current,
    updatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    unavailableCapabilities,
    phaseRunLease: {
      ...(current.phaseRunLease && typeof current.phaseRunLease === 'object' ? current.phaseRunLease : {}),
      unavailableCapabilities,
    },
  };

  writeJson(files.currentRunFile, nextPayload);
  const active = readJson(files.activeRunFile) || {};
  writeJson(files.activeRunFile, {
    ...active,
    unavailableCapabilities,
  });

  if (files.mirrorGlobalCurrentRun) {
    return nextPayload;
  }

  return nextPayload;
}

export function recordHealthyCapability(statusFile, entry = {}) {
  const files = resolveRunCacheFiles(statusFile);
  const current = readJson(files.currentRunFile) || {};
  const observedAt = normalizeText(entry.observedAt || isoNow());
  const capability = normalizeText(entry.capability || (entry.code === 'memorygraph_unavailable' ? 'memorygraph' : entry.code) || 'memorygraph');
  const runId = currentRunId({ runId: entry.runId || current.runId || current.stateRunId });
  const existing = flattenCapabilities(current).map((item) => normalizeEntry(item));
  const nextEntries = existing.map((item) => {
    if (
      normalizeText(item.capability || item.code) === capability
      && normalizeText(item.runId || 'unknown') === runId
      && normalizeText(item.status || 'unavailable') === 'unavailable'
    ) {
      return normalizeEntry({
        ...item,
        status: 'superseded',
        freshnessState: 'recovered',
        decayReason: 'healthy_probe',
        decayedAt: observedAt,
        lastHealthyAt: observedAt,
      });
    }
    return item;
  });
  const healthy = normalizeEntry({
    capability,
    code: entry.code || `${capability}_healthy`,
    fingerprint: entry.fingerprint,
    source: entry.source || `${capability}.health`,
    strict: entry.strict,
    observedAt,
    runId,
    checkId: entry.checkId || `${capability}.health`,
    status: 'healthy',
    freshnessState: 'current',
    decayReason: 'healthy_probe',
    lastHealthyAt: observedAt,
  });
  const next = new Map(nextEntries.map((item) => [capabilityKey(item), item]));
  next.set(capabilityKey(healthy), healthy);
  const unavailableCapabilities = [...next.values()].sort((left, right) => {
    const leftFirst = normalizeText(left.firstSeenAt);
    const rightFirst = normalizeText(right.firstSeenAt);
    return leftFirst.localeCompare(rightFirst);
  });

  const nextPayload = {
    ...current,
    updatedAt: observedAt,
    unavailableCapabilities,
    phaseRunLease: {
      ...(current.phaseRunLease && typeof current.phaseRunLease === 'object' ? current.phaseRunLease : {}),
      unavailableCapabilities,
    },
  };

  writeJson(files.currentRunFile, nextPayload);
  const active = readJson(files.activeRunFile) || {};
  writeJson(files.activeRunFile, {
    ...active,
    unavailableCapabilities,
  });
  return nextPayload;
}

export function knownUnavailableSummary(statusFile = DEFAULT_STATUS_FILE, query = {}) {
  const entries = readUnavailableCapabilities(statusFile);
  if (!entries.length) {
    return '';
  }
  const matches = query.code
    ? entries.filter((entry) => normalizeText(entry.code) === normalizeText(query.code))
    : entries;
  return summarizeUnavailableCapabilities(matches);
}

export function buildPhaseRuntimeParityTimeoutKey({
  runId = '',
  verifierId = 'phaseRuntimeParity',
  referencePlanHash = '',
  referencePlanPath = '.moonshot-relay/docs/runtime-parity-reference-plan',
  runtimeTarget = '',
} = {}) {
  return [
    normalizeText(runId) || 'unknown-run',
    normalizeText(verifierId) || 'phaseRuntimeParity',
    normalizeText(referencePlanHash) || hashFileOrDirectory(referencePlanPath),
    normalizeText(runtimeTarget) || 'current',
  ].join('|');
}

export function hasPhaseRuntimeParityTimeout(statusFile = DEFAULT_STATUS_FILE, input = {}) {
  return hasUnavailableCapability(statusFile, {
    code: 'phaseRuntimeParity_timeout',
    fingerprint: buildPhaseRuntimeParityTimeoutKey(input),
    strict: 'true',
  });
}

export function recordPhaseRuntimeParityTimeout(statusFile = DEFAULT_STATUS_FILE, input = {}) {
  const fingerprint = buildPhaseRuntimeParityTimeoutKey(input);
  return recordUnavailableCapability(statusFile, {
    capability: 'phaseRuntimeParity',
    code: 'phaseRuntimeParity_timeout',
    fingerprint,
    source: 'phaseRuntimeParity.required_runtime',
    strict: 'true',
    runId: input.runId,
    checkId: input.verifierId || 'phaseRuntimeParity',
    evidencePath: input.evidencePath || '',
    status: 'unavailable',
    freshnessState: 'current',
  });
}
