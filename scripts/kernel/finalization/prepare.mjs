import { FinalizationAggregateSnapshot } from './model.mjs';
import { materializeObservations } from '../knowledge/candidate-materializer.mjs';
import { bindCandidateEvidence } from '../knowledge/evidence-binder.mjs';
import { gateOntologyConstraints } from '../knowledge/ontology-gate.mjs';

export async function prepareFinalization(runId, { observations = [], expectedMutationRevision = null, allowCallerId = false } = {}, { stateStore = null } = {}) {
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

  // 1. Candidate materialization & merger
  // Step 1: Load existing DB candidates for this run
  const existingCandidates = stateStore.listCandidates
    ? stateStore.listCandidates(runId)
    : (stateStore.getKnowledgeCandidates ? stateStore.getKnowledgeCandidates(runId) : []);

  // Step 2: Materialize new observations and persist to DB in 'observed' status
  let newlyMaterialized = [];
  if (Array.isArray(observations) && observations.length > 0) {
    newlyMaterialized = materializeObservations(runId, projectId, observations, { allowCallerId: true });
    for (const cand of newlyMaterialized) {
      if (stateStore.saveCandidate) {
        stateStore.saveCandidate(runId, cand);
      } else if (stateStore.recordKnowledgeCandidate) {
        stateStore.recordKnowledgeCandidate(cand.candidateId, runId, { projectId, proposedType: cand.proposedType, status: 'observed', candidateJson: cand });
      }
    }
  }

  // Step 3: Combine all candidates by candidateId (preserve existing DB candidates)
  const candidateMap = new Map();
  for (const c of existingCandidates) {
    const raw = c.candidateJson || c;
    candidateMap.set(c.candidateId || raw.candidateId, { ...raw, candidateId: c.candidateId || raw.candidateId, status: c.status || raw.status });
  }
  for (const c of newlyMaterialized) {
    if (!candidateMap.has(c.candidateId)) {
      candidateMap.set(c.candidateId, c);
    }
  }
  const allCandidates = Array.from(candidateMap.values());

  // Latest verification per obligation_id (used for evidence binding)
  const verifications = stateStore.listVerifications
    ? stateStore.listVerifications(runId)
    : (stateStore.getVerifications ? stateStore.getVerifications(runId) : []);

  // All verifications for acceptance coverage aggregation
  const allVerifications = stateStore.getAllVerifications
    ? stateStore.getAllVerifications(runId)
    : verifications;

  const approvals = stateStore.listApprovals
    ? stateStore.listApprovals(runId)
    : (stateStore.getKnowledgeApprovals ? stateStore.getKnowledgeApprovals(runId) : []);

  const obligations = stateStore.listRunObligations
    ? stateStore.listRunObligations(runId)
    : (stateStore.getRunObligations ? stateStore.getRunObligations(runId) : []);

  const ontologyConstraints = typeof stateStore.listKnowledgeRecords === 'function'
    ? stateStore.listKnowledgeRecords({ projectId, types: ['ontology_constraint'], statuses: ['committed', 'verified'] })
    : [];

  const verifiedCandidates = [];
  const rejectedCandidates = [];
  const needsApprovalCandidates = [];
  const pendingVerificationCandidates = [];
  const allBindings = [];
  const blockers = [];

  // Helper to persist candidate status updates
  const persistCandidate = (cand) => {
    if (stateStore.saveCandidate) {
      stateStore.saveCandidate(runId, cand);
    } else if (stateStore.recordKnowledgeCandidate) {
      stateStore.recordKnowledgeCandidate(cand.candidateId, runId, {
        projectId,
        proposedType: cand.proposedType || 'semantic_fact',
        status: cand.status || 'observed',
        candidateJson: cand,
      });
    }
  };

  // 2. Process each candidate against Evidence Binder & Ontology Gate
  for (const candidate of allCandidates) {
    const bindRes = bindCandidateEvidence(candidate, verifications, { currentRun: run });
    if (bindRes.status !== 'verified') {
      candidate.status = 'rejected';
      rejectedCandidates.push(candidate);
      blockers.push({ candidateId: candidate.candidateId, reason: bindRes.reason });
      persistCandidate(candidate);
      continue;
    }

    const gateRes = gateOntologyConstraints({ candidate, ontologyConstraints, approvals, obligations });
    candidate.status = gateRes.status;

    // Generate dynamic obligation if ontology severity is always/invariant
    if (gateRes.dynamicObligation) {
      if (stateStore.ensureRunObligation) {
        stateStore.ensureRunObligation(runId, gateRes.dynamicObligation);
      }
    }

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

    persistCandidate(candidate);

    allBindings.push(...bindRes.bindings);
    for (const b of bindRes.bindings) {
      if (stateStore.saveEvidenceBinding) {
        stateStore.saveEvidenceBinding(candidate.candidateId, b.verificationId, runId, b.evidenceDigest, run.sourceIdentity, run.mutationRevision);
      }
    }
  }

  // 3. Static & Dynamic Obligations (check required_obligations separately from acceptance_criteria)
  const staticObligations = run.requiredObligations || [];
  const passedVerifications = new Set(verifications.filter((v) => v.status === 'passed' && Number(v.exitCode) === 0).map((v) => v.obligationId || 'default'));

  for (const obId of staticObligations) {
    // Only allow 'default' fallback when staticObligations = ['default'] itself
    if (!passedVerifications.has(obId)) {
      blockers.push({ type: 'static_obligation_unfulfilled', obligationId: obId });
    }
  }

  // 4. Acceptance Criteria Coverage Check (Section 5.9)
  // Aggregate coverage from ALL verifications, not just latest per obligation_id
  const coveredAcceptance = new Set(allVerifications.flatMap((v) => v.acceptanceCoverage || []));
  const uncoveredAcceptance = (run.acceptanceCriteria || []).filter((criterion) => !coveredAcceptance.has(criterion));
  if (uncoveredAcceptance.length > 0) {
    blockers.push({ type: 'acceptance_criteria_uncovered', criteria: uncoveredAcceptance });
  }

  // 5. Release Evidence Check (Section 5.10)
  const releaseEvidenceObj = { required: Boolean(run.releaseEvidenceRequired), present: false, currentMutationRevision: false, digest: null };
  if (run.releaseEvidenceRequired) {
    const latestPack = stateStore.getLatestEvidencePack ? stateStore.getLatestEvidencePack(runId) : null;
    if (!latestPack || latestPack.tier !== 'E2' || Number(latestPack.mutationRevision) !== Number(run.mutationRevision) || !/^sha256:[a-f0-9]{64}$/i.test(latestPack.digest)) {
      blockers.push({ type: 'release_evidence_missing_or_stale', required: true });
    } else {
      releaseEvidenceObj.present = true;
      releaseEvidenceObj.currentMutationRevision = true;
      releaseEvidenceObj.digest = latestPack.digest;
    }
  }

  const hasRejectedWithBoundEvidence = rejectedCandidates.length > 0;
  const reviewStatus = blockers.length === 0
    ? 'passed'
    : (needsApprovalCandidates.length > 0
      ? 'needs_approval'
      : (hasRejectedWithBoundEvidence || allCandidates.length > 0 ? 'failed' : 'blocked'));
  const readinessStatus = blockers.length === 0 ? 'ready' : 'blocked';

  return new FinalizationAggregateSnapshot({
    run,
    staticObligations,
    dynamicObligations: obligations,
    candidates: allCandidates,
    candidateBindings: allBindings,
    approvals,
    reviewReceipt: { status: reviewStatus, candidateCount: allCandidates.length },
    verificationSummary: {
      passedObligations: Array.from(passedVerifications),
      failedObligations: [],
      staleObligations: [],
    },
    acceptanceSummary: {
      required: run.acceptanceCriteria || [],
      covered: Array.from(coveredAcceptance),
      uncovered: uncoveredAcceptance,
    },
    releaseEvidence: releaseEvidenceObj,
    readiness: {
      status: readinessStatus,
      blockers,
    },
  });
}

