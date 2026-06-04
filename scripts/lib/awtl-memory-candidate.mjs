#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { classifyFailure } from './failure-classifier.mjs';
import { buildFailureClassifierInput, buildSummarizerInput } from './awtl-failure-attribution.mjs';
import { resolveRuntimeStateRoot } from './runtime-state-root.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, '../../..');
const SCHEMA_PATH = path.resolve(MODULE_DIR, '../../schemas/awtl-memory-candidate-v1.schema.json');

export const DEFAULT_MEMORY_CANDIDATE_OUTPUT = path.join(resolveRuntimeStateRoot(REPO_ROOT), 'cache', 'memorygraph', 'memory_update_candidates.jsonl');
export const REQUIRED_PROMOTION_TAGS = Object.freeze([
  'source:moonshot',
  'project:moonshot-relay',
  'origin:awtl',
  'validated_by:redaction-helper',
  'validated_by:provenance-boundary',
]);

const BLOCKED_CLASSES = new Set(['environment', 'network', 'flaky', 'harness']);
let cachedSchema = null;

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

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function loadSchemaFile() {
  if (cachedSchema) {
    return cachedSchema;
  }
  cachedSchema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  return cachedSchema;
}

function stableCandidateId(parts) {
  const digest = createHash('sha256').update(JSON.stringify(parts), 'utf8').digest('hex').slice(0, 16);
  return `awtl-memory-candidate-${digest}`;
}

