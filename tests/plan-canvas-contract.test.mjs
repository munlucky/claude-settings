import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';

import {
  buildFeedbackReceipt,
  buildRevisionProposal,
  defaultCanvasOutput,
  renderPlanCanvas,
  writePlanCanvas,
} from '../tools/plan-canvas/plan-canvas.mjs';

const tempRoots = [];

after(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
});

const makePlan = async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'moonshot-plan-canvas-'));
  tempRoots.push(tempRoot);
  const planDir = path.join(tempRoot, 'docs', 'implementation', 'canvas-plan');
  await mkdir(planDir, { recursive: true });
  await writeFile(path.join(planDir, '00-master-plan-v1.md'), '# Master Plan\n\n## Scope\n\n- Required item\n');
  await writeFile(path.join(planDir, '01-phase-v1.md'), '# Phase 01\n\n## Acceptance Criteria\n\nComplete.\n');
  return { tempRoot, planDir };
};

test('plan canvas renders HTML as derived output while naming source truth', async () => {
  const { tempRoot, planDir } = await makePlan();
  const html = await renderPlanCanvas({ planDir, repoRoot: tempRoot, generatedAt: '2026-06-23T00:00:00.000Z' });
  const output = defaultCanvasOutput({ repoRoot: tempRoot, planDir });
  const result = await writePlanCanvas({ planDir, repoRoot: tempRoot });

  assert.match(html, /data-source-truth="markdown_yaml_plan_package"/);
  assert.match(html, /00-master-plan-v1\.md/);
  assert.equal(output.includes(path.join('.moonshot-relay', 'plan-canvas')), true);
  assert.equal(result.sourceTruth, 'markdown_yaml_plan_package');
  assert.equal(existsSync(path.join(tempRoot, result.out)), true);
});

test('plan canvas feedback creates revision proposal without mutating source', async () => {
  const { tempRoot, planDir } = await makePlan();
  const sourcePath = path.join(planDir, '01-phase-v1.md');
  const before = await readFile(sourcePath, 'utf8');
  const feedback = buildFeedbackReceipt({
    repoRoot: tempRoot,
    planDir,
    generatedFrom: '.moonshot-relay/plan-canvas/canvas-plan/index.html',
    items: [{
      id: 'FB-1',
      target: { file: '01-phase-v1.md', heading: 'Acceptance Criteria' },
      severity: 'blocking',
      comment: 'Acceptance evidence is too vague.',
      disposition: 'needs_revision',
    }],
  });
  const proposal = buildRevisionProposal({ feedback, createdAt: '2026-06-23T00:00:00.000Z' });

  assert.equal(feedback.artifactId, 'PLAN_CANVAS_FEEDBACK');
  assert.equal(feedback.sourceTruth, 'markdown_yaml_plan_package');
  assert.equal(proposal.artifactId, 'PLAN_REVISION_PROPOSAL');
  assert.equal(proposal.mutatesSource, false);
  assert.equal(proposal.proposedChanges[0].file, '01-phase-v1.md');
  assert.equal(await readFile(sourcePath, 'utf8'), before);
});

test('plan canvas CLI writes generated HTML feedback and revision proposal', async () => {
  const { tempRoot, planDir } = await makePlan();
  const htmlOut = path.join(tempRoot, '.moonshot-relay', 'plan-canvas', 'canvas-plan', 'index.html');
  const feedbackOut = path.join(tempRoot, '.moonshot-relay', 'plan-canvas', 'canvas-plan', 'feedback.json');
  const proposalOut = path.join(tempRoot, '.moonshot-relay', 'plan-canvas', 'canvas-plan', 'proposal.json');
  const render = spawnSync(process.execPath, [
    'tools/plan-canvas/plan-canvas.mjs',
    'render',
    '--plan-dir',
    planDir,
    '--out',
    htmlOut,
    '--json',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(render.status, 0, render.stderr || render.stdout);
  assert.equal(JSON.parse(render.stdout).sourceTruth, 'markdown_yaml_plan_package');

  const feedback = spawnSync(process.execPath, [
    'tools/plan-canvas/plan-canvas.mjs',
    'feedback',
    '--plan-dir',
    planDir,
    '--generated-from',
    htmlOut,
    '--items-json',
    JSON.stringify([{
      id: 'FB-2',
      target: { file: '00-master-plan-v1.md' },
      severity: 'warning',
      comment: 'Clarify scope.',
      disposition: 'needs_revision',
    }]),
    '--out',
    feedbackOut,
    '--json',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(feedback.status, 0, feedback.stderr || feedback.stdout);

  const proposal = spawnSync(process.execPath, [
    'tools/plan-canvas/plan-canvas.mjs',
    'revision-proposal',
    '--feedback',
    feedbackOut,
    '--out',
    proposalOut,
    '--json',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  assert.equal(proposal.status, 0, proposal.stderr || proposal.stdout);
  assert.equal(JSON.parse(await readFile(proposalOut, 'utf8')).mutatesSource, false);
});

test('plan feedback schema and guideline preserve derived output boundary', async () => {
  const schema = JSON.parse(await readFile(path.join(process.cwd(), 'schemas', 'plan-feedback.schema.json'), 'utf8'));
  const guideline = await readFile(path.join(process.cwd(), 'docs', 'public', 'guidelines', 'plan-review-canvas.md'), 'utf8');

  assert.equal(schema.properties.sourceTruth.const, 'markdown_yaml_plan_package');
  assert.match(guideline, /derived output/i);
  assert.match(guideline, /source of truth/i);
});

test('generated canvas artifacts are excluded from package dry-run payload', async () => {
  const result = spawnSync(process.execPath, [
    'package/build-package.mjs',
    '--runtime',
    'all',
    '--dry-run',
    '--json',
  ], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  const plannedTo = payload.runtimes.flatMap((runtime) => runtime.planned.map((entry) => entry.to));
  assert.ok(plannedTo.some((target) => target.endsWith('tools/plan-canvas/plan-canvas.mjs')));
  assert.equal(plannedTo.some((target) => target.includes('/.moonshot-relay/plan-canvas/')), false);
});
