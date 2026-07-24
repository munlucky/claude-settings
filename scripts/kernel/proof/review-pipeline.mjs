// Two-stage review (§31 Superpowers split, §20 role-as-I/O-contract).
//
// Contract review checks public-contract compatibility and acceptance
// semantics; engineering review checks implementation standards and
// complexity. Reviewers are defined by a fixed input/output contract, never a
// long persona. High-risk work (T3) additionally requires an INDEPENDENT
// reviewer whose context differs from the implementer's.

const RANK = { T0: 0, T1: 1, T2: 2, T3: 3 };

export const REVIEW_STAGES = ['contract', 'engineering'];

// Fixed reviewer output contract. No prose personas — just a verdict, findings
// and risks.
export const normalizeReviewVerdict = (verdict = {}) => {
  if (!verdict || typeof verdict !== 'object') throw new Error('review verdict must be an object');
  if (!['pass', 'fail', 'changes-requested'].includes(verdict.verdict)) {
    throw new Error('review verdict must be pass | fail | changes-requested');
  }
  if (!REVIEW_STAGES.includes(verdict.stage)) {
    throw new Error(`review stage must be one of: ${REVIEW_STAGES.join(', ')}`);
  }
  return {
    stage: verdict.stage,
    verdict: verdict.verdict,
    reviewerId: verdict.reviewerId || null,
    findings: Array.isArray(verdict.findings) ? verdict.findings : [],
    risks: Array.isArray(verdict.risks) ? verdict.risks : [],
  };
};

// Which review stages apply, and whether an independent reviewer is required.
export const resolveReviewPlan = ({ riskTier = 'T0', publicContract = false, acceptanceAmbiguity = false, behaviorChanging = false } = {}) => {
  const stages = [];
  if (publicContract || acceptanceAmbiguity || RANK[riskTier] >= RANK.T2) {
    stages.push({ stage: 'contract', permissions: 'read_only', objective: 'Assess public-contract compatibility and acceptance semantics.' });
  }
  if (behaviorChanging || RANK[riskTier] >= RANK.T1) {
    stages.push({ stage: 'engineering', permissions: 'read_only', objective: 'Assess implementation standards and complexity.' });
  }
  return {
    stages,
    independentReviewerRequired: RANK[riskTier] >= RANK.T3,
  };
};

// A T3 review verdict is only valid from a reviewer whose context differs from
// the implementer's.
export const assertIndependentReview = ({ verdict, implementerId }) => {
  if (!verdict.reviewerId) {
    throw new Error('INDEPENDENT_REVIEW_REQUIRED: reviewerId is required for an independent review');
  }
  if (implementerId && verdict.reviewerId === implementerId) {
    throw new Error('INDEPENDENT_REVIEW_REQUIRED: reviewer must be independent of the implementer');
  }
  return true;
};

export const buildReviewContract = ({ stage, objective, acceptance = [], changedPaths = [] } = {}) => ({
  role: 'reviewer',
  stage,
  permissions: 'read_only',
  objective: objective || '',
  input: { acceptance, changedPaths },
  output: { verdict: '', findings: [], risks: [] },
});
