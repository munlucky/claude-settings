// Stagnation detection (§25 P3). Repeated attempts that keep failing on the
// same obligation with the same evidence — no forward progress — signal that
// the current approach is stuck and a replan is warranted.

const DEFAULT_THRESHOLD = 3;

export const detectStagnation = ({ attempts = [], verifications = [], threshold = DEFAULT_THRESHOLD } = {}) => {
  const failedAttempts = attempts.filter((attempt) => attempt.status === 'failed');
  if (failedAttempts.length < threshold) {
    return { stagnant: false, reason: 'below-threshold', failedAttempts: failedAttempts.length };
  }

  // Group the most recent verification per obligation and detect ones that are
  // still failing. Stagnation is repeated failure with no digest movement.
  const failingByObligation = new Map();
  for (const verification of verifications) {
    if (verification.status === 'failed') {
      failingByObligation.set(verification.obligationId, verification);
    } else {
      failingByObligation.delete(verification.obligationId);
    }
  }

  if (failingByObligation.size === 0) {
    return { stagnant: false, reason: 'no-failing-obligation', failedAttempts: failedAttempts.length };
  }

  const [obligationId] = [...failingByObligation.keys()];
  return {
    stagnant: true,
    reason: 'repeated-failure-no-progress',
    repeatedObligation: obligationId,
    failedAttempts: failedAttempts.length,
  };
};
