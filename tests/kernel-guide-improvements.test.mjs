import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEvidenceIdentity, buildEvidenceReuseReceipt, exactEvidenceIdentityMatch } from '../scripts/kernel/proof/evidence-reuse.mjs';
import { deriveKnowledgeStatus, emptyKnowledgeDoctorFinding, extractStructuredKnowledgeCandidates, failureFingerprint, normalizeFailureSignalText } from '../scripts/kernel/knowledge/capture.mjs';
import { classifyContractChange } from '../scripts/kernel/change-contract.mjs';
import {
  authoritativeVerificationScope,
  compileRunObligations,
  rebindProofPolicyCommands,
  selectBoundCommandRef,
} from '../scripts/kernel/run/obligation-compiler.mjs';
import { readFile } from 'node:fs/promises';

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

test('failure fingerprints ignore run-specific metrics so repeated failures become candidates', () => {
  assert.equal(normalizeFailureSignalText('packaged performance 29.7 FPS at pid=1234'), 'packaged performance <metric> at pid <number>');
  assert.equal(
    normalizeFailureSignalText('packaged performance FPS=29.7 p95=141ms (node:24492)'),
    'packaged performance <metric> <metric> (node:<pid>)',
  );
  assert.equal(
    failureFingerprint({ obligationId: 'unit-test', commandRef: 'test:package', errorSummary: 'packaged performance 29.7 FPS at pid=1234' }),
    failureFingerprint({ obligationId: 'unit-test', commandRef: 'test:package', errorSummary: 'packaged performance 31.2 FPS at pid=9876' }),
  );
  assert.equal(
    failureFingerprint({ obligationId: 'unit-test', commandRef: 'test:package', errorSummary: 'packaged performance FPS=29.7 p95=141ms (node:24492)' }),
    failureFingerprint({ obligationId: 'unit-test', commandRef: 'test:package', errorSummary: 'packaged performance FPS=31.2 p95=188ms (node:8134)' }),
  );
  const candidates = extractStructuredKnowledgeCandidates({
    run: { runId: 'run-b', projectId: 'project-a' },
    priorRunSignals: [{ failures: [{ fingerprint: failureFingerprint({ obligationId: 'unit-test', commandRef: 'test:package', errorSummary: 'packaged performance 29.7 FPS at pid=1234' }), statement: 'packaged performance is below the gate', evidenceRefs: ['failure://run-a/1'], scope: ['package'] }] }],
    signals: { failures: [{ fingerprint: failureFingerprint({ obligationId: 'unit-test', commandRef: 'test:package', errorSummary: 'packaged performance 31.2 FPS at pid=9876' }), statement: 'packaged performance is below the gate', evidenceRefs: ['failure://run-b/1'], scope: ['package'] }] },
  });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].proposedType, 'known_failure_pattern');
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

test('command binding follows evidence plan, knowledge, caller, then policy fallback priority', () => {
  const commands = [
    { commandRef: 'test:policy', commandClass: 'unit-test' },
    { commandRef: 'test:caller', commandClass: 'unit-test' },
    { commandRef: 'test:knowledge', commandClass: 'unit-test' },
    { commandRef: 'test:plan', commandClass: 'unit-test' },
  ];
  const knowledgeRecords = [{
    id: 'rv-unit',
    type: 'required_verification',
    status: 'committed',
    scope: [],
    verification: {
      obligationId: 'unit-test',
      commandRef: 'test:knowledge',
      scope: ['src/knowledge/**'],
    },
  }];
  const compile = (acceptance) => compileRunObligations({
    projectRoot: process.cwd(),
    requiredChecks: ['unit-test'],
    contract: {
      requiredVerifications: [{
        obligationId: 'unit-test',
        commandRef: 'test:caller',
        scope: ['src/caller/**'],
      }],
      acceptance,
    },
    commands,
    knowledgeRecords,
    changedPaths: ['src/knowledge/login.mjs'],
  });

  const withoutPlan = compile([{ id: 'AC-1', acceptance: 'the unit behavior works' }]);
  assert.equal(selectBoundCommandRef(withoutPlan[0], { projectCommands: commands }), 'test:knowledge');
  assert.deepEqual(authoritativeVerificationScope(withoutPlan[0]), {
    scope: ['src/knowledge/**'],
    freshnessInputs: [],
    sourceType: 'knowledge',
    sourceRef: 'rv-unit',
  });

  const withPlan = compile([{
    id: 'AC-2',
    acceptance: 'the planned unit behavior works',
    evidencePlan: { obligationId: 'unit-test', class: 'hard', method: 'unit-test', commandRefs: ['test:plan'] },
  }]);
  assert.equal(selectBoundCommandRef(withPlan[0], { projectCommands: commands }), 'test:plan');
});

