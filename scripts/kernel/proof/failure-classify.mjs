// Classifies verification failures relative to a pre-change baseline (§16.3)
// into three mutually-exclusive buckets, so unrelated pre-existing breakage
// does not block the task and genuine task-caused regressions are not excused
// as "already broken".
//
// Each current failure lands in exactly one bucket:
// - taskBlocking: touches a changed path (our fault regardless of baseline)
// - preExisting: was failing at baseline and does not touch a changed path
// - unrelated: newly failing but touches no changed path (ambient / flaky)

const overlapsChangedPaths = (failure, changedPaths = []) => {
  const refs = [failure.obligationId, failure.commandRef, failure.command, ...(failure.paths || [])]
    .filter(Boolean)
    .map(String);
  return changedPaths.some((changed) => refs.some((ref) => ref.includes(changed) || changed.includes(ref)));
};

export const classifyFailures = ({ baselineFailures = [], currentFailures = [], changedPaths = [] } = {}) => {
  const baselineKeys = new Set(baselineFailures.map((failure) => failure.obligationId || failure.commandRef || failure.command));

  const taskBlockingFailures = [];
  const unrelatedFailures = [];
  const preExistingFailures = [];

  for (const failure of currentFailures) {
    const key = failure.obligationId || failure.commandRef || failure.command;
    const wasFailingAtBaseline = baselineKeys.has(key);
    const touchesChange = overlapsChangedPaths(failure, changedPaths);

    if (touchesChange) taskBlockingFailures.push(failure);
    else if (wasFailingAtBaseline) preExistingFailures.push(failure);
    else unrelatedFailures.push(failure);
  }

  return { taskBlockingFailures, unrelatedFailures, preExistingFailures };
};
