import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { buildArchitectureContext } from '../scripts/architecture-context-build.mjs';
import { validateArchitectureArtifacts } from '../scripts/architecture-artifact-validate.mjs';

const root = process.cwd();
const fixtureRoot = path.join(root, 'tests', 'fixtures', 'moonshot-architecture', 'greenfield');
const packageRoot = path.join(fixtureRoot, 'package');
const prdPath = path.join(fixtureRoot, 'input', 'PRD.md');

const readFixture = (relativePath) => readFile(path.join(packageRoot, ...relativePath.split('/')), 'utf8');

const parseTable = (markdown) => {
  const rows = [];
  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || /^[-|\s:]+$/.test(trimmed.replace(/^\||\|$/g, ''))) continue;
    const cells = trimmed.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
    if (cells.every((cell) => /^-+$/.test(cell))) continue;
    rows.push(cells);
  }
  if (rows.length < 2) return [];
  const [headers, ...body] = rows;
  return body.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] || ''])));
};

test('greenfield context builder exposes PRD-only required artifacts without brownfield evidence', () => {
  const result = buildArchitectureContext({
    cwd: root,
    stage: 'execute',
    mode: 'greenfield_prd',
  });

  assert.notEqual(result.status, 'failed');
  assert.equal(result.architectureContext.mode, 'greenfield_prd');
  assert.ok(result.architectureContext.requiredArtifacts.includes('ARCHITECTURE_BRIEF.md'));
  assert.ok(result.architectureContext.requiredArtifacts.includes('QUALITY_ATTRIBUTE_SCENARIOS.md'));
  assert.ok(result.architectureContext.requiredArtifacts.includes('TRACEABILITY_MATRIX.md'));
  assert.equal(result.architectureContext.requiredArtifacts.includes('CURRENT_ARCHITECTURE.md'), false);
  assert.equal(result.architectureContext.requiredArtifacts.includes('SPEC_DELTA.md'), false);
});

test('greenfield fixture validates as an architecture package', async () => {
  const prd = await readFile(prdPath, 'utf8');
  assert.match(prd, /REQ-001/);
  assert.match(prd, /REQ-002/);

  const result = await validateArchitectureArtifacts({
    mode: 'greenfield_prd',
    artifactPath: packageRoot,
  });

  assert.equal(result.status, 'passed', JSON.stringify(result.errors, null, 2));
  assert.equal(result.errors.length, 0);
  assert.ok(result.checkedFiles.includes('TRACEABILITY_MATRIX.md'));
  assert.ok(result.checkedFiles.includes('PLAN.md'));
  assert.ok(result.checkedFiles.includes('ARCHITECTURE_REVIEW.md'));
  assert.ok(result.checkedFiles.includes('ADR/ADR-0001-greenfield-delivery-slice.md'));
});

test('greenfield traceability links every accepted requirement to scenario ASR ADR task owner and verification signal', async () => {
  const requirements = parseTable(await readFixture('REQUIREMENT_INVENTORY.md'));
  const scenarios = parseTable(await readFixture('QUALITY_ATTRIBUTE_SCENARIOS.md'));
  const traceability = parseTable(await readFixture('TRACEABILITY_MATRIX.md'));
  const plan = parseTable(await readFixture('PLAN.md'));

  const accepted = requirements.filter((row) => row.Status === 'Accepted');
  const knownScenarioIds = new Set(scenarios.map((row) => row['Scenario ID']));
  assert.equal(accepted.length, 2);

  for (const requirement of accepted) {
    const row = traceability.find((candidate) => candidate['Requirement ID'] === requirement['Requirement ID']);
    assert.ok(row, `${requirement['Requirement ID']} should appear in traceability`);
    assert.match(row['Scenario ID'], /^QAS-[0-9]{3,}$/);
    assert.equal(knownScenarioIds.has(row['Scenario ID']), true);
    assert.match(row['ASR ID'], /^ASR-[0-9]{3,}$/);
    assert.match(row['ADR ID'], /^ADR-[0-9]{4,}$/);
    assert.match(row['Task ID'], /^TASK-[0-9]{3,}$/);
    assert.notEqual(row.Owner, '');
    assert.notEqual(row['Verification Signal'], '');
    const planRow = plan.find((candidate) => candidate['Task ID'] === row['Task ID']);
    assert.ok(planRow, `${row['Task ID']} should appear as a PLAN row`);
    assert.equal(planRow.Owner, row.Owner);
    assert.equal(planRow['Verification Signal'], row['Verification Signal']);
  }
});

