import { evaluateOntologyConstraints } from './ontology-evaluate.mjs';

export async function reviewKnowledgeCandidates({
  candidates = [],
  projectId,
  evidencePack = null,
  env = process.env,
} = {}) {
  const verifiedCandidates = [];
  const episodicCandidates = [];
  const rejectedCandidates = [];
  const ontologyViolations = [];
  const approvalRequired = [];
  const candidateReviews = [];

  const ontologyEval = await evaluateOntologyConstraints({
    projectId,
    paths: candidates.flatMap((c) => c.scope || []),
    env,
  });

  if (!ontologyEval.passed) {
    ontologyViolations.push(...ontologyEval.violations);
  }
  approvalRequired.push(...ontologyEval.approvalRequired);

  for (const candidate of candidates) {
    // Project ID boundary check
    if (candidate.projectId && candidate.projectId !== projectId) {
      rejectedCandidates.push({
        ...candidate,
        status: 'rejected',
        rejectionReasons: ['PROJECT_ID_MISMATCH'],
      });
      candidateReviews.push({ candidateId: candidate.candidateId, decision: 'rejected', reason: 'PROJECT_ID_MISMATCH' });
      continue;
    }

    // Safety check: secret or transcript leak
    if (/sk-[a-zA-Z0-9]{20,}/.test(candidate.statement) || candidate.statement.includes('raw_transcript_body')) {
      rejectedCandidates.push({
        ...candidate,
        status: 'rejected',
        rejectionReasons: ['FORBIDDEN_SAFETY_LEAK'],
      });
      candidateReviews.push({ candidateId: candidate.candidateId, decision: 'rejected', reason: 'FORBIDDEN_SAFETY_LEAK' });
      continue;
    }

    // Check ontology violations matching candidate scope
    const candidateScopes = candidate.scope || [];
    const matchedViolation = ontologyViolations.find((v) => {
      if (!v.scope || v.scope.length === 0) return true;
      return candidateScopes.some((cs) => v.scope.includes(cs));
    });

    if (matchedViolation) {
      rejectedCandidates.push({
        ...candidate,
        status: 'rejected',
        rejectionReasons: ['ONTOLOGY_VIOLATION'],
      });
      candidateReviews.push({ candidateId: candidate.candidateId, decision: 'rejected', reason: 'ONTOLOGY_VIOLATION' });
      continue;
    }

    // Factuality check: evidence required
    if (!evidencePack || (evidencePack.status !== 'pass' && evidencePack.status !== 'passed')) {
      rejectedCandidates.push({
        ...candidate,
        status: 'rejected',
        rejectionReasons: ['MISSING_VERIFICATION_EVIDENCE'],
      });
      candidateReviews.push({ candidateId: candidate.candidateId, decision: 'rejected', reason: 'MISSING_VERIFICATION_EVIDENCE' });
      continue;
    }

    // Pass review
    verifiedCandidates.push({
      ...candidate,
      status: 'verified',
      evidenceRefs: [evidencePack.digest || 'evidence-pass'],
    });
    candidateReviews.push({ candidateId: candidate.candidateId, decision: 'verified', evidenceRef: evidencePack.digest || 'evidence-pass' });
  }

  const status = ontologyViolations.length > 0
    ? 'failed'
    : approvalRequired.length > 0
      ? 'needs_approval'
      : 'passed';

  return {
    status,
    verifiedCandidates: status === 'failed' ? [] : verifiedCandidates,
    episodicCandidates,
    rejectedCandidates,
    candidateReviews,
    supersessionProposals: [],
    ontologyViolations,
    approvalRequired,
    evidenceCoverage: evidencePack ? [evidencePack.digest || 'evidence-pack'] : [],
  };
}
