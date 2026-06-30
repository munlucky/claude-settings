import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const fromRoot = (...segments) => path.join(root, ...segments);

const readJson = async (...segments) => JSON.parse(await readFile(fromRoot(...segments), 'utf8'));

const requiredScenarioFields = [
  'schemaVersion',
  'scenarioId',
  'evidenceDepth',
  'expectedUrl',
  'expectedText',
  'expectedRole',
  'expectedName',
  'requiredArtifactTypes',
  'playwrightRequired',
  'taskVerificationClass',
  'failurePolicy',
];

const requiredForbiddenMutations = ['delete_test', 'weaken_assertion', 'change_expected_text', 'update_baseline'];

const validateScenarioContract = (schema, scenario) => {
  const errors = [];
  for (const field of schema.required) {
    if (!Object.hasOwn(scenario, field)) errors.push(`missing ${field}`);
  }
  const allowedKeys = new Set(Object.keys(schema.properties));
  for (const key of Object.keys(scenario)) {
    if (!allowedKeys.has(key)) errors.push(`additional property ${key}`);
  }
  if (!schema.properties.evidenceDepth.enum.includes(scenario.evidenceDepth)) {
    errors.push(`invalid evidenceDepth ${scenario.evidenceDepth}`);
  }
  if (!Array.isArray(scenario.requiredArtifactTypes) || scenario.requiredArtifactTypes.length < 1) {
    errors.push('requiredArtifactTypes must not be empty');
  }
  if (scenario.playwrightRequired === false) {
    if (!scenario.playwrightWaiver) {
      errors.push('playwrightWaiver is required when playwrightRequired=false');
    } else {
      if (!String(scenario.playwrightWaiver.reason || '').trim()) errors.push('playwrightWaiver.reason is required');
      if (!String(scenario.playwrightWaiver.approvedBy || '').trim()) errors.push('playwrightWaiver.approvedBy is required');
    }
  }
  if (scenario.taskVerificationClass?.criticalScenario === true && scenario.playwrightRequired !== true) {
    errors.push('critical scenarios require playwrightRequired=true');
  }
  const forbidden = scenario.failurePolicy?.forbiddenMutations;
  if (!Array.isArray(forbidden)) {
    errors.push('failurePolicy.forbiddenMutations is required');
  } else {
    for (const mutation of requiredForbiddenMutations) {
      if (!forbidden.includes(mutation)) errors.push(`missing forbidden mutation ${mutation}`);
    }
  }
  return errors;
};

test('browser scenario schema names the canonical scenario and failure-policy surface', async () => {
  const schema = await readJson('schemas', 'browser-scenario.schema.json');

  assert.equal(schema.$id, 'https://moonshot-relay.local/schemas/browser-scenario.schema.json');
  assert.deepEqual(schema.required, requiredScenarioFields);
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.failurePolicy.properties.maxRepairAttempts.maximum, 2);
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
    for (const field of requiredScenarioFields) {
      assert.ok(Object.hasOwn(fixture, field), `${fixture.scenarioId} missing ${field}`);
    }
    assert.deepEqual(validateScenarioContract(schema, fixture), []);
    assert.equal(fixture.failurePolicy.maxRepairAttempts, 2);
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

  assert.ok(validateScenarioContract(schema, {
    ...valid,
    evidenceDepth: 'integration',
  }).some((error) => /invalid evidenceDepth/.test(error)));
  assert.ok(validateScenarioContract(schema, {
    ...valid,
    requiredArtifactTypes: [],
  }).includes('requiredArtifactTypes must not be empty'));
  assert.ok(validateScenarioContract(schema, {
    ...valid,
    playwrightRequired: false,
    playwrightWaiver: { reason: 'critical waiver should not pass', approvedBy: 'reviewer' },
  }).includes('critical scenarios require playwrightRequired=true'));
  assert.ok(validateScenarioContract(schema, {
    ...valid,
    taskVerificationClass: { ...valid.taskVerificationClass, criticalScenario: false },
    playwrightRequired: false,
    playwrightWaiver: { reason: '', approvedBy: '' },
  }).some((error) => /playwrightWaiver\.(reason|approvedBy) is required/.test(error)));
  assert.ok(validateScenarioContract(schema, {
    ...valid,
    failurePolicy: {
      ...valid.failurePolicy,
      forbiddenMutations: ['delete_test'],
    },
  }).some((error) => /missing forbidden mutation/.test(error)));
});

test('runtime control plane docs bind browser scenarios to the source schema contract', async () => {
  const docs = await readFile(fromRoot('docs', 'public', 'runtime-control-plane.md'), 'utf8');

  assert.match(docs, /schemas\/browser-scenario\.schema\.json/);
  assert.match(docs, /Critical scenarios must keep `playwrightRequired=true`/);
  assert.match(docs, /open-act-mutate-persist-recover/);
  assert.match(docs, /diagnosis-only failure policy/);
});
