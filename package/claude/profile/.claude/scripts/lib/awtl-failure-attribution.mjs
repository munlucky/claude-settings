#!/usr/bin/env node

import path from 'node:path';

import { classifyFailure } from './failure-classifier.mjs';
import { compareAwtlEvents } from './awtl-trace-sink.mjs';
import { normalizeArtifactRefs } from './awtl-harness-capture.mjs';

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

function sortByEventOrder(events = []) {
  return [...events].sort((left, right) => compareAwtlEvents(left, right));
}

function eventArtifactRefs(event = {}, repoRoot = process.cwd()) {
  const refs = event?.payload?.artifact_refs ?? event?.payload?.artifactRefs ?? [];
  return normalizeArtifactRefs(Array.isArray(refs) ? refs : [], repoRoot);
}

function eventSourceActionId(event = {}) {
  return toText(event?.payload?.source_action_id ?? event?.payload?.sourceActionId ?? event?.action_id ?? event?.actionId, '');
}

function eventTurnId(event = {}) {
  return toText(event?.turn_id ?? event?.turnId ?? event?.payload?.turn_id ?? event?.payload?.turnId, '');
}

function eventActionIds(event = {}) {
  const ids = [];
  const sourceActionId = eventSourceActionId(event);
  if (sourceActionId) {
    ids.push(sourceActionId);
  }
  const eventActionId = toText(event?.action_id ?? event?.actionId, '');
  if (eventActionId) {
    ids.push(eventActionId);
  }
  return uniqueStrings(ids);
}

function eventNodeIds(event = {}) {
  const nodeIds = event?.payload?.node_ids ?? event?.payload?.nodeIds ?? [];
  return uniqueStrings(Array.isArray(nodeIds) ? nodeIds : []);
}

function eventLabel(event = {}) {
  return toText(event?.payload?.action_name ?? event?.payload?.judge_name ?? event?.summary ?? event?.event_type, '');
}

function isVerifierLike(event = {}) {
  const label = eventLabel(event).toLowerCase();
  return label.includes('verify')
    || label.includes('verifier')
    || label.includes('judge')
    || label.includes('check')
    || label.includes('test')
    || label.includes('policy')
    || label.includes('runner');
}

export function buildFailureClassifierInput(failureEvent = {}) {
  const payload = isPlainObject(failureEvent?.payload) ? failureEvent.payload : {};
  const judgeName = toText(payload.judge_name ?? payload.judgeName, '');
  const detail = toText(payload.detail ?? payload.stdout ?? payload.stderr ?? failureEvent?.summary, '');

  return {
    code: toText(payload.failure_code ?? payload.failureCode, ''),
    failureCode: toText(payload.failure_code ?? payload.failureCode, ''),
    blockingReasonCode: toText(payload.blocking_reason_code ?? payload.blockingReasonCode, ''),
    reason: toText(payload.reason ?? payload.failure_reason, ''),
    name: judgeName || toText(failureEvent?.summary, ''),
    source: judgeName || toText(failureEvent?.summary, ''),
    message: detail,
    detail,
    stdout: toText(payload.stdout, ''),
    stderr: toText(payload.stderr, ''),
    error: toText(payload.error, ''),
    command: toText(payload.command, ''),
    failureClass: toText(payload.failure_class ?? payload.failureClass, ''),
  };
}

function findFailureIndex(events, failureEvent) {
  const byId = events.findIndex((event) => event?.event_id && event.event_id === failureEvent?.event_id);
  if (byId >= 0) {
    return byId;
  }
  return events.findIndex((event) => event === failureEvent);
}

function collectMatchingActions(events, failureIndex, failedArtifactRefs, repoRoot) {
  const prefix = failureIndex >= 0 ? events.slice(0, failureIndex) : events;
  const matches = [];

  for (const event of prefix) {
    if (isVerifierLike(event)) {
      continue;
    }
    const refs = eventArtifactRefs(event, repoRoot);
    if (refs.length === 0) {
      continue;
    }
    const overlap = refs.filter((ref) => failedArtifactRefs.includes(ref));
    if (overlap.length === 0) {
      continue;
    }

    const ids = eventActionIds(event);
    if (ids.length === 0) {
      continue;
    }

    matches.push({
      event,
      actionIds: ids,
      artifactRefs: overlap,
    });
  }

  return matches;
}

