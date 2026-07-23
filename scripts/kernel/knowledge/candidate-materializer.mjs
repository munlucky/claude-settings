import crypto from 'node:crypto';
import { VALID_TYPES, resolveRecordType } from './records.mjs';

export function materializeObservations(runId, projectId, observations = [], { allowCallerId = false } = {}) {
  const candidates = [];
  for (const obs of observations) {
    if (!obs || typeof obs !== 'object') continue;
    const proposedType = resolveRecordType(obs.proposedType || obs.type || 'semantic_fact');
    if (!VALID_TYPES.includes(proposedType)) {
      throw new Error(`INVALID_CANDIDATE_TYPE: ${proposedType} is not an allowed candidate type`);
    }

    if ((obs.candidateId || obs.id) && !allowCallerId) {
      const err = new Error(`CALLER_CANDIDATE_ID_FORBIDDEN: Caller candidate ID ${obs.candidateId || obs.id} is forbidden in normal runtime`);
      err.code = 'CALLER_CANDIDATE_ID_FORBIDDEN';
      throw err;
    }

    let candidateId = (obs.candidateId || obs.id) && allowCallerId ? (obs.candidateId || obs.id) : `cand-${runId}-${crypto.randomUUID().slice(0, 8)}`;

    candidates.push({
      candidateId,
      runId,
      projectId,
      proposedType,
      statement: obs.statement || '',
      scope: Array.isArray(obs.scope) ? obs.scope : [],
      sourceRefs: Array.isArray(obs.sourceRefs) ? obs.sourceRefs : [],
      evidenceRefs: Array.isArray(obs.evidenceRefs) ? obs.evidenceRefs : [],
      status: 'observed',
      candidateJson: {
        candidateId,
        runId,
        projectId,
        proposedType,
        statement: obs.statement || '',
        scope: Array.isArray(obs.scope) ? obs.scope : [],
        sourceRefs: Array.isArray(obs.sourceRefs) ? obs.sourceRefs : [],
        evidenceRefs: Array.isArray(obs.evidenceRefs) ? obs.evidenceRefs : [],
        status: 'observed',
      },
    });
  }
  return candidates;
}
