import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  HARNESS_META_PROJECT,
  LIFECYCLE_STATES,
  TARGETS,
  evaluateImprovementProposal,
  harnessMetaProjectContract,
  isTransitionAllowed,
  validateImprovementProposal,
} from './knowledge-improvement-lifecycle.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(MODULE_DIR, '../schemas/improvement-proposal.schema.json');
const NOW = '2026-05-30T00:00:00Z';

function evidence(pathName, status = 'passed') {
  return { path: pathName, status };
}

function proposal(overrides = {}) {
  const baseProposal = {
    schemaVersion: 1,
    proposalId: 'proposal-1',
    projectId: 'demo-project',
    target: 'project-local',
    state: 'stage',
    promotionTier: 'project-local',
    createdAt: NOW,
    updatedAt: NOW,
    summary: 'Capture a reusable project knowledge improvement.',
    supersedes: [],
    candidate: {
      kind: 'observation',
      sourceType: 'repo_file',
      trustTier: 'derived',
      statement: 'Project knowledge summaries must stay compact.',
      sourceRef: 'docs/implementation/project-knowledge-plane-system-prompt-2026-05-29/00-master-plan-v1.md',
      ...overrides.candidate,
    },
    evidence: {
      ...overrides.evidence,
    },
  };
  const { candidate = {}, evidence: evidenceOverrides = {}, ...rest } = overrides;
  return {
    ...baseProposal,
    ...rest,
    candidate: {
      ...baseProposal.candidate,
      ...candidate,
    },
    evidence: {
      ...baseProposal.evidence,
      ...evidenceOverrides,
    },
  };
}

test('schema declares Phase 06 lifecycle states and supported targets', () => {
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  assert.equal(schema.title, 'Knowledge Improvement Proposal');
  assert.deepEqual(schema.properties.state.enum, LIFECYCLE_STATES);
  assert.deepEqual(schema.properties.previousState.enum, LIFECYCLE_STATES);
  assert.deepEqual(schema.properties.target.enum, TARGETS);
  assert.equal(schema.additionalProperties, false);
});

test('validates proposal shape, target, state, timestamps, unknown fields, and harness project id', () => {
  assert.equal(validateImprovementProposal(proposal()).ok, true);

  const invalid = validateImprovementProposal(proposal({
    projectId: 'wrong-id',
    target: 'harness-meta-project',
    state: 'unknown',
    createdAt: 'today',
    unexpected: true,
    candidate: { rawOntologyDump: '@prefix sh:' },
    evidence: { verification: { ...evidence('verify.json'), extra: true } },
  }));

  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.includes(`harness-meta-project target requires projectId ${HARNESS_META_PROJECT.projectId}`));
  assert.ok(invalid.errors.some((error) => error.startsWith('state must be one of')));
  assert.ok(invalid.errors.includes('createdAt must be an ISO-8601 UTC timestamp'));
  assert.ok(invalid.errors.includes('unknown field: unexpected'));
  assert.ok(invalid.errors.includes('unknown field: candidate.rawOntologyDump'));
  assert.ok(invalid.errors.includes('unknown field: evidence.verification.extra'));
});

test('enforces lifecycle transition graph', () => {
  assert.equal(isTransitionAllowed('observe', 'stage'), true);
  assert.equal(isTransitionAllowed('stage', 'verify'), true);
  assert.equal(isTransitionAllowed('verify', 'promote'), true);
  assert.equal(isTransitionAllowed('promote', 'archive'), true);
  assert.equal(isTransitionAllowed('observe', 'promote'), false);
  assert.equal(isTransitionAllowed('archive', 'promote'), false);
});

test('project-local observations become semantic facts only after verification evidence', () => {
  const missing = evaluateImprovementProposal(proposal({
    state: 'verify',
    candidate: { kind: 'observation' },
  }));

  assert.equal(missing.ok, false);
  assert.equal(missing.workflowBlocking, false);
  assert.deepEqual(missing.denial, {
    code: 'missing_project_verification',
    reason: 'Project-local observations become semantic facts only after verification.',
    durable: true,
    workflowBlocking: false,
  });

  const verified = evaluateImprovementProposal(proposal({
    state: 'verify',
    candidate: { kind: 'observation', trustTier: 'verified' },
    evidence: { verification: evidence('improvement/proposals/proposal-1-verify.json') },
  }));

  assert.equal(verified.ok, true);
  assert.equal(verified.decision, 'accepted');
});

