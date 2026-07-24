// Measurement-based model routing (§25 P3) — a POLICY hook only. It never
// calls a provider; it recommends a routing action from observed signals and
// leaves the actual model selection and invocation to the Host (§5.1).

export const recommendModelRouting = ({ riskTier = 'T0', stagnant = false, retryCount = 0, independentReviewRequired = false } = {}) => {
  if (stagnant) {
    return { action: 'replan', rationale: 'stagnation detected: repeated failure without progress' };
  }
  if (retryCount >= 2) {
    return { action: 'escalate-model', rationale: 'multiple retries: recommend a stronger model for the next attempt' };
  }
  if (independentReviewRequired || riskTier === 'T3') {
    return { action: 'independent-review', rationale: 'high-risk run: route to an independent reviewer context' };
  }
  return { action: 'stay', rationale: 'no routing change warranted' };
};
