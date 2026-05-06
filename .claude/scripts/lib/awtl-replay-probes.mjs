#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const REQUIRED_PROBE_NAMES = ['easy', 'hard', 'regression'];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : fallback;
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const text = toText(value, '');
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    output.push(text);
  }
  return output;
}

function normalizeProbeName(value, fallback = 'probe') {
  const text = toText(value, fallback).toLowerCase();
  if (text.includes('easy')) return 'easy';
  if (text.includes('hard')) return 'hard';
  if (text.includes('regress')) return 'regression';
  return text || fallback;
}

function normalizeProbeStatus(value) {
  const text = toText(value, 'unknown').toLowerCase();
  if (['pass', 'passed', 'ok', 'success', 'succeeded', 'clean_pass'].includes(text)) {
    return 'passed';
  }
  if (['fail', 'failed', 'error', 'broken'].includes(text)) {
    return 'failed';
  }
  if (['blocked', 'blocked_by_gate'].includes(text)) {
    return 'blocked';
  }
  if (['worse', 'worsened', 'regressed', 'regression', 'regression_worsened'].includes(text)) {
    return 'worsened';
  }
  if (['pending', 'unknown', 'missing', 'skipped'].includes(text)) {
    return text;
  }
  return text;
}

function probeObservedAt(entry = {}) {
  return toText(entry.observed_at ?? entry.observedAt ?? entry.created_at ?? entry.createdAt, '');
}

function probeDetail(entry = {}) {
  return toText(entry.detail ?? entry.result_detail ?? entry.signal ?? entry.expected_signal ?? entry.note, '');
}