export function approveKnowledgeCandidate(runId, candidateId, { approvedBy, approvalReceipt } = {}, { stateStore = null } = {}) {
  if (!stateStore) {
    throw new Error('stateStore is required for approveKnowledgeCandidate');
  }

  if (!approvedBy || typeof approvedBy !== 'string' || approvedBy.trim() === '') {
    throw new Error('MISSING_APPROVED_BY: approvedBy is required');
  }

  if (!approvalReceipt || typeof approvalReceipt !== 'string' || approvalReceipt.trim() === '') {
    throw new Error('MISSING_APPROVAL_RECEIPT: approvalReceipt is required');
  }

  const run = stateStore.getRun(runId);
  if (!run) {
    throw new Error(`Run ${runId} not found`);
  }

  const candidates = stateStore.listCandidates ? stateStore.listCandidates(runId) : stateStore.getKnowledgeCandidates(runId);
  const matchedCand = candidates.find((c) => c.candidateId === candidateId);
  if (!matchedCand) {
    throw new Error(`CANDIDATE_NOT_FOUND: Candidate ${candidateId} not found for run ${runId}`);
  }

  if (matchedCand.status !== 'needs_approval') {
    throw new Error(`INVALID_APPROVAL_TARGET: Candidate ${candidateId} is in status ${matchedCand.status}, must be needs_approval`);
  }

  // mutationRevision may be on top-level or inside candidateJson
  const candMutRev = matchedCand.mutationRevision !== undefined
    ? matchedCand.mutationRevision
    : (matchedCand.candidateJson ? matchedCand.candidateJson.mutationRevision : undefined);

  // Only enforce mutationRevision check if the candidate records it
  if (candMutRev !== undefined && candMutRev !== null && Number(candMutRev) !== Number(run.mutationRevision)) {
    throw new Error(`STALE_CANDIDATE_MUTATION: Candidate ${candidateId} was created at mutation revision ${candMutRev}, current is ${run.mutationRevision}`);
  }

  const existingApprovals = stateStore.listApprovals ? stateStore.listApprovals(runId) : stateStore.getKnowledgeApprovals(runId);
  if (existingApprovals.some((a) => a.candidateId === candidateId)) {
    throw new Error(`DUPLICATE_APPROVAL: Candidate ${candidateId} already has an active approval`);
  }

  const approvalId = `app-${candidateId}-${Date.now()}`;
  if (stateStore.saveApproval) {
    stateStore.saveApproval(approvalId, { runId, candidateId, approvedBy, approvalReceipt });
  } else {
    stateStore.recordKnowledgeApproval(approvalId, { runId, candidateId, approvedBy, approvalReceipt });
  }

  return { approvalId, runId, candidateId, status: 'approved' };
}
