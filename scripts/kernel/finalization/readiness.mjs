export function evaluateReadiness(snapshot) {
  if (!snapshot) return { isReady: false, reason: 'missing_snapshot' };
  if (snapshot.status === 'ready') {
    return { isReady: true, reviewStatus: snapshot.reviewStatus };
  }
  return {
    isReady: false,
    reviewStatus: snapshot.reviewStatus,
    blockers: snapshot.blockers || [],
  };
}
