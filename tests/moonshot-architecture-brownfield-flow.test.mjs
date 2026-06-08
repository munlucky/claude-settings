import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { buildArchitectureContext } from '../scripts/architecture-context-build.mjs';
import { validateArchitectureArtifacts } from '../scripts/architecture-artifact-validate.mjs';

const root = process.cwd();
const fixtureRoot = path.join(root, 'tests', 'fixtures', 'moonshot-architecture', 'brownfield');
const repoRoot = path.join(fixtureRoot, 'repo');
const packageRoot = path.join(fixtureRoot, 'package');
const objectivePath = path.join(fixtureRoot, 'input', 'OBJECTIVE.md');

const readPackage = (relativePath) => readFile(path.join(packageRoot, ...relativePath.split('/')), 'utf8');

const parseTable = (markdown) => {
  const rows = [];
  for (const line of markdown.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) continue;
    const cells = trimmed.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
    if (cells.every((cell) => /^:?-+:?$/.test(cell))) continue;
    rows.push(cells);
  }
  if (rows.length < 2) return [];
  const [headers, ...body] = rows;
  return body.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] || ''])));
};

test('brownfield context builder requires current architecture and fit-gap artifacts', () => {
  const result = buildArchitectureContext({
    cwd: root,
    stage: 'execute',
    mode: 'brownfield_codebase',
  });

  assert.notEqual(result.status, 'failed');
  assert.equal(result.architectureContext.mode, 'brownfield_codebase');
  assert.ok(result.architectureContext.requiredArtifacts.includes('CURRENT_ARCHITECTURE.md'));
  assert.ok(result.architectureContext.requiredArtifacts.includes('PRD_FIT_GAP.md'));
  assert.ok(result.architectureContext.requiredArtifacts.includes('IMPACT_MAP.md'));
  assert.ok(result.architectureContext.requiredArtifacts.includes('SPEC_DELTA.md'));
  assert.equal(result.architectureContext.requiredArtifacts.includes('DOMAIN_MODEL.md'), false);
});

test('brownfield fixture validates as an architecture package', async () => {
  const objective = await readFile(objectivePath, 'utf8');
  assert.match(objective, /REQ-101/);

  const result = await validateArchitectureArtifacts({
    mode: 'brownfield_codebase',
    artifactPath: packageRoot,
    repoRoot,
  });

  assert.equal(result.status, 'passed', JSON.stringify(result.errors, null, 2));
  assert.ok(result.checkedFiles.includes('CURRENT_ARCHITECTURE.md'));
  assert.ok(result.checkedFiles.includes('PRD_FIT_GAP.md'));
  assert.ok(result.checkedFiles.includes('IMPACT_MAP.md'));
  assert.ok(result.checkedFiles.includes('SPEC_DELTA.md'));
  assert.ok(result.checkedFiles.includes('PLAN.md'));
  assert.ok(result.checkedFiles.includes('ARCHITECTURE_REVIEW.md'));
});

test('brownfield current architecture claims cite existing repository evidence paths', async () => {
  const currentArchitecture = await readPackage('CURRENT_ARCHITECTURE.md');
  const evidenceRows = parseTable(currentArchitecture)
    .filter((row) => row['Evidence Path'] && row.Observation && /^(high|medium|low)$/.test(row.Confidence || ''));

  assert.ok(evidenceRows.length >= 3);
  for (const row of evidenceRows) {
    const evidencePath = row['Evidence Path'];
    assert.equal(existsSync(path.join(repoRoot, ...evidencePath.split('/'))), true, `${evidencePath} should exist in fixture repo`);
    assert.notEqual(row.Observation, '');
    assert.match(row.Confidence, /high|medium|low/);
  }
});

