import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';

import { buildArchitectureContext } from '../scripts/architecture-context-build.mjs';
import { validateArchitectureArtifacts } from '../scripts/architecture-artifact-validate.mjs';

const root = process.cwd();
const tempRoots = [];
const fromRoot = (...segments) => path.join(root, ...segments);

after(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
});

const makeTempPackage = async (fixtureName) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-architecture-regression-'));
  tempRoots.push(tempRoot);
  const packagePath = path.join(tempRoot, 'package');
  await cp(fromRoot('tests', 'fixtures', 'moonshot-architecture', 'artifacts', fixtureName), packagePath, { recursive: true });
  return packagePath;
};

test('architecture regression positive fixtures remain valid', async () => {
  for (const [mode, fixtureName] of [
    ['greenfield_prd', 'greenfield-valid'],
    ['brownfield_codebase', 'brownfield-valid'],
  ]) {
    const result = await validateArchitectureArtifacts({
      mode,
      artifactPath: fromRoot('tests', 'fixtures', 'moonshot-architecture', 'artifacts', fixtureName),
    });

    assert.equal(result.status, 'passed', JSON.stringify(result.errors, null, 2));
  }
});

test('architecture regression rejects missing ASR ADR traceability review and verification signal', async () => {
  for (const [mutate, expectedCode] of [
    [
      async (packagePath) => rm(path.join(packagePath, 'ASR_CATALOG.md'), { force: true }),
      'missing_required_file',
    ],
    [
      async (packagePath) => rm(path.join(packagePath, 'ADR'), { recursive: true, force: true }),
      'missing_adr_directory',
    ],
    [
      async (packagePath) => rm(path.join(packagePath, 'TRACEABILITY_MATRIX.md'), { force: true }),
      'missing_required_file',
    ],
    [
      async (packagePath) => rm(path.join(packagePath, 'ARCHITECTURE_REVIEW.md'), { force: true }),
      'missing_required_file',
    ],
    [
      async (packagePath) => {
        const traceabilityPath = path.join(packagePath, 'TRACEABILITY_MATRIX.md');
        const traceability = await readFile(traceabilityPath, 'utf8');
        await writeFile(traceabilityPath, traceability.replace('validator pass', ''), 'utf8');
      },
      'plan_verification_mismatch',
    ],
  ]) {
    const packagePath = await makeTempPackage('greenfield-valid');
    await mutate(packagePath);

    const result = await validateArchitectureArtifacts({
      mode: 'greenfield_prd',
      artifactPath: packagePath,
    });

    assert.equal(result.status, 'failed');
    assert.ok(
      result.errors.some((error) => error.code === expectedCode),
      `${expectedCode} should fail: ${JSON.stringify(result.errors)}`,
    );
  }
});

test('architecture regression rejects brownfield missing repo evidence and trace drift', async () => {
  for (const [mutate, expectedCode] of [
    [
      async (packagePath) => {
        const currentPath = path.join(packagePath, 'CURRENT_ARCHITECTURE.md');
        const current = await readFile(currentPath, 'utf8');
        await writeFile(currentPath, current.replace('src/approval-service.js', 'src/missing-service.js'), 'utf8');
      },
      'brownfield_missing_repo_evidence_path',
    ],
    [
      async (packagePath) => {
        const fitGapPath = path.join(packagePath, 'PRD_FIT_GAP.md');
        const fitGap = await readFile(fitGapPath, 'utf8');
        await writeFile(fitGapPath, fitGap.replace('REQ-101', 'REQ-999'), 'utf8');
      },
      'brownfield_fit_gap_unknown_requirement',
    ],
    [
      async (packagePath) => {
        const traceabilityPath = path.join(packagePath, 'TRACEABILITY_MATRIX.md');
        const traceability = await readFile(traceabilityPath, 'utf8');
        await writeFile(traceabilityPath, traceability.replace('DELTA-101', 'DELTA-999'), 'utf8');
      },
      'brownfield_traceability_unknown_spec_delta',
    ],
  ]) {
    const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-architecture-brownfield-regression-'));
    tempRoots.push(tempRoot);
    const packagePath = path.join(tempRoot, 'package');
    await cp(fromRoot('tests', 'fixtures', 'moonshot-architecture', 'brownfield', 'package'), packagePath, { recursive: true });
    await mutate(packagePath);

    const result = await validateArchitectureArtifacts({
      mode: 'brownfield_codebase',
      artifactPath: packagePath,
      repoRoot: fromRoot('tests', 'fixtures', 'moonshot-architecture', 'brownfield', 'repo'),
    });

    assert.equal(result.status, 'failed');
    assert.ok(
      result.errors.some((error) => error.code === expectedCode),
      `${expectedCode} should fail: ${JSON.stringify(result.errors)}`,
    );
  }
});

test('architecture regression blocks raw context leakage and phase-status-only closeout', async () => {
  for (const contextNote of [
    '{"nodes":[],"relationships":[]}',
    '{"edges":[{"relationship":"depends_on"}]}',
    '@prefix ex: <https://example.invalid/> .',
    'runtime log transcript with Authorization: Bearer abcdef',
  ]) {
    const result = buildArchitectureContext({
      cwd: root,
      stage: 'execute',
      mode: 'greenfield_prd',
      contextNotes: [contextNote],
    });

    assert.equal(result.status, 'failed');
    assert.equal(result.architectureContext.blocking, true);
  }

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-architecture-phase-status-'));
  tempRoots.push(tempRoot);
  const statusFile = path.join(tempRoot, 'phase-status.yaml');
  await writeFile(statusFile, [
    'planDir: "${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/state/projects/munlucky-moonshot-relay/planning/packages/moonshot-architecture-2026-06-08"',
    'masterPlan: "${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/state/projects/munlucky-moonshot-relay/planning/packages/moonshot-architecture-2026-06-08/00-master-plan-v1.ko.md"',
    'runId: "run-architecture-regression"',
    'goalId: "goal-architecture-regression"',
    'workspaceId: "workspace-architecture-regression"',
    'activeExecutionStatus: "active"',
    'activePhaseDoc: "08-regression-evaluation-gates-v1.ko.md"',
    'status: "ready"',
    'phaseDocs:',
    '  - "08-regression-evaluation-gates-v1.ko.md"',
    'phases:',
    '  - number: 8',
    '    title: "08-regression-evaluation-gates-v1.ko.md"',
    '    doc: "08-regression-evaluation-gates-v1.ko.md"',
    '    status: "in_progress"',
    '',
  ].join('\n'), 'utf8');

  const guard = spawnSync(process.execPath, [
    'scripts/phase-final-guard.mjs',
    '--mode',
    'check',
    '--status-file',
    statusFile,
    '--json',
  ], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(guard.status, 0, guard.stderr || guard.stdout);
  const payload = JSON.parse(guard.stdout);
  assert.equal(payload.status, 'resume_required');
  assert.match(JSON.stringify(payload), /08-regression-evaluation-gates-v1\.ko\.md|in_progress/i);
});
