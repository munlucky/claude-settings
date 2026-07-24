import { planSafeWaves } from '../wave-plan.mjs';

// Bounded multi-agent scheduling (§20). Worker count defaults to 1; parallel
// execution is only permitted for provably-safe waves and is capped: general
// max 2, and 3 only when a high-risk run also carries an independent review.
// Kernel plans and bounds the waves; the Host executes them — no agent
// spawning happens in the core.

export const resolveWorkerBound = ({ riskTier = 'T0', includeIndependentReview = false } = {}) => {
  if (riskTier === 'T3' && includeIndependentReview) return 3;
  return 2;
};

// Every slice in a parallel wave must own a disjoint write set and carry its
// own verification; the plan as a whole must define an integration check.
const sliceIsParallelSafe = (slice) => Array.isArray(slice.ownedPaths) && slice.ownedPaths.length > 0
  && Boolean(slice.verification || slice.evidenceCommand || slice.evidence?.command);

export const planBoundedWaves = (slices = [], { riskTier = 'T0', includeIndependentReview = false, integrationVerification = null } = {}) => {
  const maxWorkers = resolveWorkerBound({ riskTier, includeIndependentReview });
  const safe = planSafeWaves(slices);
  const sliceById = new Map(slices.map((s) => [s.id, s]));

  const waves = [];
  for (const wave of safe.waves) {
    const members = wave.slices.map((id) => sliceById.get(id)).filter(Boolean);
    const allParallelSafe = members.length > 1 && members.every(sliceIsParallelSafe) && Boolean(integrationVerification);

    // Cap the parallel width to the worker bound; overflow spills into
    // additional sequential-ordered chunks.
    for (let i = 0; i < wave.slices.length; i += maxWorkers) {
      const chunk = wave.slices.slice(i, i + maxWorkers);
      const parallelEligible = allParallelSafe && chunk.length > 1;
      waves.push({
        index: waves.length + 1,
        mode: parallelEligible ? 'parallel' : 'sequential',
        workers: parallelEligible ? chunk.length : 1,
        slices: chunk,
        deferred: i === 0 ? wave.deferred : [],
        parallelEligible,
      });
    }
  }

  return {
    defaultMode: 'sequential',
    maxWorkers,
    integrationVerificationRequired: true,
    integrationVerification: integrationVerification || null,
    waves,
  };
};

// Role-as-I/O-contract for a bounded worker (§20): no persona, just scope and
// the expected output shape.
export const buildWorkerContract = (slice = {}) => ({
  role: 'worker',
  sliceId: slice.id,
  permissions: 'workspace_write',
  ownedPaths: slice.ownedPaths || [],
  objective: slice.objective || '',
  verification: slice.verification || slice.evidenceCommand || slice.evidence?.command || null,
  output: { changedPaths: [], evidenceRef: '', status: '' },
});