test('global promotion requires independent review and replay evidence', () => {
  const denied = evaluateImprovementProposal(proposal({
    target: 'global-candidate',
    state: 'promote',
    previousState: 'verify',
    promotionTier: 'candidate',
    candidate: { kind: 'semantic_fact', trustTier: 'verified' },
    evidence: { independentReview: evidence('reviews/proposal-1-review.yaml', 'approved') },
  }));

  assert.equal(denied.ok, false);
  assert.equal(denied.denial.code, 'missing_promotion_evidence');
  assert.ok(denied.denial.reason.includes('replay'));

  const approved = evaluateImprovementProposal(proposal({
    target: 'global-candidate',
    state: 'promote',
    previousState: 'verify',
    promotionTier: 'candidate',
    candidate: { kind: 'semantic_fact', trustTier: 'verified' },
    evidence: {
      independentReview: evidence('improvement/reviews/proposal-1-review.yaml', 'approved'),
      replay: evidence('improvement/replay/proposal-1-replay.json'),
    },
  }));

  assert.equal(approved.ok, true);
  assert.equal(approved.decision, 'approved_for_promotion');
});

test('transcript-only and untrusted external candidates are denied with durable non-blocking reasons', () => {
  const transcriptOnly = evaluateImprovementProposal(proposal({
    state: 'promote',
    previousState: 'verify',
    target: 'global-candidate',
    candidate: {
      kind: 'semantic_fact',
      sourceType: 'transcript',
      trustTier: 'quarantined',
      transcriptOnly: true,
    },
  }));

  assert.equal(transcriptOnly.ok, false);
  assert.equal(transcriptOnly.workflowBlocking, false);
  assert.equal(transcriptOnly.denial.code, 'transcript_only_candidate');
  assert.equal(transcriptOnly.denial.durable, true);

  const untrusted = evaluateImprovementProposal(proposal({
    state: 'verify',
    candidate: {
      sourceType: 'external',
      trustTier: 'quarantined',
      untrustedExternal: true,
    },
  }));

  assert.equal(untrusted.ok, false);
  assert.equal(untrusted.workflowBlocking, false);
  assert.equal(untrusted.denial.code, 'untrusted_external_candidate');

  const imported = evaluateImprovementProposal(proposal({
    state: 'promote',
    previousState: 'verify',
    target: 'global-candidate',
    candidate: {
      kind: 'semantic_fact',
      sourceType: 'imported',
      trustTier: 'verified',
    },
    evidence: {
      verification: evidence('improvement/proposals/proposal-1-verify.json'),
      independentReview: evidence('improvement/reviews/proposal-1-review.yaml', 'approved'),
      replay: evidence('improvement/replay/proposal-1-replay.json'),
    },
  }));

  assert.equal(imported.ok, false);
  assert.equal(imported.workflowBlocking, false);
  assert.equal(imported.denial.code, 'imported_only_candidate');
});

test('project-local promote is denied and promotion states require previousState', () => {
  const directPromote = evaluateImprovementProposal(proposal({
    target: 'project-local',
    state: 'promote',
    previousState: 'verify',
    promotionTier: 'project-local',
    candidate: { kind: 'observation', trustTier: 'verified' },
    evidence: { verification: evidence('improvement/proposals/proposal-1-verify.json') },
  }));

  assert.equal(directPromote.ok, false);
  assert.equal(directPromote.workflowBlocking, false);
  assert.equal(directPromote.denial.code, 'project_local_promotion_not_allowed');

  const missingPreviousState = evaluateImprovementProposal(proposal({
    target: 'global-candidate',
    state: 'promote',
    promotionTier: 'candidate',
    candidate: { kind: 'semantic_fact', trustTier: 'verified' },
    evidence: {
      independentReview: evidence('improvement/reviews/proposal-1-review.yaml', 'approved'),
      replay: evidence('improvement/replay/proposal-1-replay.json'),
    },
  }));

  assert.equal(missingPreviousState.ok, false);
  assert.equal(missingPreviousState.decision, 'invalid');
  assert.ok(missingPreviousState.errors.some((error) => error.includes('requires previousState')));
});

