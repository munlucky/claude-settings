export const requiredHostCapabilities = (contract = {}) => {
  return {
    proofExecution: (contract.acceptance || []).length > 0,
    // Reviewer transport is selected at the actual reviewer dispatch edge.
    // Keeping these fields preserves the capability summary shape for callers
    // without making the owner adapter a prerequisite for a later reviewer.
    independentReviewer: false,
    readOnlyReview: false,
  };
};

export const assertRequiredHostCapabilities = (contract, hostCapabilities) => {
  const required = requiredHostCapabilities(contract);
  const missing = [];
  if (required.proofExecution && hostCapabilities.supportsProofExecution !== true) missing.push('proof-command-execution');
  if (missing.length) {
    const error = new Error(`required_host_capability_missing: ${missing.join(', ')}`);
    error.code = 'REQUIRED_HOST_CAPABILITY_MISSING';
    throw error;
  }
  return { admitted: true, required };
};
