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
    // Safety check: secret or transcript leak
    if (/sk-[a-zA-Z0-9]{20,}/.test(candidate.statement) || candidate.statement.includes('raw_transcript_body')) {
      rejectedCandidates.push({
        ...candidate,
        status: 'rejected',
        rejectionReasons: ['FORBIDDEN_SAFETY_LEAK'],
      });
      continue;
    }

    // Factuality check: evidence required
    if (!evidencePack || (evidencePack.status !== 'pass' && evidencePack.status !== 'passed')) {
      rejectedCandidates.push({
        ...candidate,
        status: 'rejected',
        rejectionReasons: ['MISSING_VERIFICATION_EVIDENCE'],
      });
      continue;
    }

    // Pass review
    verifiedCandidates.push({
      ...candidate,
      status: 'verified',
      evidenceRefs: [evidencePack.digest || 'evidence-pass'],
    });
  }

  const status = ontologyViolations.length > 0
    ? 'failed'
    : approvalRequired.length > 0
      ? 'needs_approval'
      : 'passed';

  return {
    status,
    verifiedCandidates,
    episodicCandidates,
    rejectedCandidates,
    supersessionProposals: [],
    ontologyViolations,
    approvalRequired,
    evidenceCoverage: evidencePack ? [evidencePack.digest || 'evidence-pack'] : [],
  };
}
