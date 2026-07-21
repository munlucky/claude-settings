import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { resolveProofRoute } from '../scripts/kernel/proof-route.mjs';

const corpus = JSON.parse(await readFile(new URL('./fixtures/kernel-eval/corpus.json', import.meta.url), 'utf8'));

test('corpus contains thirty balanced representative cases', () => {
  assert.ok(corpus.cases.length >= 30);
  const counts = {};
  for (const c of corpus.cases) {
    counts[c.taskClass] = (counts[c.taskClass] || 0) + 1;
  }
  for (const c of ['analysis', 'bug', 'feature', 'refactor', 'ui', 'long-running']) {
    assert.equal(counts[c], 5);
  }
});

test('every case declares risk, route, source, and evidence and resolves proof route cleanly', () => {
  for (const c of corpus.cases) {
    assert.match(c.id, /^KRN-EVAL-\d{3}$/);
    assert.ok(['T0', 'T1', 'T2', 'T3'].includes(c.riskTier));
    assert.ok(c.expectedRoute.length >= 2);
    assert.ok(c.requiredEvidence.length);

    // Execute proof route resolution for each eval case
    const proofRoute = resolveProofRoute({
      requestedTier: c.riskTier,
      filesChanged: c.filesChanged || 1,
      surfaces: c.surfaces || [],
    });
    assert.ok(['T0', 'T1', 'T2', 'T3'].includes(proofRoute.proofTier));
    assert.ok(['E0', 'E1', 'E2'].includes(proofRoute.evidenceTier));
    assert.ok(Array.isArray(proofRoute.requiredChecks));
  }
});
