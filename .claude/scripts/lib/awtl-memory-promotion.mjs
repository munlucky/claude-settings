#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertMemoryCandidate, validateMemoryCandidate } from './awtl-memory-candidate.mjs';
import { assessReplayProbeManifest, buildReplayProbeManifest, readReplayProbeManifest } from './awtl-replay-probes.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, '../../..');

const BLOCKED_PROMOTION_TAGS = new Set(['imported-only', 'transcript-only', 'raw-trace', 'trace-only']);
const BLOCKED_FAILURE_CLASSES = new Set(['environment', 'flaky', 'harness']);

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

function normalizeApproval(approval) {
  if (approval === true) {
    return { approved: true, evidence: 'boolean-true' };
  }
  if (approval === false || approval == null) {
    return { approved: false, evidence: '' };
  }
  if (typeof approval === 'string') {
    const text = approval.trim().toLowerCase();
    return {
      approved: ['approved', 'accept', 'accepted', 'yes', 'true', 'confirmed'].includes(text),
      evidence: approval,
    };
  }
  if (isPlainObject(approval)) {
    const evidence = toText(approval.evidence ?? approval.reason ?? approval.approval_evidence ?? approval.approvalEvidence, '');
    const statusText = toText(approval.status ?? approval.state ?? approval.approval, '').toLowerCase();
    return {
      approved: Boolean(approval.approved ?? approval.isApproved ?? approval.confirmed)
        || ['approved', 'accept', 'accepted', 'confirmed', 'yes', 'true'].includes(statusText),
      evidence,
    };
  }
  return { approved: false, evidence: '' };
}

function blockedPromotionTags(candidate = {}) {
  const tags = [
    ...(candidate?.proposed_memory?.tags ?? []),
    ...(candidate?.promotion_tags ?? []),
    ...(candidate?.tags ?? []),
  ];
  return uniqueStrings(tags).filter((tag) => BLOCKED_PROMOTION_TAGS.has(tag));
}

function isImportedOnlyCandidate(candidate = {}) {
  const directFlags = [
    candidate.imported_only,
    candidate.importedOnly,
    candidate.transcript_only,
    candidate.transcriptOnly,
    candidate.raw_trace,
    candidate.rawTrace,
    candidate.source_event_type,
    candidate.sourceEventType,
    candidate.source_kind,
    candidate.sourceKind,
  ];

  if (directFlags.some((value) => value === true)) {
    return true;
  }

  const sourceText = [
    candidate?.source_event_type,
    candidate?.sourceEventType,
    candidate?.source_kind,
    candidate?.sourceKind,
    candidate?.proposed_memory?.summary,
    candidate?.proposed_memory?.facts?.join(' '),
    candidate?.root_cause_summary,
    candidate?.promotion_blocker_reason,
  ].map((value) => toText(value, '').toLowerCase()).join(' ');

  return /\b(imported-only|imported only|transcript-only|transcript only|raw trace|trace-only|trace only)\b/.test(sourceText);
}

function candidateFailureBlocked(candidate = {}) {
  const failureClass = toText(candidate.failure_class, '').toLowerCase();
  const promotionStatus = toText(candidate.promotion_status, '').toLowerCase();
  if (promotionStatus === 'blocked') {
    return true;
  }
  return BLOCKED_FAILURE_CLASSES.has(failureClass);
}

function buildProvenanceTags(candidate = {}, options = {}) {
  const projectId = toText(options.projectId ?? candidate.project_id ?? candidate.projectId ?? 'claude-settings', 'claude-settings');
  const runId = toText(options.runId ?? candidate.run_id ?? candidate.runId, '');
  const candidateId = toText(options.candidateId ?? candidate.candidate_id ?? candidate.candidateId, '');
  const validatedBy = toText(options.validatedBy ?? candidate.validated_by ?? candidate.validatedBy, 'replay');

  return uniqueStrings([
    `project:${projectId}`,
    'source:moonshot',
    'origin:awtl',
    runId ? `origin_run:${runId}` : '',
    candidateId ? `origin_candidate:${candidateId}` : '',
    `validated_by:${validatedBy}`,
  ]);
}

export function buildCompactFact(candidate = {}, options = {}) {
  const proposed = isPlainObject(candidate.proposed_memory) ? candidate.proposed_memory : {};
  const tags = buildProvenanceTags(candidate, options);

  return {
    summary: toText(proposed.summary ?? candidate.root_cause_summary, ''),
    facts: uniqueStrings(Array.isArray(proposed.facts) ? proposed.facts : []),
    tags,
  };
}

function normalizeReplayAssessment(options = {}) {
  if (options.replayAssessment) {
    return {
      ...options.replayAssessment,
      provided: true,
    };
  }
  if (options.replayManifest) {
    return {
      ...assessReplayProbeManifest(options.replayManifest),
      provided: true,
    };
  }
  return {
    ok: false,
    status: 'needs_more_evidence',
    blocking_reasons: ['replay evidence missing'],
    probe_statuses: {},
    regression_worsened: false,
    required_probe_statuses: {},
    manifest: buildReplayProbeManifest({}),
    provided: false,
  };
}

