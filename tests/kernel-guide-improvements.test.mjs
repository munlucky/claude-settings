import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceIdentity, buildEvidenceReuseReceipt, exactEvidenceIdentityMatch } from '../scripts/kernel/proof/evidence-reuse.mjs';
import { deriveKnowledgeStatus, emptyKnowledgeDoctorFinding, extractStructuredKnowledgeCandidates } from '../scripts/kernel/knowledge/capture.mjs';
import { classifyContractChange } from '../scripts/kernel/change-contract.mjs';
import { compileRunObligations } from '../scripts/kernel/run/obligation-compiler.mjs';

test('structured repeated failures produce a bounded, evidence-bound knowledge candidate', () => {
  const candidate = extractStructuredKnowledgeCandidates({
    run: { runId: 'run-b', projectId: 'project-a' },
    priorRunSignals: [{ failures: [{ fingerprint: 'failure-1', statement: 'auth contract failed', evidenceRefs: ['failure://run-a/failure-1'] }] }],
    signals: { failures: [{ fingerprint: 'failure-1', statement: 'auth contract failed', evidenceRefs: ['failure://run-b/failure-1'] }] },
  });
  assert.equal(candidate.length, 1);
  assert.equal(candidate[0].proposedType, 'known_failure_pattern');
  assert.ok(candidate[0].evidenceRefs.length > 0);
});

test('knowledge capture status distinguishes submitted, committed, and empty capture', () => {
  assert.equal(deriveKnowledgeStatus({ explicitCount: 1 }), 'explicit_candidates_submitted');
  assert.equal(deriveKnowledgeStatus({ committedStatus: 'no_change' }), 'no_new_knowledge');
  assert.equal(deriveKnowledgeStatus({ committedStatus: 'committed', committedCount: 1 }), 'knowledge_committed');
  assert.equal(emptyKnowledgeDoctorFinding({ completedRuns: 2, mutationRuns: 1 }), null);
  assert.equal(emptyKnowledgeDoctorFinding({ completedRuns: 3, mutationRuns: 1, knowledgeRevision: 1, candidateCount: 0, committedCount: 0 }).code, 'knowledge_capture_missing');
});

test('evidence reuse requires exact declared identity and creates a current revision receipt', () => {
  const identity = buildEvidenceIdentity({ commandRef: 'test:auth', sourceInputDigest: 'sha256:source', networkPolicy: 'inherited' });
  assert.equal(exactEvidenceIdentityMatch(identity, { ...identity }), true);
  assert.equal(exactEvidenceIdentityMatch(identity, buildEvidenceIdentity({ commandRef: 'test:auth', sourceInputDigest: 'sha256:changed', networkPolicy: 'inherited' })), false);
  const receipt = buildEvidenceReuseReceipt({ runId: 'run-b', obligationId: 'required-auth', priorRunId: 'run-a', priorVerificationId: 4, mutationRevision: 2, identity, evidenceDigest: 'sha256:evidence' });
  assert.equal(receipt.receiptType, 'exact-evidence-reuse');
  assert.equal(receipt.mutationRevision, 2);
});

test('required verification metadata compiles only for a related changed scope', () => {
  const records = [{
    id: 'rv-auth',
    type: 'required_verification',
    status: 'committed',
    scope: ['src/auth/**'],
    verification: { commandRefs: ['test:auth'], receiptContractRef: 'project.auth.v1', freshnessInputs: ['sourceIdentity'] },
  }];
  const obligations = compileRunObligations({
    projectRoot: process.cwd(),
    requiredChecks: [],
    contract: { requiredObligations: [], acceptance: [] },
    commands: [{ commandRef: 'test:auth', commandClass: 'unit-test' }],
    knowledgeRecords: records,
    changedPaths: ['src/auth/login.mjs'],
  });
  assert.equal(obligations.length, 1);
  assert.equal(obligations[0].sourceType, 'knowledge');
  assert.equal(obligations[0].metadata.receiptContractRef, 'project.auth.v1');
  assert.equal(classifyContractChange({ previous: { allowedPaths: ['src/auth/**'] }, next: { allowedPaths: ['src/auth/**'], defectWithinScope: true, taskClass: 'bug' } }), 'defect-within-scope');
  assert.equal(classifyContractChange({ previous: { allowedPaths: ['src/auth/**'] }, next: { allowedPaths: ['src/auth/**', 'src/billing/**'], scopeExtension: true } }), 'scope-extension');
});