function collectVerifierAdjacency(events, failureIndex, failureEvent) {
  const failureSourceActionId = eventSourceActionId(failureEvent);
  if (failureSourceActionId) {
    return failureSourceActionId;
  }

  const prefix = failureIndex >= 0 ? events.slice(0, failureIndex) : events;
  for (let index = prefix.length - 1; index >= 0; index -= 1) {
    const event = prefix[index];
    if (event?.event_type !== 'action') {
      continue;
    }
    if (!isVerifierLike(event)) {
      continue;
    }
    const ids = eventActionIds(event);
    if (ids.length > 0) {
      return ids[0];
    }
  }

  return '';
}

function collectLatestMemoryReadNodeIds(events, failureIndex) {
  const prefix = failureIndex >= 0 ? events.slice(0, failureIndex) : events;
  for (let index = prefix.length - 1; index >= 0; index -= 1) {
    const event = prefix[index];
    if (event?.event_type !== 'observation') {
      continue;
    }
    const observationName = toText(event?.payload?.observation_name, '').toLowerCase();
    if (observationName !== 'memory_read') {
      continue;
    }
    const nodeIds = eventNodeIds(event);
    if (nodeIds.length > 0) {
      return nodeIds;
    }
  }
  return [];
}

function classifyFailureType(failureEvent = {}, classifier = classifyFailure(failureEvent)) {
  const text = [
    classifier.code,
    classifier.category,
    failureEvent?.summary,
    failureEvent?.payload?.detail,
    failureEvent?.payload?.result,
    failureEvent?.payload?.judge_name,
    failureEvent?.payload?.judgeName,
  ].map((entry) => toText(entry, '').toLowerCase()).join(' ');

  if (classifier.category === 'network' || /\b(network|fetch|http|timeout|econnreset|etimedout|enotfound)\b/.test(text)) {
    return {
      failure_type: 'environment_blocker',
      failure_class: 'environment',
      blocked: true,
    };
  }

  if (/\b(flaky|intermittent|unstable|race|timing|retryable)\b/.test(text)) {
    return {
      failure_type: 'flaky_blocker',
      failure_class: 'flaky',
      blocked: true,
    };
  }

  if (/\b(harness|runner|workflow|orchestrator|sandbox|policy|syntax|contract)\b/.test(text)) {
    return {
      failure_type: 'harness_blocker',
      failure_class: 'harness',
      blocked: true,
    };
  }

  if (classifier.category === 'environment') {
    return {
      failure_type: 'environment_blocker',
      failure_class: 'environment',
      blocked: true,
    };
  }

  return {
    failure_type: 'verification_failure',
    failure_class: 'verification',
    blocked: Boolean(classifier.blocker),
  };
}

function buildRootCauseSummary({ failureEvent, classifier, failureTypeInfo, failedArtifactRefs, sourceActionIds }) {
  const judgeName = toText(failureEvent?.payload?.judge_name ?? failureEvent?.payload?.judgeName, 'verifier');
  const artifactList = failedArtifactRefs.length > 0 ? failedArtifactRefs.join(', ') : 'unresolved artifact';
  const actionList = sourceActionIds.length > 0 ? sourceActionIds.join(', ') : 'unresolved action';
  const blockerSuffix = failureTypeInfo.blocked ? ` Promotion blocked as ${failureTypeInfo.failure_class} / ${classifier.code}.` : '';

  return `Failed ${judgeName} on ${artifactList}; source actions: ${actionList}; failure type: ${failureTypeInfo.failure_type}.${blockerSuffix}`;
}

function buildVerificationProbeCandidate({ failureEvent, failedArtifactRefs, sourceActionIds }) {
  const judgeName = toText(failureEvent?.payload?.judge_name ?? failureEvent?.payload?.judgeName, 'verifier');
  const command = toText(
    failureEvent?.payload?.probe_command
      ?? failureEvent?.payload?.command
      ?? `rerun ${judgeName} against attributed artifacts`,
    '',
  );

  return {
    command,
    artifact_refs: [...failedArtifactRefs],
    source_action_ids: [...sourceActionIds],
    expected_signal: `Re-run ${judgeName} and confirm the same attribution chain or a clean pass after remediation.`,
  };
}

export function findFailedJudgeEvents(events = []) {
  return sortByEventOrder(events).filter((event) => event?.event_type === 'judge_result' && toText(event?.payload?.result, '') === 'fail');
}

