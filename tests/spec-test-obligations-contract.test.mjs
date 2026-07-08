import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

import { validateSpecTestObligations } from '../scripts/spec-test-obligations.mjs';

const root = process.cwd();
const fixtureRoot = path.join(root, 'tests', 'fixtures', 'spec-test-obligations');

const fixture = (name, file) => path.join(fixtureRoot, name, file);

const runValidator = (name, extraArgs = []) => spawnSync(process.execPath, [
  'scripts/spec-test-obligations.mjs',
  'validate',
  '--sprint-contract',
  fixture(name, 'SPRINT_CONTRACT.md'),
  '--qa-report',
  fixture(name, 'QA_REPORT.md'),
  '--requirements-traceability',
  fixture(name, 'REQUIREMENTS_TRACEABILITY.md'),
  '--scenario-matrix',
  fixture(name, 'SCENARIO_MATRIX.md'),
  '--scorecard',
  fixture(name, 'SCORECARD.md'),
  '--json',
  ...extraArgs,
], {
  cwd: root,
  encoding: 'utf8',
});

const parseJson = (result) => {
  assert.ok(result.stdout.trim(), result.stderr || 'expected JSON stdout');
  return JSON.parse(result.stdout);
};

test('spec-test obligation schema is packaged as a machine-readable contract', async () => {
  const schema = JSON.parse(await readFile(path.join(root, 'schemas', 'spec-test-obligation.schema.json'), 'utf8'));

  assert.equal(schema.$id, 'https://moonshot-relay.local/schemas/spec-test-obligation.schema.json');
  assert.equal(schema.additionalProperties, false);
  for (const required of ['status', 'summary', 'findings']) {
    assert.ok(schema.required.includes(required), `${required} should be required`);
  }
  assert.ok(schema.properties.findings.items.properties.class.enum.includes('spec_test_obligation_missing'));
  assert.ok(schema.properties.findings.items.properties.class.enum.includes('critical_scenario_smoke_only'));
  assert.ok(schema.properties.findings.items.properties.class.enum.includes('duplicate_spec_test_obligation'));
});

test('validator fails when a requirement lacks an obligation row', () => {
  const result = runValidator('missing-obligation');
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const payload = parseJson(result);

  assert.equal(payload.status, 'fail');
  assert.equal(payload.summary.requiredItemCount, 3);
  assert.equal(payload.summary.obligationCount, 2);
  assert.ok(payload.findings.some((finding) => finding.class === 'spec_test_obligation_missing' && finding.id === 'REQ-002'));
});

test('validator fails incomplete tdd_red_green evidence', () => {
  const result = runValidator('incomplete-tdd');
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const payload = parseJson(result);

  assert.ok(payload.findings.some((finding) => finding.class === 'tdd_red_evidence_missing' && finding.id === 'REQ-001'));
  assert.ok(payload.findings.some((finding) => finding.class === 'tdd_green_evidence_missing' && finding.id === 'REQ-001'));
});

test('validator blocks smoke-only evidence for critical scenarios requiring deeper evidence', () => {
  const result = runValidator('critical-smoke-only');
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const payload = parseJson(result);

  assert.ok(payload.findings.some((finding) => finding.class === 'critical_scenario_smoke_only' && finding.id === 'SCN-001'));
});

test('validator accepts complete TDD, characterization, and evidence-mandatory obligations', () => {
  const result = runValidator('valid-mixed');
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = parseJson(result);

  assert.equal(payload.status, 'pass');
  assert.equal(payload.summary.requiredItemCount, 4);
  assert.equal(payload.summary.obligationCount, 4);
  assert.deepEqual(payload.findings, []);
});

test('extractor excludes ordinary fenced examples but honors spec-obligations fenced blocks', () => {
  const result = runValidator('fenced-extraction');
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = parseJson(result);

  assert.equal(payload.summary.requiredItemCount, 2);
  assert.ok(payload.items.some((item) => item.id === 'REQ-REAL'));
  assert.ok(payload.items.some((item) => item.id === 'SCN-FENCED'));
  assert.equal(payload.items.some((item) => item.id === 'REQ-EXAMPLE'), false);
});

test('obligation parser ignores ordinary fenced examples that could hide missing rows', () => {
  const payload = validateSpecTestObligations({
    documents: [
      {
        role: 'sprintContract',
        path: 'SPRINT_CONTRACT.md',
        text: [
          'REQ-REAL behaviorChanging: true',
          '',
          '```yaml',
          'specTestObligations:',
          '  - id: REQ-REAL',
          '    behaviorChanging: true',
          '    verificationMode: tdd_red_green',
          '    redCommand: node --test tests/real.test.mjs',
          '    redEvidencePath: evidence/red.json',
          '    greenCommand: node --test tests/real.test.mjs',
          '    greenEvidencePath: evidence/green.json',
          '    status: pass',
          '```',
        ].join('\n'),
      },
    ],
  });

  assert.equal(payload.status, 'fail');
  assert.equal(payload.summary.requiredItemCount, 1);
  assert.equal(payload.summary.obligationCount, 0);
  assert.ok(payload.findings.some((finding) => finding.class === 'spec_test_obligation_missing' && finding.id === 'REQ-REAL'));
});

test('validator blocks smoke-only evidence for every critical scenario', () => {
  const payload = validateSpecTestObligations({
    documents: [
      {
        role: 'scenarioMatrix',
        path: 'SCENARIO_MATRIX.md',
        text: [
          '| Scenario ID | Critical | Flow Depth |',
          '|---|---|---|',
          '| SCN-CRIT | yes | smoke |',
          '',
          '```spec-obligations',
          'specTestObligations:',
          '  - id: SCN-CRIT',
          '    behaviorChanging: true',
          '    verificationMode: evidence_mandatory',
          '    interface: browser',
          '    depth: smoke',
          '    environment: local',
          '    requiredCommand: npm run smoke',
          '    evidencePath: evidence/smoke.json',
          '    bypassReason: smoke-only check',
          '    status: pass',
          '```',
        ].join('\n'),
      },
    ],
  });

  assert.equal(payload.status, 'fail');
  assert.ok(payload.findings.some((finding) => finding.class === 'critical_scenario_smoke_only' && finding.id === 'SCN-CRIT'));
});

test('validator blocks duplicate obligation ids', () => {
  const payload = validateSpecTestObligations({
    documents: [
      {
        role: 'sprintContract',
        path: 'SPRINT_CONTRACT.md',
        text: [
          'REQ-DUP behaviorChanging: true',
          '',
          '```spec-obligations',
          'specTestObligations:',
          '  - id: REQ-DUP',
          '    behaviorChanging: true',
          '    verificationMode: evidence_mandatory',
          '    requiredCommand: node --test tests/dup.test.mjs',
          '    evidencePath: evidence/dup-a.json',
          '    bypassReason: non-tdd evidence accepted for external dependency',
          '    status: pass',
          '  - id: REQ-DUP',
          '    behaviorChanging: true',
          '    verificationMode: evidence_mandatory',
          '    requiredCommand: node --test tests/dup.test.mjs',
          '    evidencePath: evidence/dup-b.json',
          '    bypassReason: conflicting duplicate row',
          '    status: pass',
          '```',
        ].join('\n'),
      },
    ],
  });

  assert.equal(payload.status, 'fail');
  assert.ok(payload.findings.some((finding) => finding.class === 'duplicate_spec_test_obligation' && finding.id === 'REQ-DUP'));
});
