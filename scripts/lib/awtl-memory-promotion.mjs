#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { assertMemoryCandidate, validateMemoryCandidate } from './awtl-memory-candidate.mjs';
import { assessReplayProbeManifest, buildReplayProbeManifest, readReplayProbeManifest } from './awtl-replay-probes.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, '../../..');
const DIRECT_MEMORYGRAPH_SCRIPT = path.join(REPO_ROOT, '.claude/scripts/memorygraph-direct.mjs');
const DEFAULT_REPLAY_SCORECARD_PATH = path.join(REPO_ROOT, '.claude/cache/awtl/replay_scorecard.jsonl');

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
    ...(candidate?.proposed_memory?.tags ?? []),
    ...(candidate?.promotion_tags ?? []),
    ...(candidate?.tags ?? []),
  ];

  if (directFlags.some((value) => value === true)) {
    return true;
  }

  const directText = directFlags.map((value) => toText(value, '').toLowerCase()).join(' ');
  if (/\b(imported-only|imported only|transcript-only|transcript only|raw trace|trace-only|trace only)\b/.test(directText)) {
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

function buildDenialCodes({
  validation = { ok: true, errors: [] },
  blockedTags = [],
  importedOnly = false,
  replayAssessment = { ok: false, status: 'needs_more_evidence', blocking_reasons: [] },
  approval = { approved: false },
  memoryGraphStatus = 'available',
  candidate = {},
}) {
  const codes = [];

  if (!validation.ok) {
    codes.push('invalid_candidate');
  }
  if (candidateFailureBlocked(candidate)) {
    const failureClass = toText(candidate.failure_class, 'unknown').toLowerCase();
    codes.push(failureClass ? `blocked_failure_class:${failureClass}` : 'blocked_failure_class');
  }
  if (blockedTags.length > 0) {
    codes.push('blocked_promotion_tag');
  }
  if (importedOnly) {
    codes.push('imported_only');
  }

  if (!approval.approved && !replayAssessment.ok) {
    codes.push('replay_or_approval_required');
  }

  if (replayAssessment.status === 'blocked') {
    const worsened = Array.isArray(replayAssessment.blocking_reasons)
      && replayAssessment.blocking_reasons.some((reason) => /worsened|regress|failed|blocked/i.test(reason));
    codes.push(worsened ? 'replay_regression_worsened' : 'replay_blocked');
  } else if (replayAssessment.status === 'needs_more_evidence') {
    codes.push('replay_needs_more_evidence');
  }

  if (memoryGraphStatus === 'unavailable') {
    codes.push('memorygraph_unavailable');
  }

  return uniqueStrings(codes);
}

function compactProvenance(candidate = {}, options = {}) {
  const appliesTo = uniqueStrings(options.appliesTo ?? candidate?.scope?.artifact_refs ?? []);
  const doesNotApplyTo = uniqueStrings(options.doesNotApplyTo ?? blockedPromotionTags(candidate));
  const validatedBy = toText(options.validatedBy ?? candidate.validated_by ?? 'replay', 'replay');
  const lastValidatedAt = toText(options.lastValidatedAt ?? candidate.last_validated_at ?? candidate.created_at ?? new Date().toISOString(), new Date().toISOString());
  const originTurn = toText(options.originTurn ?? candidate.failure_turn_id ?? candidate?.scope?.failure_turn_id ?? candidate?.scope?.turn_id, '');

  return {
    origin_turn: originTurn,
    applies_to: appliesTo,
    does_not_apply_to: doesNotApplyTo,
    validated_by: validatedBy,
    last_validated_at: lastValidatedAt,
  };
}

function buildProvenanceTags(candidate = {}, options = {}) {
  const projectId = toText(options.projectId ?? candidate.project_id ?? candidate.projectId ?? 'moonshot-relay', 'moonshot-relay');
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
  const provenance = compactProvenance(candidate, options);

  return {
    summary: toText(proposed.summary ?? candidate.root_cause_summary, ''),
    facts: uniqueStrings(Array.isArray(proposed.facts) ? proposed.facts : []),
    tags,
    ...provenance,
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

  const denialCodes = buildDenialCodes({
    validation,
    blockedTags,
    importedOnly: isImportedOnlyCandidate(candidate),
    replayAssessment,
    approval,
    memoryGraphStatus,
    candidate,
  });
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
    denial_codes: denialCodes,
  };
}

export function buildPromotionOutput(candidate = {}, options = {}) {
  const gate = evaluatePromotionGate(candidate, options);
  const provenance = {
    project_id: toText(options.projectId ?? candidate.project_id ?? candidate.projectId ?? 'moonshot-relay', 'moonshot-relay'),
    source: 'moonshot',
    origin: 'awtl',
    origin_run: toText(options.runId ?? candidate.run_id ?? candidate.runId, ''),
    origin_candidate: toText(options.candidateId ?? candidate.candidate_id ?? candidate.candidateId, ''),
    origin_turn: toText(options.originTurn ?? candidate.failure_turn_id ?? candidate?.scope?.failure_turn_id ?? candidate?.scope?.turn_id, ''),
    applies_to: uniqueStrings(options.appliesTo ?? candidate?.scope?.artifact_refs ?? []),
    does_not_apply_to: uniqueStrings(options.doesNotApplyTo ?? blockedPromotionTags(candidate)),
    validated_by: toText(options.validatedBy ?? (gate.replay_assessment?.ok ? 'replay' : 'human_approval'), 'replay'),
    last_validated_at: toText(options.lastValidatedAt ?? candidate.last_validated_at ?? candidate.created_at ?? new Date().toISOString(), new Date().toISOString()),
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
      originTurn: provenance.origin_turn,
      appliesTo: provenance.applies_to,
      doesNotApplyTo: provenance.does_not_apply_to,
      lastValidatedAt: provenance.last_validated_at,
    }),
    provenance,
    replay: gate.replay_assessment,
    approval: gate.approval,
    denial_codes: gate.denial_codes,
    memory_graph: {
      status: gate.memory_graph_status,
      write_status: gate.ok && gate.memory_graph_status === 'available' ? 'not_requested' : 'skipped',
      unrelated_workflow_blocked: gate.workflow_blocking,
      denial_codes: gate.denial_codes,
    },
    raw_trace_included: false,
  };
}