export function buildFailureAttribution(events = [], failureEvent = {}, options = {}) {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const orderedEvents = sortByEventOrder(events);
  const failureIndex = findFailureIndex(orderedEvents, failureEvent);
  const failedArtifactRefs = uniqueStrings(eventArtifactRefs(failureEvent, repoRoot));
  const failureTurnId = eventTurnId(failureEvent);
  const matchingActions = collectMatchingActions(orderedEvents, failureIndex, failedArtifactRefs, repoRoot);
  const sourceActionIds = [];
  const evidenceRefs = new Set();
  const heuristics = [];

  if (failureEvent?.event_id) {
    evidenceRefs.add(`trace:event:${failureEvent.event_id}`);
  }

  for (const ref of failedArtifactRefs) {
    evidenceRefs.add(ref);
  }
  if (failureTurnId) {
    evidenceRefs.add(`trace:turn:${failureTurnId}`);
  }

  const matchingActionIds = matchingActions
    .sort((left, right) => compareAwtlEvents(right.event, left.event))
    .flatMap((entry) => entry.actionIds);

  for (const actionId of matchingActionIds) {
    if (!sourceActionIds.includes(actionId)) {
      sourceActionIds.push(actionId);
    }
  }
  if (matchingActionIds.length > 0) {
    heuristics.push('failed-check-artifact-lookup', 'touched-file-lookup', 'last-modifying-action-lookup');
  }

  const verifierActionId = collectVerifierAdjacency(orderedEvents, failureIndex, failureEvent);
  if (verifierActionId && !sourceActionIds.includes(verifierActionId)) {
    sourceActionIds.push(verifierActionId);
    heuristics.push('command-verifier-adjacency-lookup');
  }

  const memoryReadNodeIds = collectLatestMemoryReadNodeIds(orderedEvents, failureIndex);
  if (memoryReadNodeIds.length > 0) {
    heuristics.push('memory-read-node-ids-lookup');
    for (const nodeId of memoryReadNodeIds) {
      evidenceRefs.add(`memory:node:${nodeId}`);
    }
  }

  const classifier = classifyFailure(buildFailureClassifierInput(failureEvent));
  const failureTypeInfo = classifyFailureType(failureEvent, classifier);
  const rootCauseSummary = buildRootCauseSummary({
    failureEvent,
    classifier,
    failureTypeInfo,
    failedArtifactRefs,
    sourceActionIds,
  });

  const verificationProbeCandidate = buildVerificationProbeCandidate({
    failureEvent,
    failedArtifactRefs,
    sourceActionIds,
  });

  const touchedActionIds = matchingActions
    .flatMap((entry) => entry.actionIds)
    .filter((actionId) => actionId && !sourceActionIds.includes(actionId));

  return {
    failureEvent,
    failureIndex,
    traceId: toText(options.traceId ?? options.trace_id ?? '', ''),
    runId: toText(options.runId ?? failureEvent?.run_id ?? '', ''),
    failureTurnId,
    failedArtifactRefs,
    sourceActionIds,
    verifierActionId,
    touchedActionIds,
    memoryReadNodeIds,
    evidenceRefs: [...evidenceRefs],
    rootCauseSummary,
    verificationProbeCandidate,
    classification: classifier,
    failureTypeInfo,
    attributionHeuristics: heuristics,
  };
}

export function buildSummarizerInput(attribution = {}) {
  return {
    failure_type: toText(attribution?.failureTypeInfo?.failure_type, ''),
    failure_class: toText(attribution?.failureTypeInfo?.failure_class, ''),
    root_cause_summary: toText(attribution?.rootCauseSummary, ''),
    source_action_ids: uniqueStrings(attribution?.sourceActionIds ?? []),
    evidence_refs: uniqueStrings(attribution?.evidenceRefs ?? []),
    verification_probe_candidate: {
      command: toText(attribution?.verificationProbeCandidate?.command, ''),
      artifact_refs: uniqueStrings(attribution?.verificationProbeCandidate?.artifact_refs ?? []),
      source_action_ids: uniqueStrings(attribution?.verificationProbeCandidate?.source_action_ids ?? []),
    },
    promotion_status: toText(attribution?.promotion_status ?? attribution?.promotionStatus, ''),
    confidence: typeof attribution?.confidence === 'number' ? attribution.confidence : null,
  };
}

export function isPlainAttribution(value) {
  return isPlainObject(value);
}