test('harness meta-project contract exposes stable account-root locations', () => {
  const contract = harnessMetaProjectContract({ USERPROFILE: 'C:\\Users\\moon' });
  assert.equal(contract.projectId, 'moonshot-relay');
  assert.equal(contract.knowledgeRoot, '%USERPROFILE%/.codex/state/projects/moonshot-relay/knowledge');
  assert.equal(contract.improvementRoot, '%USERPROFILE%/.codex/state/projects/moonshot-relay/improvement');
  assert.equal(contract.candidateReleaseRoot, '%USERPROFILE%/.codex/harness/releases/candidate');
  assert.equal(contract.stableReleaseRoot, '%USERPROFILE%/.codex/harness/releases/stable');
  assert.ok(contract.resolvedKnowledgeRoot.endsWith(path.join('.codex', 'state', 'projects', 'moonshot-relay', 'knowledge')));
});

test('harness candidate promotion requires review, replay, and targeted self-test evidence', () => {
  const denied = evaluateImprovementProposal(proposal({
    projectId: 'moonshot-relay',
    target: 'harness-meta-project',
    state: 'promote',
    previousState: 'verify',
    promotionTier: 'candidate',
    candidate: { kind: 'harness_rule', trustTier: 'verified' },
    evidence: {
      independentReview: evidence('improvement/reviews/proposal-1-review.yaml', 'approved'),
      replay: evidence('improvement/replay/proposal-1-replay.json'),
    },
  }));

  assert.equal(denied.ok, false);
  assert.equal(denied.denial.code, 'missing_promotion_evidence');
  assert.ok(denied.denial.reason.includes('targetedSelfTest'));

  const approved = evaluateImprovementProposal(proposal({
    projectId: 'moonshot-relay',
    target: 'harness-meta-project',
    state: 'promote',
    previousState: 'verify',
    promotionTier: 'candidate',
    candidate: { kind: 'harness_rule', trustTier: 'verified' },
    evidence: {
      independentReview: evidence('improvement/reviews/proposal-1-review.yaml', 'approved'),
      replay: evidence('improvement/replay/proposal-1-replay.json'),
      targetedSelfTest: evidence('improvement/replay/proposal-1-self-test.json'),
    },
  }));

  assert.equal(approved.ok, true);
});

test('harness stable promotion requires review, replay, rollback, and release manifest evidence', () => {
  const denied = evaluateImprovementProposal(proposal({
    projectId: 'moonshot-relay',
    target: 'harness-meta-project',
    state: 'promote',
    previousState: 'verify',
    promotionTier: 'stable',
    candidate: { kind: 'harness_rule', trustTier: 'verified' },
    evidence: {
      independentReview: evidence('improvement/reviews/proposal-1-review.yaml', 'approved'),
      replay: evidence('improvement/replay/proposal-1-replay.json'),
      targetedSelfTest: evidence('improvement/replay/proposal-1-self-test.json'),
    },
  }));

  assert.equal(denied.ok, false);
  assert.equal(denied.denial.code, 'missing_stable_harness_evidence');
  assert.ok(denied.denial.reason.includes('rollback'));
  assert.ok(denied.denial.reason.includes('releaseManifest'));

  const approved = evaluateImprovementProposal(proposal({
    projectId: 'moonshot-relay',
    target: 'harness-meta-project',
    state: 'promote',
    previousState: 'verify',
    promotionTier: 'stable',
    candidate: { kind: 'harness_rule', trustTier: 'verified' },
    evidence: {
      independentReview: evidence('improvement/reviews/proposal-1-review.yaml', 'approved'),
      replay: evidence('improvement/replay/proposal-1-replay.json'),
      targetedSelfTest: evidence('improvement/replay/proposal-1-self-test.json'),
      rollback: evidence('improvement/rollback/proposal-1-rollback.json'),
      releaseManifest: evidence('improvement/releases/proposal-1-release-manifest.json'),
    },
  }));

  assert.equal(approved.ok, true);
  assert.equal(approved.decision, 'approved_for_promotion');
});