test('brownfield package fixes path boundaries before handoff', async () => {
  const currentArchitecture = await readPackage('CURRENT_ARCHITECTURE.md');
  const impactMap = await readPackage('IMPACT_MAP.md');
  const specDelta = await readPackage('SPEC_DELTA.md');

  assert.match(currentArchitecture, /^## Owned Paths/m);
  assert.match(currentArchitecture, /^## Read-only Paths/m);
  assert.match(currentArchitecture, /^## Staged Paths/m);
  assert.match(currentArchitecture, /src\/audit-log.js/);
  assert.match(currentArchitecture, /src\/approval-service.js/);
  assert.match(currentArchitecture, /tests\/approval-flow.test.js/);
  assert.match(impactMap, /Compatibility Impact/);
  assert.match(impactMap, /Migration Strategy/);
  assert.match(specDelta, /Rollback/);
});

test('brownfield traceability links recovered evidence to spec delta plan owner and verification signal', async () => {
  const traceability = parseTable(await readPackage('TRACEABILITY_MATRIX.md'));
  const plan = parseTable(await readPackage('PLAN.md'));
  const row = traceability.find((candidate) => candidate['Requirement ID'] === 'REQ-101');

  assert.ok(row);
  assert.equal(row['Evidence Path'], 'src/approval-service.js');
  assert.equal(row['Spec Delta ID'], 'DELTA-101');
  assert.equal(row['Task ID'], 'TASK-101');
  assert.equal(row.Owner, 'application');
  assert.equal(row['Verification Signal'], 'approval audit regression test passes');

  const planRow = plan.find((candidate) => candidate['Task ID'] === row['Task ID']);
  assert.ok(planRow);
  assert.equal(planRow.Owner, row.Owner);
  assert.equal(planRow['Verification Signal'], row['Verification Signal']);
});

test('brownfield validator fails missing review plan and path-boundary contracts', async () => {
  for (const [mutate, expectedCode] of [
    [
      async (tempPackage) => {
        await rm(path.join(tempPackage, 'ARCHITECTURE_REVIEW.md'), { force: true });
      },
      'missing_required_file',
    ],
    [
      async (tempPackage) => {
        const plan = await readFile(path.join(tempPackage, 'PLAN.md'), 'utf8');
        await writeFile(path.join(tempPackage, 'PLAN.md'), plan.replace('approval audit regression test passes', 'stale signal'), 'utf8');
      },
      'plan_verification_mismatch',
    ],
    [
      async (tempPackage) => {
        const current = await readFile(path.join(tempPackage, 'CURRENT_ARCHITECTURE.md'), 'utf8');
        await writeFile(path.join(tempPackage, 'CURRENT_ARCHITECTURE.md'), current.replace('## Read-only Paths', '## Baseline Paths'), 'utf8');
      },
      'brownfield_missing_readonly_paths',
    ],
    [
      async (tempPackage) => {
        const current = await readFile(path.join(tempPackage, 'CURRENT_ARCHITECTURE.md'), 'utf8');
        await writeFile(path.join(tempPackage, 'CURRENT_ARCHITECTURE.md'), current.replace('src/approval-service.js', 'src/missing-service.js'), 'utf8');
      },
      'brownfield_missing_repo_evidence_path',
    ],
    [
      async (tempPackage) => {
        const current = await readFile(path.join(tempPackage, 'CURRENT_ARCHITECTURE.md'), 'utf8');
        await writeFile(
          path.join(tempPackage, 'CURRENT_ARCHITECTURE.md'),
          current.replace('| src/approval-service.js | baseline request and decision API evidence |', '| src/audit-log.js | baseline request and decision API evidence |'),
          'utf8',
        );
      },
      'brownfield_path_boundary_overlap',
    ],
    [
      async (tempPackage) => {
        const fitGap = await readFile(path.join(tempPackage, 'PRD_FIT_GAP.md'), 'utf8');
        await writeFile(path.join(tempPackage, 'PRD_FIT_GAP.md'), fitGap.replace('REQ-101', 'REQ-999'), 'utf8');
      },
      'brownfield_fit_gap_unknown_requirement',
    ],
    [
      async (tempPackage) => {
        const traceability = await readFile(path.join(tempPackage, 'TRACEABILITY_MATRIX.md'), 'utf8');
        await writeFile(path.join(tempPackage, 'TRACEABILITY_MATRIX.md'), traceability.replace('DELTA-101', 'DELTA-999'), 'utf8');
      },
      'brownfield_traceability_unknown_spec_delta',
    ],
  ]) {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-brownfield-'));
    try {
      const tempPackage = path.join(tempRoot, 'package');
      await cp(packageRoot, tempPackage, { recursive: true });
      await mutate(tempPackage);

      const result = await validateArchitectureArtifacts({
        mode: 'brownfield_codebase',
        artifactPath: tempPackage,
        repoRoot,
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