test('greenfield policy obligations rebind to commands declared before proof', () => {
  const greenfield = compileRunObligations({
    projectRoot: process.cwd(),
    requiredChecks: ['unit-test'],
    contract: { acceptance: [] },
    commands: [],
  });
  assert.equal(greenfield[0].satisfiable, false);
  const rebound = rebindProofPolicyCommands({
    obligations: greenfield,
    projectRoot: process.cwd(),
    commands: [{ commandRef: 'test:new', commandClass: 'unit-test' }],
  });
  assert.equal(rebound[0].satisfiable, true);
  assert.deepEqual(rebound[0].allowedCommandRefs, ['test:new']);
  assert.equal(selectBoundCommandRef(rebound[0], { projectCommands: [{ commandRef: 'test:new', commandClass: 'unit-test' }] }), 'test:new');
});

test('project knowledge documentation states the required_verification contract convention', async () => {
  const doc = await readFile(new URL('../docs/public/project-knowledge-plane.md', import.meta.url), 'utf8');
  for (const heading of [
    '## Project Verification Contract (`required_verification`)',
    '### Command indirection',
    '### Architecture fitness',
    '### Mutation quality',
    '### User-visible acceptance',
    '### Linking a `known_failure_pattern`',
    '### When to create a record',
  ]) {
    assert.ok(doc.includes(heading), `missing documentation section: ${heading}`);
  }
  assert.ok(doc.includes('commandRef: architecture:test'));
  assert.ok(doc.includes('test:payment-mutation'));
  assert.ok(doc.includes('e2e:login'));
  assert.ok(doc.includes('test:refresh-regression'));
});

test('architecture, mutation, and acceptance verification compile only for a matching changed scope', () => {
  const records = [
    {
      id: 'rv-architecture',
      type: 'required_verification',
      status: 'committed',
      scope: ['src/domain/**'],
      verification: { commandRefs: ['architecture:test'] },
    },
    {
      id: 'rv-mutation',
      type: 'required_verification',
      status: 'committed',
      scope: ['src/domain/payment/**'],
      verification: { commandRefs: ['test:payment-mutation'] },
    },
    {
      id: 'rv-e2e',
      type: 'required_verification',
      status: 'committed',
      scope: ['src/features/login/**'],
      verification: { commandRefs: ['e2e:login'] },
    },
  ];
  const commands = [
    { commandRef: 'architecture:test', commandClass: 'unit-test' },
    { commandRef: 'test:payment-mutation', commandClass: 'unit-test' },
    { commandRef: 'e2e:login', commandClass: 'e2e' },
  ];
  const compile = (changedPaths) => compileRunObligations({
    projectRoot: process.cwd(),
    requiredChecks: [],
    contract: { requiredObligations: [], acceptance: [] },
    commands,
    knowledgeRecords: records,
    changedPaths,
  });

  const payment = compile(['src/domain/payment/total.mjs']);
  assert.deepEqual(
    payment.flatMap((obligation) => obligation.allowedCommandRefs).sort(),
    ['architecture:test', 'test:payment-mutation'],
  );

  const login = compile(['src/features/login/LoginForm.tsx']);
  assert.deepEqual(login.flatMap((obligation) => obligation.allowedCommandRefs), ['e2e:login']);

  // An unrelated scope must not trigger expensive project verification.
  assert.deepEqual(compile(['docs/readme.md']), []);
});
