import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import {
  assertAutofixCreatesNewCandidate,
  classifyFinding,
  reviewOutcomeEvidence,
} from '../scripts/lib/review-bundle.mjs';

test('review finding dispositions are bounded and critical blocks FULL score', () => {
  assert.equal(classifyFinding({ severity: 'critical', disposition: 'informational' }).blocksFullScore, true);
  assert.equal(classifyFinding({ severity: 'warning', disposition: 'replan_required' }).blocksFullScore, true);
  assert.equal(classifyFinding({ severity: 'info', disposition: 'informational' }).blocksFullScore, false);
  assert.throws(() => classifyFinding({ disposition: 'merge_anyway' }), /unknown review finding disposition/);
});

test('review outcome maps to runtime event and eval evidence without direct source mutation', () => {
  const evidence = reviewOutcomeEvidence({
    runId: 'run-review',
    goalId: 'goal-review',
    candidate_id: `cand_${'b'.repeat(32)}`,
    bundleDigest: 'c'.repeat(64),
    findings: [{ severity: 'critical', disposition: 'human_decision' }],
  });

  assert.equal(evidence.runtimeEvent.event_type, 'review.completed');
  assert.equal(evidence.evalEvidence.plane, 'review');
  assert.equal(evidence.evalEvidence.status, 'failed');
  assert.equal(Object.hasOwn(evidence, 'writeSource'), false);
  assert.equal(Object.hasOwn(evidence, 'completionDecision'), false);
});

test('autofix disposition requires a new candidate id', () => {
  const finding = { severity: 'warning', disposition: 'autofix_safe' };
  assert.throws(() => assertAutofixCreatesNewCandidate({
    beforeCandidateId: 'cand_same',
    afterCandidateId: 'cand_same',
    finding,
  }), /new candidate_id/);
  assert.equal(assertAutofixCreatesNewCandidate({
    beforeCandidateId: `cand_${'1'.repeat(32)}`,
    afterCandidateId: `cand_${'2'.repeat(32)}`,
    finding,
  }), true);
});

test('review schemas are parseable closed contracts', async () => {
  for (const name of ['review-bundle.schema.json', 'review-finding.schema.json']) {
    const schema = JSON.parse(await readFile(path.join(process.cwd(), 'schemas', name), 'utf8'));
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.type, 'object');
    assert.equal(schema.additionalProperties, false);
  }
});
