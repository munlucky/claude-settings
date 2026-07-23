import crypto from 'node:crypto';
import { VALID_TYPES, resolveRecordType } from './records.mjs';

export function mapCandidateToCanonicalRecord(candidate, { runId, projectId, revision }) {
  const type = resolveRecordType(candidate.proposedType || candidate.type || 'semantic_fact');
  if (!VALID_TYPES.includes(type)) {
    throw new Error(`INVALID_CANONICAL_TYPE: ${type} is not an allowed knowledge record type`);
  }

  const recordId = `kn-${projectId}-${type.slice(0, 4)}-${crypto.randomUUID().slice(0, 8)}`;
  const record = {
    id: recordId,
    type,
    statement: candidate.statement || '',
    scope: Array.isArray(candidate.scope) ? candidate.scope : [],
    status: 'committed',
    trustTier: 'verified',
    projectId,
    sourceRunId: runId,
    revision,
  };

  if (type === 'semantic_fact') {
    record.factJson = candidate.candidateJson || candidate;
  } else if (type === 'tacit_practice') {
    record.practiceJson = candidate.candidateJson || candidate;
  } else if (type === 'ontology_constraint') {
    record.constraintJson = candidate.candidateJson || candidate;
  } else if (type === 'failure_pattern') {
    record.failureJson = candidate.candidateJson || candidate;
  }

  return record;
}
