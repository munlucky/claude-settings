import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import {
  BROWSER_REPAIR_MAX_ATTEMPTS,
  REQUIRED_BROWSER_SCENARIO_FIELDS,
  REQUIRED_FORBIDDEN_REPAIR_MUTATIONS,
  normalizeBrowserScenarioContract,
  validateBrowserScenarioContract,
} from '../scripts/lib/browser-scenario-contract.mjs';
import {
  buildBrowserFailurePackage,
  validateBrowserFailureArtifacts,
} from '../scripts/lib/browser-failure-package.mjs';

const root = process.cwd();
const fromRoot = (...segments) => path.join(root, ...segments);

const readJson = async (...segments) => JSON.parse(await readFile(fromRoot(...segments), 'utf8'));

test('browser scenario schema names the canonical scenario and failure-policy surface', async () => {
  const schema = await readJson('schemas', 'browser-scenario.schema.json');

  assert.equal(schema.$id, 'https://moonshot-relay.local/schemas/browser-scenario.schema.json');
  assert.deepEqual(schema.required, REQUIRED_BROWSER_SCENARIO_FIELDS);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.failurePolicy.properties.maxRepairAttempts.maximum, BROWSER_REPAIR_MAX_ATTEMPTS);
  assert.deepEqual(schema.properties.failurePolicy.properties.preserveScenarioId, { const: true });
  assert.deepEqual(schema.properties.failurePolicy.properties.preserveFailingAssertionIds, { const: true });
  assert.deepEqual(schema.properties.failurePolicy.properties.fallbackAuthority.enum, ['diagnosis_only']);
  assert.ok(schema.properties.evidenceDepth.enum.includes('open-act-mutate-persist-recover'));
  assert.equal(schema.properties.evidenceDepth.enum.includes('integration'), false);
  assert.equal(schema.properties.requiredArtifactTypes.minItems, 1);
  assert.equal(schema.properties.playwrightWaiver.properties.reason.minLength, 1);
  assert.ok(schema.properties.failurePolicy.required.includes('forbiddenMutations'));
  assert.equal(schema.properties.failurePolicy.properties.forbiddenMutations.minItems, 4);
  assert.ok(schema.properties.failurePolicy.properties.forbiddenMutations.items.enum.includes('weaken_assertion'));
  assert.ok(schema.properties.requiredArtifactTypes.items.enum.includes('accessibility_snapshot'));
});

test('browser scenario fixtures preserve browser proof and diagnosis-only fallback policy', async () => {
  const schema = await readJson('schemas', 'browser-scenario.schema.json');
  const critical = await readJson('tests', 'fixtures', 'browser-scenarios', 'critical-browser-flow.json');
  const waived = await readJson('tests', 'fixtures', 'browser-scenarios', 'playwright-waived-confirmation.json');

  for (const fixture of [critical, waived]) {
    for (const field of REQUIRED_BROWSER_SCENARIO_FIELDS) {
      assert.ok(Object.hasOwn(fixture, field), `${fixture.scenarioId} missing ${field}`);
    }
    assert.deepEqual(validateBrowserScenarioContract(fixture, { schema }), []);
    const normalized = normalizeBrowserScenarioContract(fixture, { schema });
    assert.equal(normalized.scenarioId, fixture.scenarioId);
    assert.equal(normalized.failurePolicy.maxRepairAttempts, BROWSER_REPAIR_MAX_ATTEMPTS);
    assert.equal(fixture.failurePolicy.maxRepairAttempts, BROWSER_REPAIR_MAX_ATTEMPTS);
    assert.equal(fixture.failurePolicy.preserveScenarioId, true);
    assert.equal(fixture.failurePolicy.preserveFailingAssertionIds, true);
    assert.equal(fixture.failurePolicy.fallbackAuthority, 'diagnosis_only');
    assert.ok(fixture.failurePolicy.forbiddenMutations.includes('delete_test'));
    assert.ok(fixture.failurePolicy.forbiddenMutations.includes('update_baseline'));
    assert.equal(fixture.taskVerificationClass.requiresBrowserEvidence, true);
  }

  assert.equal(critical.playwrightRequired, true);
  assert.equal(critical.evidenceDepth, 'open-act-mutate-persist-recover');
  assert.equal(critical.taskVerificationClass.criticalScenario, true);
  assert.ok(critical.requiredArtifactTypes.includes('trace'));
  assert.equal(waived.playwrightRequired, false);
  assert.equal(typeof waived.playwrightWaiver.reason, 'string');
  assert.ok(waived.playwrightWaiver.reason.length > 0);
});