export function promoteMemoryCandidate(candidate = {}, options = {}) {
  const checked = assertMemoryCandidate(candidate);
  return buildPromotionOutput(checked, options);
}

function memoryGraphStorePayload(output = {}) {
  const compactFact = output.compact_fact ?? {};
  const provenance = output.provenance ?? {};
  return {
    type: 'general',
    title: toText(compactFact.summary ?? output.candidate_id ?? 'memory promotion', 'memory promotion'),
    content: JSON.stringify({
      candidate_id: output.candidate_id ?? '',
      run_id: output.run_id ?? '',
      trace_id: output.trace_id ?? '',
      summary: compactFact.summary ?? '',
      facts: compactFact.facts ?? [],
      tags: compactFact.tags ?? [],
      provenance,
      denial_codes: output.denial_codes ?? [],
      gate_status: output.status ?? '',
    }, null, 2),
    summary: toText(compactFact.summary ?? '', ''),
    tags: uniqueStrings([
      ...(compactFact.tags ?? []),
      `promotion_status:${toText(output.status ?? '', 'unknown')}`,
    ]),
    importance: 0.75,
    context: {
      candidate_id: output.candidate_id ?? '',
      run_id: output.run_id ?? '',
      trace_id: output.trace_id ?? '',
      memory_graph_status: provenance.memory_graph_status ?? '',
      denial_codes: output.denial_codes ?? [],
      provenance,
    },
  };
}

export function attemptMemoryGraphWrite(output = {}, options = {}) {
  if (!output || output.status !== 'promotable') {
    return {
      attempted: false,
      status: 'skipped',
      denial_codes: uniqueStrings([...(output?.denial_codes ?? []), 'candidate_not_promotable']),
      memory_graph_status: output?.memory_graph?.status ?? 'available',
      message: 'candidate is not promotable',
    };
  }

  const payload = memoryGraphStorePayload(output);
  const result = spawnSync(process.execPath, [
    DIRECT_MEMORYGRAPH_SCRIPT,
    'call',
    'store_memory',
    '--args-json',
    JSON.stringify(payload),
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    timeout: Number(options.timeoutMs ?? 30000),
  });

  const stdout = toText(result.stdout, '');
  const stderr = toText(result.stderr, '');
  const errorText = result.error ? toText(result.error.message ?? result.error, '') : '';
  const combined = uniqueStrings([stdout, stderr, errorText]).join('\n');
  const unavailable = /memorygraph command not found|health check failed|command not found|Unable to create process/i.test(combined);

  if (result.status === 0) {
    return {
      attempted: true,
      status: 'written',
      memory_graph_status: output?.memory_graph?.status ?? 'available',
      result_text: stdout,
    };
  }

  return {
    attempted: true,
    status: unavailable ? 'unavailable' : 'failed',
    memory_graph_status: unavailable ? 'unavailable' : (output?.memory_graph?.status ?? 'available'),
    denial_codes: uniqueStrings([
      ...(output?.denial_codes ?? []),
      unavailable ? 'memorygraph_unavailable' : 'memorygraph_store_failed',
    ]),
    error: combined,
    result_text: stdout,
  };
}

export function executePromotionFlow(candidate = {}, options = {}) {
  const output = options.replayManifest || options.replayAssessment
    ? promoteMemoryCandidate(candidate, options)
    : buildPromotionOutput(assertMemoryCandidate(candidate), options);

  const shouldWrite = options.writeMemoryGraph === true && toText(options.autoPromote, 'verified-only') === 'verified-only';
  if (!shouldWrite) {
    return {
      ...output,
      memory_graph: {
        ...output.memory_graph,
        write_status: output.status === 'promotable' ? 'not_requested' : 'skipped',
      },
    };
  }

  const writeResult = attemptMemoryGraphWrite(output, options);
  const finalStatus = writeResult.status === 'written' ? output.status : 'blocked';
  return {
    ...output,
    status: finalStatus,
    denial_codes: uniqueStrings([...(output.denial_codes ?? []), ...(writeResult.denial_codes ?? [])]),
    memory_graph: {
      ...output.memory_graph,
      status: writeResult.memory_graph_status ?? output.memory_graph.status,
      write_status: writeResult.status,
      write_result: writeResult.result_text ?? '',
      write_attempted: writeResult.attempted,
      denial_codes: uniqueStrings([...(output.memory_graph?.denial_codes ?? []), ...(writeResult.denial_codes ?? [])]),
    },
  };
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
