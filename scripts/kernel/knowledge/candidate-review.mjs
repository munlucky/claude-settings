import { evaluateOntologyConstraints } from './ontology-evaluate.mjs';

export async function reviewKnowledgeCandidates({
  candidates = [],
  projectId,
  runId = null,
  stateStore = null,
  evidencePack = null,
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
      let hasApproval = false;
      if (stateStore && runId) {
        const dbApp = stateStore.getKnowledgeApproval(runId, candidate.candidateId);
        hasApproval = Boolean(dbApp && dbApp.approvalReceipt && dbApp.approvedBy);
      }
      if (!hasApproval) {
        const rec = { ...candidate, status: 'needs_approval', rejectionReasons: ['ASK_FIRST_REQUIRED'] };
        needsApprovalCandidates.push(rec);
        candidateReviews.push({ candidateId: candidate.candidateId, decision: 'needs_approval', reason: 'ASK_FIRST_REQUIRED' });
        continue;
      }
    }

    if (ontologyEval.verificationsRequired.length > 0) {
      verificationsRequired.push(...ontologyEval.verificationsRequired);
      let invariantSatisfied = false;
      if (stateStore && runId) {
        let allPassed = true;
        for (const req of ontologyEval.verificationsRequired) {
          const obId = req.obligationId || req.id || 'verify-invariant';
          stateStore.ensureRunObligation(runId, { obligationId: obId, sourceType: 'ontology_constraint', sourceRef: req.id });
          const dbObs = stateStore.getRunObligations(runId);
          const currentOb = dbObs.find((o) => o.obligationId === obId);
          if (!currentOb || (currentOb.status !== 'passed' && currentOb.status !== 'waived')) {
            allPassed = false;
          }
        }
        invariantSatisfied = allPassed;
      }

      if (!invariantSatisfied) {
        const rec = { ...candidate, status: 'pending_verification', rejectionReasons: ['INVARIANT_VERIFICATION_REQUIRED'] };
        pendingVerificationCandidates.push(rec);
        candidateReviews.push({ candidateId: candidate.candidateId, decision: 'pending_verification', reason: 'INVARIANT_VERIFICATION_REQUIRED' });
        continue;
      }
    }

    // 4. Evidence binding check (Fail-closed - Section 6)
    let candidateEvidenceDigest = null;
    if (evidencePack && (evidencePack.status === 'pass' || evidencePack.status === 'passed') && evidencePack.digest) {
      candidateEvidenceDigest = evidencePack.digest;
    } else if (Array.isArray(candidate.evidenceRefs) && candidate.evidenceRefs.length > 0) {
      const ref = candidate.evidenceRefs[0];
      if (stateStore && runId) {
        const verifications = stateStore.getVerifications(runId);
        const match = verifications.find((v) => v.evidenceDigest === ref && v.status === 'passed' && Number(v.exitCode) === 0);
        if (match) {
          candidateEvidenceDigest = ref;
          stateStore.recordCandidateEvidenceBinding({
            candidateId: candidate.candidateId,
            runId,
            evidenceDigest: ref,
            obligationId: match.obligationId || 'default',
            sourceIdentity: match.sourceIdentity,
            mutationRevision: match.verifiedMutationRevision,
            bindingType: 'verification',
          });
        }
      } else {
        candidateEvidenceDigest = ref;
      }
    }

    if (!candidateEvidenceDigest) {
      const rec = { ...candidate, status: 'rejected', rejectionReasons: ['MISSING_VERIFICATION_EVIDENCE'] };
      rejectedCandidates.push(rec);
      candidateReviews.push({ candidateId: candidate.candidateId, decision: 'rejected', reason: 'MISSING_VERIFICATION_EVIDENCE' });
      continue;
    }

    verifiedCandidates.push({
      ...candidate,
      status: 'verified',
      evidenceRefs: [candidateEvidenceDigest],
    });
    candidateReviews.push({ candidateId: candidate.candidateId, decision: 'verified', evidenceRef: candidateEvidenceDigest });
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
