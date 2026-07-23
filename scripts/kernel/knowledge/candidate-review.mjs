import { evaluateOntologyConstraints } from './ontology-evaluate.mjs';

export async function reviewKnowledgeCandidates({
  candidates = [],
  projectId,
  evidencePack = null,
  approvals = [],
  env = process.env,
} = {}) {
  if (!candidates || candidates.length === 0) {
    return {
      status: 'no_candidates',
      verifiedCandidates: [],
      rejectedCandidates: [],
      needsApprovalCandidates: [],
      pendingVerificationCandidates: [],
      candidateReviews: [],
      supersessionProposals: [],
      ontologyViolations: [],
      approvalRequired: [],
      verificationsRequired: [],
      evidenceCoverage: [],
    };
  }

  const verifiedCandidates = [];
  const rejectedCandidates = [];
  const needsApprovalCandidates = [];
  const pendingVerificationCandidates = [];
  const ontologyViolations = [];
  const approvalRequired = [];
  const verificationsRequired = [];
  const candidateReviews = [];

  const existingApprovalReceipts = new Set(
    (Array.isArray(approvals) ? approvals : []).map((a) => a.candidateId || a.approvalReceipt || a)
  );

  for (const candidate of candidates) {
    // 1. Project ID boundary check
    if (candidate.projectId && candidate.projectId !== projectId) {
      const rec = { ...candidate, status: 'rejected', rejectionReasons: ['PROJECT_ID_MISMATCH'] };
      rejectedCandidates.push(rec);
      candidateReviews.push({ candidateId: candidate.candidateId, decision: 'rejected', reason: 'PROJECT_ID_MISMATCH' });
      continue;
    }

    // 2. Safety check: secret leak
    if (/sk-[a-zA-Z0-9]{20,}/.test(candidate.statement) || (candidate.statement && candidate.statement.includes('raw_transcript_body'))) {
      const rec = { ...candidate, status: 'rejected', rejectionReasons: ['FORBIDDEN_SAFETY_LEAK'] };
      rejectedCandidates.push(rec);
      candidateReviews.push({ candidateId: candidate.candidateId, decision: 'rejected', reason: 'FORBIDDEN_SAFETY_LEAK' });
      continue;
    }

    // 3. Per-candidate ontology constraint evaluation
    const ontologyEval = await evaluateOntologyConstraints({
      projectId,
      paths: candidate.scope || [],
      statements: [candidate.statement],
      env,
    });

    if (ontologyEval.violations.length > 0) {
      ontologyViolations.push(...ontologyEval.violations);
      const rec = { ...candidate, status: 'rejected', rejectionReasons: ['ONTOLOGY_NEVER_VIOLATION'] };
      rejectedCandidates.push(rec);
      candidateReviews.push({ candidateId: candidate.candidateId, decision: 'rejected', reason: 'ONTOLOGY_NEVER_VIOLATION' });
      continue;
    }

    if (ontologyEval.approvalRequired.length > 0) {
      approvalRequired.push(...ontologyEval.approvalRequired);
      const hasApproval = existingApprovalReceipts.has(candidate.candidateId);
      if (!hasApproval) {
        const rec = { ...candidate, status: 'needs_approval', rejectionReasons: ['ASK_FIRST_REQUIRED'] };
        needsApprovalCandidates.push(rec);
        candidateReviews.push({ candidateId: candidate.candidateId, decision: 'needs_approval', reason: 'ASK_FIRST_REQUIRED' });
        continue;
      }
    }

    if (ontologyEval.verificationsRequired.length > 0) {
      verificationsRequired.push(...ontologyEval.verificationsRequired);
      const rec = { ...candidate, status: 'pending_verification', rejectionReasons: ['INVARIANT_VERIFICATION_REQUIRED'] };
      pendingVerificationCandidates.push(rec);
      candidateReviews.push({ candidateId: candidate.candidateId, decision: 'pending_verification', reason: 'INVARIANT_VERIFICATION_REQUIRED' });
      continue;
    }

    // 4. Evidence binding check (Fail-closed)
    const hasEvidencePack = evidencePack && (evidencePack.status === 'pass' || evidencePack.status === 'passed');
    const hasCandidateEvidence = Array.isArray(candidate.evidenceRefs) && candidate.evidenceRefs.length > 0;
    if (!hasEvidencePack && !hasCandidateEvidence) {
      const rec = { ...candidate, status: 'rejected', rejectionReasons: ['MISSING_VERIFICATION_EVIDENCE'] };
      rejectedCandidates.push(rec);
      candidateReviews.push({ candidateId: candidate.candidateId, decision: 'rejected', reason: 'MISSING_VERIFICATION_EVIDENCE' });
      continue;
    }

    const evidenceDigest = evidencePack?.digest || candidate.evidenceRefs?.[0] || 'evidence-pass';
    verifiedCandidates.push({
      ...candidate,
      status: 'verified',
      evidenceRefs: [evidenceDigest],
    });
    candidateReviews.push({ candidateId: candidate.candidateId, decision: 'verified', evidenceRef: evidenceDigest });
  }

  let status = 'passed';
  if (ontologyViolations.length > 0 || (rejectedCandidates.length === candidates.length && candidates.length > 0)) {
    status = 'failed';
  } else if (needsApprovalCandidates.length > 0) {
    status = 'needs_approval';
  } else if (pendingVerificationCandidates.length > 0) {
    status = 'pending_verification';
  }

  return {
    status,
    verifiedCandidates,
    rejectedCandidates,
    needsApprovalCandidates,
    pendingVerificationCandidates,
    candidateReviews,
    supersessionProposals: [],
    ontologyViolations,
    approvalRequired,
    verificationsRequired,
    evidenceCoverage: evidencePack ? [evidencePack.digest || 'evidence-pack'] : [],
  };
}