test('greenfield fixture documents options rejected alternatives and ADR completeness', async () => {
  const options = await readFixture('ARCHITECTURE_OPTIONS.md');
  const tradeoff = await readFixture('TRADEOFF_ANALYSIS.md');
  const adr = await readFixture('ADR/ADR-0001-greenfield-delivery-slice.md');

  assert.match(options, /OPT-001/);
  assert.match(options, /OPT-002/);
  assert.match(tradeoff, /Rejected alternatives/i);
  assert.match(adr, /^## Decision/m);
  assert.match(adr, /^## Rejected Alternatives/m);
  assert.match(adr, /REQ-001/);
  assert.match(adr, /ASR-001/);
});

test('greenfield validator fails when ASR ADR or traceability is removed', async () => {
  for (const [removeTarget, expectedCode] of [
    ['ASR_CATALOG.md', 'missing_asr_id'],
    ['TRACEABILITY_MATRIX.md', 'traceability_missing_requirement'],
    ['ADR', 'missing_adr_directory'],
    ['ARCHITECTURE_REVIEW.md', 'missing_required_file'],
  ]) {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-greenfield-'));
    try {
      const tempPackage = path.join(tempRoot, 'package');
      await cp(packageRoot, tempPackage, { recursive: true });
      await rm(path.join(tempPackage, removeTarget), { recursive: true, force: true });

      const result = await validateArchitectureArtifacts({
        mode: 'greenfield_prd',
        artifactPath: tempPackage,
      });

      assert.equal(result.status, 'failed');
      assert.ok(
        result.errors.some((error) => error.code === expectedCode),
        `${removeTarget} should include ${expectedCode}: ${JSON.stringify(result.errors)}`,
      );
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }
});

test('greenfield validator fails semantic trace drift', async () => {
  for (const [mutate, expectedCode] of [
    [
      async (tempPackage) => {
        const traceability = await readFile(path.join(tempPackage, 'TRACEABILITY_MATRIX.md'), 'utf8');
        await writeFile(path.join(tempPackage, 'TRACEABILITY_MATRIX.md'), traceability.replace('QAS-001', 'QAS-999'), 'utf8');
      },
      'traceability_unknown_scenario',
    ],
    [
      async (tempPackage) => {
        const plan = await readFile(path.join(tempPackage, 'PLAN.md'), 'utf8');
        await writeFile(path.join(tempPackage, 'PLAN.md'), plan.replace('request submission contract test passes', 'stale prose mention only'), 'utf8');
      },
      'plan_verification_mismatch',
    ],
    [
      async (tempPackage) => {
        const plan = await readFile(path.join(tempPackage, 'PLAN.md'), 'utf8');
        await writeFile(path.join(tempPackage, 'PLAN.md'), plan.replace('| TASK-001 | REQ-001 | application |', '| TASK-001 | REQ-001 | platform |'), 'utf8');
      },
      'plan_owner_mismatch',
    ],
    [
      async (tempPackage) => {
        const traceability = await readFile(path.join(tempPackage, 'TRACEABILITY_MATRIX.md'), 'utf8');
        const scenarios = await readFile(path.join(tempPackage, 'QUALITY_ATTRIBUTE_SCENARIOS.md'), 'utf8');
        await writeFile(path.join(tempPackage, 'TRACEABILITY_MATRIX.md'), traceability.replace('QAS-001', 'QAS-999'), 'utf8');
        await writeFile(path.join(tempPackage, 'QUALITY_ATTRIBUTE_SCENARIOS.md'), `${scenarios}\nHistorical note: QAS-999 was considered but not accepted as a scenario row.\n`, 'utf8');
      },
      'traceability_unknown_scenario',
    ],
  ]) {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-greenfield-'));
    try {
      const tempPackage = path.join(tempRoot, 'package');
      await cp(packageRoot, tempPackage, { recursive: true });
      await mutate(tempPackage);

      const result = await validateArchitectureArtifacts({
        mode: 'greenfield_prd',
        artifactPath: tempPackage,
      });

      assert.equal(result.status, 'failed');
      assert.ok(
        result.errors.some((error) => error.code === expectedCode),
        `${expectedCode} should fail: ${JSON.stringify(result.errors)}`,
      );
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  }
});