export function evaluatePromotionGate(candidate = {}, options = {}) {
  const validation = validateMemoryCandidate(candidate);
  const approval = normalizeApproval(options.approval);
  const replayAssessment = normalizeReplayAssessment(options);
  const memoryGraphStatus = toText(options.memoryGraphStatus ?? options.memory_graph_status ?? 'available', 'available');
  const reasons = [];

  if (!validation.ok) {
    reasons.push(...validation.errors);
  }

  if (candidateFailureBlocked(candidate)) {
    reasons.push(`candidate failure class ${toText(candidate.failure_class, 'unknown')} is blocked`);
  }

  const blockedTags = blockedPromotionTags(candidate);
  if (blockedTags.length > 0) {
    reasons.push(`candidate carries blocked promotion tags: ${blockedTags.join(', ')}`);
  }

  if (isImportedOnlyCandidate(candidate)) {
    reasons.push('imported-only or transcript-only candidate is blocked');
  }

  const replayOk = replayAssessment.ok === true;
  const replayProvided = replayAssessment.provided === true;
  if (!approval.approved && !replayOk) {
    reasons.push('replay or human approval is required before promotion');
  }

  if (replayProvided && replayAssessment.status === 'blocked' && Array.isArray(replayAssessment.blocking_reasons) && replayAssessment.blocking_reasons.length > 0) {
    reasons.push(...replayAssessment.blocking_reasons);
  } else if (replayProvided && replayAssessment.status === 'needs_more_evidence' && !approval.approved) {
    reasons.push(...(Array.isArray(replayAssessment.blocking_reasons) ? replayAssessment.blocking_reasons : []));
  }

  const memoryGraphUnavailable = memoryGraphStatus === 'unavailable';
  if (memoryGraphUnavailable) {
    reasons.push('MemoryGraph unavailable');
  }

  const blocked = reasons.length > 0;
  const gateStatus = blocked ? 'blocked' : 'ready_for_promotion';
  const workflowBlocking = !memoryGraphUnavailable && blocked;

  return {
    ok: !blocked,
    gate_status: gateStatus,
    blocked,
    workflow_blocking: workflowBlocking,
    reasons: uniqueStrings(reasons),
    validation,
    approval,
    replay_assessment: replayAssessment,
    memory_graph_status: memoryGraphStatus,
  };
}

export function buildPromotionOutput(candidate = {}, options = {}) {
  const gate = evaluatePromotionGate(candidate, options);
  const provenance = {
    project_id: toText(options.projectId ?? candidate.project_id ?? candidate.projectId ?? 'claude-settings', 'claude-settings'),
    source: 'moonshot',
    origin: 'awtl',
    origin_run: toText(options.runId ?? candidate.run_id ?? candidate.runId, ''),
    origin_candidate: toText(options.candidateId ?? candidate.candidate_id ?? candidate.candidateId, ''),
    validated_by: toText(options.validatedBy ?? (gate.replay_assessment?.ok ? 'replay' : 'human_approval'), 'replay'),
    memory_graph_status: gate.memory_graph_status,
  };

  return {
    candidate_id: toText(candidate.candidate_id ?? candidate.candidateId, ''),
    run_id: toText(candidate.run_id ?? candidate.runId, ''),
    trace_id: toText(candidate.trace_id ?? candidate.traceId, ''),
    status: gate.ok ? 'promotable' : 'blocked',
    gate,
    compact_fact: buildCompactFact(candidate, {
      projectId: provenance.project_id,
      runId: provenance.origin_run,
      candidateId: provenance.origin_candidate,
      validatedBy: provenance.validated_by,
    }),
    provenance,
    replay: gate.replay_assessment,
    approval: gate.approval,
    memory_graph: {
      status: gate.memory_graph_status,
      write_status: gate.ok && gate.memory_graph_status === 'available' ? 'not_implemented' : 'skipped',
      unrelated_workflow_blocked: gate.workflow_blocking,
    },
    raw_trace_included: false,
  };
}

export function promoteMemoryCandidate(candidate = {}, options = {}) {
  const checked = assertMemoryCandidate(candidate);
  return buildPromotionOutput(checked, options);
}

export function readCandidateFromJsonText(text = '') {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) {
    throw new Error('candidate input is empty');
  }
  if (trimmed.includes('\n')) {
    const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const lastLine = lines[lines.length - 1];
    return JSON.parse(lastLine);
  }
  return JSON.parse(trimmed);
}

export function readCandidateFile(filePath) {
  const resolved = path.resolve(filePath);
  return readCandidateFromJsonText(fs.readFileSync(resolved, 'utf8'));
}

export function readReplayManifestFile(filePath) {
  return readReplayProbeManifest(filePath);
}

export function repoRoot() {
  return REPO_ROOT;
}
