#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_STATUS_FILE = '.claude/docs/phase-status.yaml';
const WORKFLOW_LOG_DIR = process.env.WORKFLOW_ENFORCEMENT_LOG_DIR || '.claude/logs/workflow-enforcement';
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

function capabilityKey(entry = {}) {
  const code = normalizeText(entry.code);
  const fingerprint = normalizeText(entry.fingerprint);
  const strict = normalizeText(entry.strict);
  const source = normalizeText(entry.source);
  return [
    code,
    fingerprint || source,
    strict,
  ].join('|');
}

function normalizeEntry(entry = {}, fallback = {}) {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  return {
    code: normalizeText(entry.code || fallback.code),
    fingerprint: normalizeText(entry.fingerprint || fallback.fingerprint),
    source: normalizeText(fallback.source || entry.source),
    firstSeenAt: normalizeText(fallback.firstSeenAt || entry.firstSeenAt || now),
    lastSeenAt: normalizeText(entry.lastSeenAt || now),
    evidencePath: normalizeText(fallback.evidencePath || entry.evidencePath),
    strict: normalizeText(entry.strict || fallback.strict),
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
    return true;
  });
}

export function recordUnavailableCapability(statusFile, entry = {}) {
  const files = resolveRunCacheFiles(statusFile);
  const current = readJson(files.currentRunFile) || {};
  const existing = flattenCapabilities(current).map((item) => normalizeEntry(item));
  const normalized = normalizeEntry(entry);
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
