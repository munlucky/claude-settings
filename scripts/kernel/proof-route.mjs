import { isHighRiskSurface } from './risk-surfaces.mjs';

const rank = { T0: 0, T1: 1, T2: 2, T3: 3 };

export const selectProofTier = (task = {}) => {
  let tier = task.requestedTier || (task.behaviorChanging ? 'T1' : 'T0');
  if (task.filesChanged > 8 || task.crossLayer) tier = rank[tier] < rank.T2 ? 'T2' : tier;
  if ((task.surfaces || []).some((s) => isHighRiskSurface(s))) tier = 'T3';
  return tier;
};

export const evidenceTierForProof = (proofTier) => (proofTier === 'T0' ? 'E0' : proofTier === 'T3' ? 'E2' : 'E1');
