export function bindCandidateEvidence(candidate, verifications = [], { currentRun = null } = {}) {
  const bindings = [];
  const refs = candidate.evidenceRefs || [];
  if (refs.length === 0) {
    return { status: 'rejected', reason: 'missing_evidence_refs', bindings: [] };
  }

  for (const ref of refs) {
    const matchedVer = verifications.find((v) =>
      v.status === 'passed' &&
      Number(v.exitCode) === 0 &&
      (v.evidenceRef === ref || v.evidenceDigest === ref || `sha256:${v.evidenceDigest}` === ref || (v.evidenceRef && ref.includes(v.evidenceRef))) &&
      (!currentRun || !v.sourceIdentity || v.sourceIdentity === currentRun.sourceIdentity) &&
      (!currentRun || v.verifiedMutationRevision === undefined || v.verifiedMutationRevision === null || Number(v.verifiedMutationRevision) === Number(currentRun.mutationRevision))
    );

    if (matchedVer) {
      bindings.push({
        candidateId: candidate.candidateId,
        verificationId: String(matchedVer.id || `ver-${matchedVer.evidenceDigest || '1'}`),
        evidenceRef: ref,
        status: 'passed',
      });
    }
  }

  if (bindings.length === 0) {
    return { status: 'rejected', reason: 'unverified_evidence_refs', bindings: [] };
  }

  return { status: 'verified', bindings };
}
