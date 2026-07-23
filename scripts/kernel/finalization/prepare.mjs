import { FinalizationAggregateSnapshot } from './model.mjs';
import { materializeObservations } from '../knowledge/candidate-materializer.mjs';
import { bindCandidateEvidence } from '../knowledge/evidence-binder.mjs';
import { gateOntologyConstraints } from '../knowledge/ontology-gate.mjs';

export async function prepareFinalization(runId, { observations = [], expectedMutationRevision = null } = {}, { stateStore = null } = {}) {
  if (!stateStore || typeof stateStore.getRun !== 'function') {
    throw new Error('stateStore is required for prepareFinalization');
  }

  const run = stateStore.getRun(runId);
  if (!run) {
    throw new Error(`Run ${runId} not found`);
  }

  if (expectedMutationRevision !== null && Number(expectedMutationRevision) !== Number(run.mutationRevision)) {
    throw new Error(`STALE_MUTATION_REVISION: Expected ${expectedMutationRevision} but found ${run.mutationRevision}`);
  }

  const projectId = run.projectId || 'munlucky-moonshot-relay';

  // 1. Materialize observations or fetch DB candidates
  let candidatesToProcess = [];
  if (Array.isArray(observations) && observations.length > 0) {
    candidatesToProcess = materializeObservations(runId, projectId, observations);
  } else {
    candidatesToProcess = stateStore.getKnowledgeCandidates(runId).map((c) => c.candidateJson || c);
  }

  const verifications = stateStore.getVerifications(runId);
  const approvals = stateStore.getKnowledgeApprovals(runId);
  const obligations = stateStore.getRunObligations(runId);
  const ontologyConstraints = typeof stateStore.listKnowledgeRecords === 'function'
    ? stateStore.listKnowledgeRecords({ projectId, types: ['ontology_constraint'], statuses: ['committed'] })
    : [];

  const verifiedCandidates = [];
  const rejectedCandidates = [];
  const needsApprovalCandidates = [];
  const pendingVerificationCandidates = [];
  const allBindings = [];
  const blockers = [];

  // 2. Process each candidate
  for (const candidate of candidatesToProcess) {
    const bindRes = bindCandidateEvidence(candidate, verifications, { currentRun: run });
    if (bindRes.status !== 'verified') {
      candidate.status = 'rejected';
      rejectedCandidates.push(candidate);
      blockers.push({ candidateId: candidate.candidateId, reason: bindRes.reason });
      stateStore.recordKnowledgeCandidate(candidate.candidateId, runId, {
        projectId,
        proposedType: candidate.proposedType || 'semantic_fact',
        status: 'rejected',
        candidateJson: candidate,
      });
      continue;
    }

    const gateRes = gateOntologyConstraints({ candidate, ontologyConstraints, approvals, obligations });
    candidate.status = gateRes.status;

    if (gateRes.status === 'verified') {
      verifiedCandidates.push(candidate);
    } else if (gateRes.status === 'needs_approval') {
      needsApprovalCandidates.push(candidate);
      blockers.push(...gateRes.blockers);
    } else if (gateRes.status === 'pending_verification') {
      pendingVerificationCandidates.push(candidate);
      blockers.push(...gateRes.blockers);
    } else {
      rejectedCandidates.push(candidate);
      blockers.push(...gateRes.blockers);
    }

    stateStore.recordKnowledgeCandidate(candidate.candidateId, runId, {
      projectId,
      proposedType: candidate.proposedType || 'semantic_fact',
      status: candidate.status,
      candidateJson: candidate,
    });

    allBindings.push(...bindRes.bindings);
    for (const b of bindRes.bindings) {
      stateStore.recordCandidateEvidenceBinding({
        candidateId: candidate.candidateId,
        runId,
        evidenceDigest: b.evidenceRef,
        sourceIdentity: run.sourceIdentity,
        mutationRevision: run.mutationRevision,
      });
    }
  }

  // 3. Evaluate required run obligations
  const staticObligations = run.requiredObligations || [];
  for (const obId of staticObligations) {
    const matchedOb = obligations.find((o) => o.obligationId === obId);
    if (!matchedOb || matchedOb.status !== 'passed') {
      blockers.push({ type: 'static_obligation_unfulfilled', obligationId: obId });
    }
  }

  let reviewStatus = 'passed';
  if (candidatesToProcess.length === 0) {
    reviewStatus = 'no_candidates';
  } else if (needsApprovalCandidates.length > 0) {
    reviewStatus = 'needs_approval';
  } else if (pendingVerificationCandidates.length > 0) {
    reviewStatus = 'pending_verification';
  } else if (rejectedCandidates.length > 0 && verifiedCandidates.length === 0) {
    reviewStatus = 'failed';
  }

  const isReady = blockers.length === 0 && (reviewStatus === 'passed' || reviewStatus === 'no_candidates');
  const snapshotStatus = isReady ? 'ready' : 'blocked';

  const snapshot = new FinalizationAggregateSnapshot({
    runId,
    projectId,
    status: snapshotStatus,
    reviewStatus,
    blockers,
    candidates: candidatesToProcess,
    evidenceBindings: allBindings,
    approvals,
    obligations,
  });

  stateStore.recordKnowledgeReviewReceipt(runId, {
    projectId,
    status: reviewStatus,
    candidateCount: candidatesToProcess.length,
    verifiedCount: verifiedCandidates.length,
    rejectedCount: rejectedCandidates.length,
    waitingApprovalCount: needsApprovalCandidates.length,
    waitingVerificationCount: pendingVerificationCandidates.length,
    reviewDigest: snapshot.reviewDigest,
    receiptJson: snapshot,
  });

  return snapshot;
}

export function approveKnowledgeCandidate(runId, candidateId, { approvedBy, approvalReceipt } = {}, { stateStore = null } = {}) {
  if (!stateStore) {
    throw new Error('stateStore is required for approveKnowledgeCandidate');
  }

  const dbCandidates = stateStore.getKnowledgeCandidates(runId);
  const matchedCand = dbCandidates.find((c) => c.candidateId === candidateId);
  if (!matchedCand) {
    throw new Error(`CANDIDATE_NOT_FOUND: Candidate ${candidateId} not found for run ${runId}`);
  }

  if (matchedCand.status !== 'needs_approval' && matchedCand.status !== 'pending') {
    throw new Error(`INVALID_APPROVAL_TARGET: Candidate ${candidateId} is in status ${matchedCand.status}, cannot approve`);
  }

  const approvalId = `app-${candidateId}-${Date.now()}`;
  return stateStore.recordKnowledgeApproval(approvalId, {
    runId,
    candidateId,
    approvedBy,
    approvalReceipt,
  });
}
