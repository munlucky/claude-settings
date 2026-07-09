import { validateMemoryClaim } from './memory-control-plane-contracts.mjs';

export function normalizeMemoryClaim(claim = {}) {
  return {
    schemaVersion: 1,
    status: 'candidate',
    scope: 'run',
    stage: 'execute',
    confidence: 'candidate',
    sensitivity: 'unknown',
    validity: {
      validFrom: '',
      validTo: null,
      supersedes: [],
    },
    provenance: {
      sourceRef: '',
      sourceCommand: '',
      artifactSha256: '',
    },
    evidence: [],
    ...claim,
  };
}

export function appendMemoryClaimDecision(ledger = [], claim = {}) {
  const normalized = normalizeMemoryClaim(claim);
  const validation = validateMemoryClaim(normalized);
  const decision = {
    decisionId: `memory-claim:${normalized.claimId || ledger.length + 1}:${ledger.length + 1}`,
    claimId: normalized.claimId || '',
    status: validation.ok ? 'accepted' : 'rejected',
    violations: validation.violations,
    claim: normalized,
  };
  return [...ledger, decision];
}
