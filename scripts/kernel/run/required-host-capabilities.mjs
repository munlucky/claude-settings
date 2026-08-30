const HIGH_RISK = /(?:security|auth(?:entication|orization)?|payment|migration|data[-_ ]?(?:loss|deletion)|irreversible)/i;

export const requiredHostCapabilities = (contract = {}) => {
  const riskText = [...(contract.risks || []), ...(contract.surfaces || []), ...Object.keys(contract.flags || {}).filter((key) => contract.flags[key])].join(' ');
  const protectedReview = HIGH_RISK.test(riskText)
    || (contract.requiredObligations || []).some((item) => /(?:security|review|auth|payment|migration|deletion)/i.test(item));
  return {
    proofExecution: (contract.acceptance || []).length > 0,
    independentReviewer: protectedReview,
    readOnlyReview: protectedReview,
  };
};

export const assertRequiredHostCapabilities = (contract, hostCapabilities) => {
  const required = requiredHostCapabilities(contract);
  const missing = [];
  if (required.proofExecution && hostCapabilities.supportsProofExecution !== true) missing.push('proof-command-execution');
  if (required.independentReviewer && hostCapabilities.supportsCrossSurfaceReview !== true && hostCapabilities.supportsIndependentContext !== true) missing.push('independent-reviewer');
  if (required.readOnlyReview && hostCapabilities.supportsReadOnlyReview !== true) missing.push('read-only-review');
  if (missing.length) {
    const error = new Error(`required_host_capability_missing: ${missing.join(', ')}`);
    error.code = 'REQUIRED_HOST_CAPABILITY_MISSING';
    throw error;
  }
  return { admitted: true, required };
};