function deriveFailureClassification(failureEvent = {}) {
  const classifier = classifyFailure(buildFailureClassifierInput(failureEvent));
  const text = [
    classifier.code,
    classifier.category,
    failureEvent?.summary,
    failureEvent?.payload?.detail,
    failureEvent?.payload?.result,
    failureEvent?.payload?.judge_name,
    failureEvent?.payload?.judgeName,
  ].map((entry) => toText(entry, '').toLowerCase()).join(' ');

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

  if (classifier.category === 'network' || classifier.category === 'environment') {
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

function computeConfidence(attribution = {}, classification = {}) {
  let confidence = 0.45;
  if (Array.isArray(attribution.sourceActionIds) && attribution.sourceActionIds.length > 0) confidence += 0.2;
  if (Array.isArray(attribution.failedArtifactRefs) && attribution.failedArtifactRefs.length > 0) confidence += 0.15;
  if (Array.isArray(attribution.memoryReadNodeIds) && attribution.memoryReadNodeIds.length > 0) confidence += 0.1;
  if (toText(attribution.verifierActionId, '')) confidence += 0.05;
  if (classification.blocked) confidence -= 0.05;
  return Math.max(0, Math.min(0.95, Number(confidence.toFixed(2))));
}

function promotionOutcome(classification, confidence) {
  if (BLOCKED_CLASSES.has(classification.failure_class) || classification.blocked) {
    return {
      promotion_status: 'blocked',
      promotion_blocker_reason: `${classification.failure_class} failure should not be promoted by default`,
      requires_human_review: true,
    };
  }

  if (confidence >= 0.7) {
    return {
      promotion_status: 'ready_for_review',
      promotion_blocker_reason: '',
      requires_human_review: false,
    };
  }

  return {
    promotion_status: 'needs_more_evidence',
    promotion_blocker_reason: '',
    requires_human_review: true,
  };
}

function buildProposedMemory(attribution, classification) {
  const summary = toText(attribution.rootCauseSummary, '');
  const facts = [
    summary,
    `failure_class=${classification.failure_class}`,
    `failure_type=${classification.failure_type}`,
  ];
  if (Array.isArray(attribution.sourceActionIds) && attribution.sourceActionIds.length > 0) {
    facts.push(`source_action_ids=${attribution.sourceActionIds.join(', ')}`);
  }
  if (Array.isArray(attribution.failedArtifactRefs) && attribution.failedArtifactRefs.length > 0) {
    facts.push(`artifact_refs=${attribution.failedArtifactRefs.join(', ')}`);
  }

  return {
    summary,
    facts,
    tags: [...REQUIRED_PROMOTION_TAGS],
  };
}

function buildScope(attribution, options = {}) {
  return {
    run_id: toText(options.runId ?? attribution?.runId ?? attribution?.failureEvent?.run_id, ''),
    trace_id: toText(options.traceId ?? attribution?.traceId ?? '', ''),
    failure_event_id: toText(attribution?.failureEvent?.event_id, ''),
    failure_turn_id: toText(options.failureTurnId ?? attribution?.failureTurnId ?? attribution?.failureEvent?.turn_id ?? attribution?.failureEvent?.turnId, ''),
    span_id: attribution?.failureEvent?.span_id ?? null,
    artifact_refs: uniqueStrings(attribution?.failedArtifactRefs ?? []),
    memory_read_node_ids: uniqueStrings(attribution?.memoryReadNodeIds ?? []),
  };
}

function buildEvidenceRefs(attribution = {}) {
  const evidence = new Set();
  if (attribution?.failureEvent?.event_id) {
    evidence.add(`trace:event:${attribution.failureEvent.event_id}`);
  }
  if (toText(attribution?.failureTurnId, '')) {
    evidence.add(`trace:turn:${attribution.failureTurnId}`);
  }
  for (const ref of attribution?.evidenceRefs ?? []) {
    evidence.add(toText(ref, ''));
  }
  for (const ref of attribution?.failedArtifactRefs ?? []) {
    evidence.add(ref);
  }
  for (const actionId of attribution?.sourceActionIds ?? []) {
    evidence.add(`trace:event:${actionId}`);
  }
  for (const nodeId of attribution?.memoryReadNodeIds ?? []) {
    evidence.add(`memory:node:${nodeId}`);
  }
  return [...evidence];
}

function buildVerificationProbeCandidate(attribution = {}) {
  return {
    command: toText(attribution?.verificationProbeCandidate?.command, ''),
    artifact_refs: uniqueStrings(attribution?.verificationProbeCandidate?.artifact_refs ?? attribution?.failedArtifactRefs ?? []),
    source_action_ids: uniqueStrings(attribution?.verificationProbeCandidate?.source_action_ids ?? attribution?.sourceActionIds ?? []),
    expected_signal: toText(attribution?.verificationProbeCandidate?.expected_signal, 'Confirm the same failure attribution or a clean pass after remediation.'),
  };
}

export function getMemoryCandidateSchema() {
  return loadSchemaFile();
}

export function buildMemoryCandidate(attribution = {}, options = {}) {
  if (!attribution || !attribution.failureEvent) {
    throw new Error('attribution.failureEvent is required');
  }

  const failureTurnId = toText(options.failureTurnId ?? attribution.failureTurnId ?? attribution.failureEvent.turn_id ?? attribution.failureEvent.turnId, '');
  const classification = deriveFailureClassification(attribution.failureEvent);
  const confidence = computeConfidence(attribution, classification);
  const promotion = promotionOutcome(classification, confidence);
  const failureClassifier = classifyFailure(buildFailureClassifierInput(attribution.failureEvent));
  const candidate = {
    schema_version: 1,
    candidate_id: stableCandidateId({
      run_id: toText(options.runId ?? attribution.runId ?? attribution.failureEvent.run_id, ''),
      trace_id: toText(options.traceId ?? attribution.traceId ?? '', ''),
      failure_event_id: toText(attribution.failureEvent.event_id, ''),
      failure_turn_id: failureTurnId,
      source_action_ids: uniqueStrings(attribution.sourceActionIds ?? []),
      evidence_refs: uniqueStrings(buildEvidenceRefs(attribution)),
      failure_class: classification.failure_class,
      failure_type: classification.failure_type,
    }),
    created_at: toText(options.createdAt ?? new Date().toISOString(), new Date().toISOString()),
    run_id: toText(options.runId ?? attribution.runId ?? attribution.failureEvent.run_id, ''),
    trace_id: toText(options.traceId ?? attribution.traceId ?? '', ''),
    failure_event_id: toText(attribution.failureEvent.event_id, ''),
    failure_turn_id: failureTurnId,
    failure_code: failureClassifier.code,
    failure_category: failureClassifier.category,
    source_action_ids: uniqueStrings(attribution.sourceActionIds ?? []),
    failure_type: classification.failure_type,
    failure_class: classification.failure_class,
    root_cause_summary: toText(attribution.rootCauseSummary, ''),
    proposed_memory: buildProposedMemory(attribution, classification),
    scope: buildScope(attribution, options),
    evidence_refs: buildEvidenceRefs(attribution),
    verification_probe_candidate: buildVerificationProbeCandidate(attribution),
    promotion_status: promotion.promotion_status,
    promotion_blocker_reason: promotion.promotion_blocker_reason,
    promotion_tags: [...REQUIRED_PROMOTION_TAGS],
    confidence,
    requires_human_review: promotion.requires_human_review,
    attribution_heuristics: uniqueStrings(attribution.attributionHeuristics ?? []),
    memory_read_node_ids: uniqueStrings(attribution.memoryReadNodeIds ?? []),
  };

  return candidate;
}

export function validateMemoryCandidate(candidate = {}) {
  const schema = loadSchemaFile();
  const errors = [];

  if (!isPlainObject(candidate)) {
    return { ok: false, errors: ['candidate must be an object'], schema };
  }

  for (const field of schema.required || []) {
    if (!(field in candidate)) {
      errors.push(`${field} is required`);
    }
  }

  if (candidate.schema_version !== 1) {
    errors.push('schema_version must be 1');
  }
  if (typeof candidate.candidate_id !== 'string' || candidate.candidate_id.length === 0) {
    errors.push('candidate_id must be a non-empty string');
  }
  if (typeof candidate.created_at !== 'string' || Number.isNaN(Date.parse(candidate.created_at))) {
    errors.push('created_at must be an RFC 3339 date-time string');
  }
  if (typeof candidate.run_id !== 'string' || candidate.run_id.length === 0) {
    errors.push('run_id must be a non-empty string');
  }
  if (typeof candidate.trace_id !== 'string' || candidate.trace_id.length === 0) {
    errors.push('trace_id must be a non-empty string');
  }
  if (typeof candidate.failure_event_id !== 'string' || candidate.failure_event_id.length === 0) {
    errors.push('failure_event_id must be a non-empty string');
  }
  if (typeof candidate.failure_turn_id !== 'string' || candidate.failure_turn_id.length === 0) {
    errors.push('failure_turn_id must be a non-empty string');
  }
  if (!Array.isArray(candidate.source_action_ids) || candidate.source_action_ids.length === 0 || candidate.source_action_ids.some((value) => typeof value !== 'string' || value.length === 0)) {
    errors.push('source_action_ids must be a non-empty array of strings');
  }
  if (typeof candidate.failure_type !== 'string' || candidate.failure_type.length === 0) {
    errors.push('failure_type must be a non-empty string');
  }
  if (typeof candidate.failure_class !== 'string' || candidate.failure_class.length === 0) {
    errors.push('failure_class must be a non-empty string');
  }
  if (typeof candidate.root_cause_summary !== 'string' || candidate.root_cause_summary.length === 0) {
    errors.push('root_cause_summary must be a non-empty string');
  }
  if (!isPlainObject(candidate.proposed_memory)) {
    errors.push('proposed_memory must be an object');
  } else {
    if (typeof candidate.proposed_memory.summary !== 'string' || candidate.proposed_memory.summary.length === 0) {
      errors.push('proposed_memory.summary must be a non-empty string');
    }
    if (!Array.isArray(candidate.proposed_memory.facts) || candidate.proposed_memory.facts.length === 0) {
      errors.push('proposed_memory.facts must be a non-empty array');
    }
    if (!Array.isArray(candidate.proposed_memory.tags) || candidate.proposed_memory.tags.length === 0) {
      errors.push('proposed_memory.tags must be a non-empty array');
    }
  }
  if (!isPlainObject(candidate.scope)) {
    errors.push('scope must be an object');
  } else {
    if (typeof candidate.scope.run_id !== 'string' || candidate.scope.run_id.length === 0) {
      errors.push('scope.run_id must be a non-empty string');
    }
    if (typeof candidate.scope.trace_id !== 'string' || candidate.scope.trace_id.length === 0) {
      errors.push('scope.trace_id must be a non-empty string');
    }
    if (typeof candidate.scope.failure_event_id !== 'string' || candidate.scope.failure_event_id.length === 0) {
      errors.push('scope.failure_event_id must be a non-empty string');
    }
    if (typeof candidate.scope.failure_turn_id !== 'string' || candidate.scope.failure_turn_id.length === 0) {
      errors.push('scope.failure_turn_id must be a non-empty string');
    }
    if (!Array.isArray(candidate.scope.artifact_refs) || candidate.scope.artifact_refs.length === 0) {
      errors.push('scope.artifact_refs must be a non-empty array');
    }
  }
  if (!Array.isArray(candidate.evidence_refs) || candidate.evidence_refs.length === 0) {
    errors.push('evidence_refs must be a non-empty array');
  }
  if (!isPlainObject(candidate.verification_probe_candidate)) {
    errors.push('verification_probe_candidate must be an object');
  } else {
    if (typeof candidate.verification_probe_candidate.command !== 'string' || candidate.verification_probe_candidate.command.length === 0) {
      errors.push('verification_probe_candidate.command must be a non-empty string');
    }
    if (!Array.isArray(candidate.verification_probe_candidate.artifact_refs) || candidate.verification_probe_candidate.artifact_refs.length === 0) {
      errors.push('verification_probe_candidate.artifact_refs must be a non-empty array');
    }
    if (!Array.isArray(candidate.verification_probe_candidate.source_action_ids) || candidate.verification_probe_candidate.source_action_ids.length === 0) {
      errors.push('verification_probe_candidate.source_action_ids must be a non-empty array');
    }
  }
  if (!['blocked', 'needs_more_evidence', 'ready_for_review'].includes(candidate.promotion_status)) {
    errors.push('promotion_status must be blocked, needs_more_evidence, or ready_for_review');
  }
  if (!Array.isArray(candidate.promotion_tags) || candidate.promotion_tags.length === 0) {
    errors.push('promotion_tags must be a non-empty array');
  }
  if (typeof candidate.confidence !== 'number' || candidate.confidence < 0 || candidate.confidence > 1) {
    errors.push('confidence must be a number between 0 and 1');
  }
  if (typeof candidate.requires_human_review !== 'boolean') {
    errors.push('requires_human_review must be a boolean');
  }
  if (candidate.promotion_status === 'blocked' && typeof candidate.promotion_blocker_reason !== 'string' && candidate.promotion_blocker_reason !== null) {
    errors.push('promotion_blocker_reason must be a string when blocked');
  }
  if ('denial_codes' in candidate && (!Array.isArray(candidate.denial_codes) || candidate.denial_codes.some((value) => typeof value !== 'string' || value.length === 0))) {
    errors.push('denial_codes must be an array of non-empty strings when present');
  }
  if ('applies_to' in candidate && (!Array.isArray(candidate.applies_to) || candidate.applies_to.some((value) => typeof value !== 'string' || value.length === 0))) {
    errors.push('applies_to must be an array of non-empty strings when present');
  }
  if ('does_not_apply_to' in candidate && (!Array.isArray(candidate.does_not_apply_to) || candidate.does_not_apply_to.some((value) => typeof value !== 'string' || value.length === 0))) {
    errors.push('does_not_apply_to must be an array of non-empty strings when present');
  }
  if ('validated_by' in candidate && (typeof candidate.validated_by !== 'string' || candidate.validated_by.length === 0)) {
    errors.push('validated_by must be a non-empty string when present');
  }
  if ('last_validated_at' in candidate && (typeof candidate.last_validated_at !== 'string' || Number.isNaN(Date.parse(candidate.last_validated_at)))) {
    errors.push('last_validated_at must be an RFC 3339 date-time string when present');
  }

  return {
    ok: errors.length === 0,
    errors,
    schema,
  };
}

export function assertMemoryCandidate(candidate = {}) {
  const result = validateMemoryCandidate(candidate);
  if (!result.ok) {
    const error = new Error(`Invalid memory candidate: ${result.errors.join('; ')}`);
    error.errors = result.errors;
    throw error;
  }
  return candidate;
}

export function writeMemoryCandidatesJsonl(outputPath, candidates = [], options = {}) {
  const filePath = path.resolve(outputPath);
  ensureDir(filePath);
  const writeMode = options.append === false ? 'w' : 'a';
  const lines = [];

  for (const candidate of candidates) {
    const checked = assertMemoryCandidate(candidate);
    lines.push(`${JSON.stringify(checked)}\n`);
  }

  fs.writeFileSync(filePath, lines.join(''), { encoding: 'utf8', flag: writeMode });
  return {
    outputPath: filePath,
    count: candidates.length,
  };
}

export function buildRedactedSummarizerInput(candidate = {}) {
  return buildSummarizerInput(candidate);
}