test('browser scenario contract rejects ambiguous or unsafe waiver and artifact cases', async () => {
  const schema = await readJson('schemas', 'browser-scenario.schema.json');
  const valid = await readJson('tests', 'fixtures', 'browser-scenarios', 'critical-browser-flow.json');

  assert.ok(validateBrowserScenarioContract({
    ...valid,
    evidenceDepth: 'integration',
  }, { schema }).some((error) => /invalid evidenceDepth/.test(error)));
  assert.ok(validateBrowserScenarioContract({
    ...valid,
    requiredArtifactTypes: [],
  }, { schema }).includes('requiredArtifactTypes must not be empty'));
  assert.ok(validateBrowserScenarioContract({
    ...valid,
    playwrightRequired: false,
    playwrightWaiver: { reason: 'critical waiver should not pass', approvedBy: 'reviewer' },
  }, { schema }).includes('critical scenarios require playwrightRequired=true'));
  assert.ok(validateBrowserScenarioContract({
    ...valid,
    taskVerificationClass: { ...valid.taskVerificationClass, criticalScenario: false },
    playwrightRequired: false,
    playwrightWaiver: { reason: '', approvedBy: '' },
  }, { schema }).some((error) => /playwrightWaiver\.(reason|approvedBy) is required/.test(error)));
  assert.ok(validateBrowserScenarioContract({
    ...valid,
    failurePolicy: {
      ...valid.failurePolicy,
      forbiddenMutations: ['delete_test'],
    },
  }, { schema }).some((error) => /missing forbidden mutation/.test(error)));
  const { maxRepairAttempts: _maxRepairAttempts, ...policyWithoutAttempts } = valid.failurePolicy;
  assert.ok(validateBrowserScenarioContract({
    ...valid,
    failurePolicy: policyWithoutAttempts,
  }, { schema }).includes('failurePolicy.maxRepairAttempts is required'));
  assert.ok(validateBrowserScenarioContract({
    ...valid,
    failurePolicy: {
      ...valid.failurePolicy,
      maxRepairAttempts: 0,
    },
  }, { schema }).includes('failurePolicy.maxRepairAttempts must be at least 1'));
  assert.ok(validateBrowserScenarioContract({
    ...valid,
    failurePolicy: {
      ...valid.failurePolicy,
      maxRepairAttempts: 'not-a-number',
    },
  }, { schema }).includes('failurePolicy.maxRepairAttempts must be an integer'));
});

test('browser failure package validates required artifact types and artifact root', async () => {
  const scenario = await readJson('tests', 'fixtures', 'browser-scenarios', 'critical-browser-flow.json');
  const artifacts = scenario.requiredArtifactTypes.map((type) => ({
    type,
    path: `.moonshot-relay/browser-artifacts/run/goal/${scenario.scenarioId}/${type}.json`,
  }));
  const failurePackage = buildBrowserFailurePackage({
    scenario,
    browserResult: {
      status: 'failed',
      failedStage: 'assertion',
      failureClass: 'playwright_assertion_failed',
      setupGap: false,
    },
    failedAssertionIds: ['assert-text'],
    artifacts,
    rerunCommand: 'node --test tests/workflow-e2e-contract.test.mjs --test-name-pattern critical-browser-flow',
  });

  assert.equal(failurePackage.artifactId, 'BROWSER_FAILURE_PACKAGE');
  assert.equal(failurePackage.maxRepairAttempts, BROWSER_REPAIR_MAX_ATTEMPTS);
  assert.equal(failurePackage.blockerMapping[0].failureClass, 'playwright_assertion_failed');
  assert.deepEqual(
    REQUIRED_FORBIDDEN_REPAIR_MUTATIONS.every((mutation) => failurePackage.repairPolicy.forbiddenMutations.includes(mutation)),
    true,
  );

  assert.ok(validateBrowserFailureArtifacts({
    scenario,
    artifacts: artifacts.slice(1),
  }).some((error) => /missing required artifact type/.test(error)));
  assert.ok(validateBrowserFailureArtifacts({
    scenario,
    artifacts: [{ type: 'screenshot', path: 'outside/screenshot.png' }],
    requireScenarioArtifacts: false,
  }).some((error) => /outside \.moonshot-relay\/browser-artifacts/.test(error)));
});

test('runtime control plane docs bind browser scenarios to the source schema contract', async () => {
  const docs = await readFile(fromRoot('docs', 'public', 'runtime-control-plane.md'), 'utf8');

  assert.match(docs, /schemas\/browser-scenario\.schema\.json/);
  assert.match(docs, /Critical scenarios must keep `playwrightRequired=true`/);
  assert.match(docs, /open-act-mutate-persist-recover/);
  assert.match(docs, /diagnosis-only failure policy/);
});
