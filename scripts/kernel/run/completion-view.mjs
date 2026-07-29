export const computeCompletionView = ({
  run,
  step = null,
  verifications = [],
  obligations = [],
  reviews = [],
  completionDecision = null,
} = {}) => {
  const required = obligations.filter((item) => item.status === 'required');
  const hard = required.filter((item) => item.evidenceClass === 'hard');
  const judgment = required.filter((item) => item.evidenceClass === 'judgment');
  const passed = new Set(verifications.filter((item) => item.status === 'passed').map((item) => item.obligationId));
  const anyFailed = verifications.some((item) => item.status === 'failed');
  const reviewFailed = reviews.some((item) => item.verdict !== 'pass');
  const implementation = step
    ? (step.state === 'passed' ? 'complete' : ['active', 'ready'].includes(step.state) ? 'active' : 'pending')
    : (run?.mutationRevision > 0 ? 'complete' : 'pending');
  const verification = hard.length === 0
    ? 'not-required'
    : anyFailed ? 'failed' : hard.every((item) => passed.has(item.obligationId)) ? 'passed' : 'pending';
  const review = judgment.length === 0
    ? 'not-required'
    : reviewFailed ? 'failed' : judgment.every((item) => passed.has(item.obligationId)) ? 'passed' : 'pending';
  const kernelAcceptance = completionDecision?.decision === 'accepted' ? 'accepted'
    : completionDecision?.decision === 'rejected' ? 'rejected' : 'pending';
  const finalization = run?.finalizationStatus === 'completed' ? 'complete' : 'pending';
  const blocked = run?.status === 'blocked' || verification === 'failed' || review === 'failed' || kernelAcceptance === 'rejected';
  const done = kernelAcceptance === 'accepted' && finalization === 'complete';
  return {
    implementation,
    verification,
    review,
    kernelAcceptance,
    finalization,
    overall: done ? 'done' : blocked ? 'blocked' : 'active',
  };
};