function probeDelta(entry = {}) {
  const candidates = [
    entry.score_delta,
    entry.scoreDelta,
    entry.regression_delta,
    entry.regressionDelta,
    entry.delta,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      return candidate;
    }
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

export function normalizeReplayProbeResult(entry = {}, fallbackName = 'probe') {
  if (typeof entry === 'string') {
    return {
      name: normalizeProbeName(fallbackName, fallbackName),
      status: normalizeProbeStatus(entry),
      detail: '',
      evidence_refs: [],
      observed_at: '',
      regression_delta: null,
      worsened: ['failed', 'blocked', 'worsened'].includes(normalizeProbeStatus(entry)),
    };
  }

  const name = normalizeProbeName(entry.name ?? entry.probe_name ?? entry.probeName ?? fallbackName, fallbackName);
  const status = normalizeProbeStatus(entry.status ?? entry.result ?? entry.outcome ?? entry.signal ?? entry.verdict);
  const delta = probeDelta(entry);
  const explicitWorsened = entry.worsened ?? entry.regression_worsened ?? entry.regressionWorsened;
  const worsened = Boolean(
    explicitWorsened === true
      || (typeof delta === 'number' && delta > 0)
      || ['failed', 'blocked', 'worsened'].includes(status),
  );

  return {
    name,
    status,
    detail: probeDetail(entry),
    evidence_refs: uniqueStrings(entry.evidence_refs ?? entry.evidenceRefs ?? entry.artifact_refs ?? entry.artifactRefs ?? []),
    observed_at: probeObservedAt(entry),
    regression_delta: delta,
    worsened,
  };
}

export function buildReplayProbeManifest(input = {}) {
  const probes = [];
  if (Array.isArray(input.probes)) {
    for (const entry of input.probes) {
      probes.push(normalizeReplayProbeResult(entry, entry?.name ?? 'probe'));
    }
  } else {
    const source = isPlainObject(input) ? input : {};
    probes.push(normalizeReplayProbeResult(source.easy ?? source.easy_probe ?? source.easyProbe ?? {}, 'easy'));
    probes.push(normalizeReplayProbeResult(source.hard ?? source.hard_probe ?? source.hardProbe ?? {}, 'hard'));
    probes.push(normalizeReplayProbeResult(source.regression ?? source.regression_probe ?? source.regressionProbe ?? {}, 'regression'));
  }

  const normalizedProbes = [];
  const seen = new Set();
  for (const probe of probes) {
    const name = normalizeProbeName(probe.name, 'probe');
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    normalizedProbes.push({
      ...probe,
      name,
    });
  }

  for (const requiredName of REQUIRED_PROBE_NAMES) {
    if (!seen.has(requiredName)) {
      normalizedProbes.push({
        name: requiredName,
        status: 'pending',
        detail: '',
        evidence_refs: [],
        observed_at: '',
        regression_delta: null,
        worsened: false,
      });
    }
  }

  const candidateId = toText(input.candidate_id ?? input.candidateId, '');
  const runId = toText(input.run_id ?? input.runId, '');
  const traceId = toText(input.trace_id ?? input.traceId, '');
  const sourceActionIds = uniqueStrings(input.source_action_ids ?? input.sourceActionIds ?? []);

  return {
    schema_version: 1,
    candidate_id: candidateId,
    run_id: runId,
    trace_id: traceId,
    source_action_ids: sourceActionIds,
    probes: normalizedProbes,
  };
}

export function manifestHasRegressionWorsening(manifest = {}) {
  const normalized = buildReplayProbeManifest(manifest);
  const regression = normalized.probes.find((probe) => probe.name === 'regression');
  if (!regression) {
    return false;
  }
  if (regression.worsened) {
    return true;
  }
  if (['failed', 'blocked', 'worsened'].includes(regression.status)) {
    return true;
  }
  if (typeof regression.regression_delta === 'number' && regression.regression_delta > 0) {
    return true;
  }
  const detail = toText(regression.detail, '').toLowerCase();
  return /\b(worse|worsened|regress|regression)\b/.test(detail);
}

export function assessReplayProbeManifest(input = {}) {
  const manifest = buildReplayProbeManifest(input);
  const blockingReasons = [];
  const probeStatuses = {};

  for (const probe of manifest.probes) {
    probeStatuses[probe.name] = probe.status;
  }

  const regressionWorsened = manifestHasRegressionWorsening(manifest);
  const requiredStatuses = REQUIRED_PROBE_NAMES.map((name) => probeStatuses[name] ?? 'pending');
  const missingRequiredProbe = REQUIRED_PROBE_NAMES.some((name) => !manifest.probes.some((probe) => probe.name === name));

  for (const requiredName of REQUIRED_PROBE_NAMES) {
    const probe = manifest.probes.find((entry) => entry.name === requiredName);
    if (!probe) {
      blockingReasons.push(`missing ${requiredName} replay probe`);
      continue;
    }
    if (['pending', 'unknown', 'missing'].includes(probe.status)) {
      blockingReasons.push(`${requiredName} replay probe is incomplete`);
    } else if (probe.status === 'failed' || probe.status === 'blocked') {
      blockingReasons.push(`${requiredName} replay probe failed`);
    }
  }

  if (regressionWorsened) {
    blockingReasons.push('regression replay probe worsened');
  }

  let status = 'passed';
  if (blockingReasons.some((reason) => /worsened|failed|blocked/.test(reason))) {
    status = 'blocked';
  } else if (blockingReasons.some((reason) => /incomplete|missing/.test(reason))) {
    status = 'needs_more_evidence';
  }

  if (missingRequiredProbe && status === 'passed') {
    status = 'needs_more_evidence';
  }

  return {
    ok: status === 'passed',
    status,
    blocking_reasons: uniqueStrings(blockingReasons),
    probe_statuses: probeStatuses,
    regression_worsened: regressionWorsened,
    required_probe_statuses: requiredStatuses,
    manifest,
  };
}

export function readReplayProbeManifest(filePath) {
  const text = fs.readFileSync(path.resolve(filePath), 'utf8');
  return buildReplayProbeManifest(JSON.parse(text));
}
