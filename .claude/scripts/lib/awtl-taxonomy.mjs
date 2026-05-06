#!/usr/bin/env node

const TAXONOMY_LIMIT = 15;

export const categories = Object.freeze([
  Object.freeze({ id: 'capture', label: 'Capture' }),
  Object.freeze({ id: 'privacy', label: 'Privacy' }),
  Object.freeze({ id: 'provenance', label: 'Provenance' }),
  Object.freeze({ id: 'memorygraph', label: 'MemoryGraph' }),
  Object.freeze({ id: 'promotion', label: 'Promotion' }),
  Object.freeze({ id: 'trace', label: 'Trace' }),
  Object.freeze({ id: 'lifecycle', label: 'Lifecycle' }),
]);

export const classes = Object.freeze([
  Object.freeze({ id: 'observation', categoryId: 'capture', label: 'Observation' }),
  Object.freeze({ id: 'compact_fact', categoryId: 'memorygraph', label: 'Compact Fact' }),
  Object.freeze({ id: 'redaction', categoryId: 'privacy', label: 'Redaction' }),
  Object.freeze({ id: 'provenance_gate', categoryId: 'provenance', label: 'Provenance Gate' }),
  Object.freeze({ id: 'promotion_gate', categoryId: 'promotion', label: 'Promotion Gate' }),
  Object.freeze({ id: 'ignore_policy', categoryId: 'trace', label: 'Ignore Policy' }),
  Object.freeze({ id: 'review_gate', categoryId: 'lifecycle', label: 'Review Gate' }),
  Object.freeze({ id: 'verification_gate', categoryId: 'lifecycle', label: 'Verification Gate' }),
]);

export const leaves = Object.freeze([
  Object.freeze({ id: 'capture_missing', classId: 'observation', label: 'Capture missing' }),
  Object.freeze({ id: 'capture_partial', classId: 'observation', label: 'Capture partial' }),
  Object.freeze({ id: 'trace_not_ignored', classId: 'ignore_policy', label: 'Trace not ignored' }),
  Object.freeze({ id: 'trace_path_leaked', classId: 'ignore_policy', label: 'Trace path leaked' }),
  Object.freeze({ id: 'redaction_uncertain', classId: 'redaction', label: 'Redaction uncertain' }),
  Object.freeze({ id: 'redaction_drop', classId: 'redaction', label: 'Redaction drop' }),
  Object.freeze({ id: 'redaction_hash', classId: 'redaction', label: 'Redaction hash' }),
  Object.freeze({ id: 'provenance_missing', classId: 'provenance_gate', label: 'Provenance missing' }),
  Object.freeze({ id: 'provenance_invalid', classId: 'provenance_gate', label: 'Provenance invalid' }),
  Object.freeze({ id: 'promotion_denied', classId: 'promotion_gate', label: 'Promotion denied' }),
  Object.freeze({ id: 'memory_lookup_raw', classId: 'review_gate', label: 'Raw memory lookup' }),
  Object.freeze({ id: 'taxonomy_mismatch', classId: 'verification_gate', label: 'Taxonomy mismatch' }),
]);

export const failureTaxonomyV1 = Object.freeze({
  version: 1,
  leafCount: leaves.length,
  leafCountLimit: TAXONOMY_LIMIT,
  withinLimit: leaves.length <= TAXONOMY_LIMIT,
  openDecision: 'RSME acronym expansion remains open until maintainer approval or a later ADR.',
});

export const awtlRsmePolicy = Object.freeze({
  terms: Object.freeze({
    AWTL: 'Raw observation stream from the active workflow layer.',
    RSME: 'Repository-scoped compact fact envelope; expansion intentionally deferred.',
    event: 'Discrete occurrence observed during execution or verification.',
    span: 'Bounded interval grouping related events.',
    action: 'Intent-bearing step that can produce observation data.',
    memoryCandidate: 'Compact fact or pattern that may be eligible for promotion after provenance validation.',
    promotion: 'Approval-based move from compact fact to reusable MemoryGraph knowledge.',
  }),
  categories,
  classes,
  leaves,
  failureTaxonomyV1,
  provenanceTags: Object.freeze([
    'source:moonshot',
    'project:claude-settings',
    'origin:awtl',
    'validated_by:redaction-helper',
    'validated_by:provenance-boundary',
  ]),
});

export function getLeafIds() {
  return leaves.map((entry) => entry.id);
}

export function assertLeafCountWithinLimit(limit = TAXONOMY_LIMIT) {
  return leaves.length <= Number(limit);
}

export function getLeafById(id) {
  return leaves.find((entry) => entry.id === id) || null;
}

