import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';

const root = process.cwd();
const fromRoot = (...segments) => path.join(root, ...segments);
const tempRoots = [];

after(async () => {
  for (const tempRoot of tempRoots) {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

const makeTempRoot = async (prefix) => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), prefix));
  tempRoots.push(tempRoot);
  return tempRoot;
};

const readRoot = async (...segments) => readFile(fromRoot(...segments), 'utf8');

const parseYamlStringValue = (content, key) => {
  const match = new RegExp(`${key}:\\s*"([^"]+)"`).exec(content);
  return match ? match[1] : '';
};

test('root AGENTS is a source-checkout TOC, not a profile-local pointer', async () => {
  const content = await readRoot('AGENTS.md');

  assert.notEqual(content.trim(), '.claude/CLAUDE.md');
  assert.match(content, /Canonical Source/i);
  assert.match(content, /skills\//);
  assert.match(content, /docs\/public/);
  assert.match(content, /Local runtime profiles: root `\.claude\/` and `\.codex\/`/i);
});

test('profile document paths use one active task root and public guideline root', async () => {
  const files = [
    'package/profile-templates/claude/.claude/CLAUDE.md',
    'package/profile-templates/codex/.codex/AGENTS.md',
    'package/profile-templates/claude/.claude/PROJECT.md',
  ];

  for (const file of files) {
    const content = await readRoot(file);
    assert.equal(parseYamlStringValue(content, 'tasksRoot'), '.moonshot-relay/docs/tasks', `${file} tasksRoot`);
    assert.doesNotMatch(content, /tasksRoot:\s*"docs\/claude-tasks"/);
    if (content.includes('guidelinesRoot:')) {
      assert.equal(parseYamlStringValue(content, 'guidelinesRoot'), 'docs/public/guidelines', `${file} guidelinesRoot`);
    }
  }
});

test('plan readiness bridge reports ready state and planned outputs for reviewed plans', async () => {
  const tempRoot = await makeTempRoot('moonshot-relay-plan-ready-');
  const planDir = path.join(tempRoot, 'docs', 'implementation', 'sample-plan');
  const reviewRoot = path.join(planDir, 'planning-loop');
  await mkdir(reviewRoot, { recursive: true });
  await writeFile(path.join(planDir, '00-master-plan-v1.md'), '# Sample Plan\n');
  await writeFile(path.join(planDir, '01-sample-v1.md'), '# Phase 01\n');
  await writeFile(path.join(reviewRoot, 'plan-quality-review-iter-01.yaml'), 'status: pass\n');

  const result = spawnSync(process.execPath, [
    fromRoot('scripts', 'prepare-phase-runner-state.mjs'),
    '--dry-run',
    '--json',
    '--plan-dir',
    planDir,
    '--master-plan',
    path.join(planDir, '00-master-plan-v1.md'),
    '--status-file',
    path.join(tempRoot, '.claude', 'docs', 'phase-status.yaml'),
    '--execution-root',
    path.join(planDir, 'execution'),
  ], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, 'ready');
  assert.deepEqual(payload.phaseDocs, ['01-sample-v1.md']);
  assert.equal(payload.dryRun, true);
  assert.equal(existsSync(path.join(tempRoot, '.claude', 'docs', 'phase-status.yaml')), false);
  assert.ok(payload.plannedWrites.some((entry) => entry.endsWith('phase-status.yaml')));
  assert.ok(payload.plannedWrites.some((entry) => entry.endsWith('phase-runner-readiness.json')));
});

test('implicit phase plan resolution blocks when multiple plan packages exist', () => {
  const result = spawnSync(process.execPath, [
    'scripts/prepare-phase-runner-state.mjs',
    '--dry-run',
    '--json',
  ], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 2, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.status, 'blocked');
  assert.ok(payload.errors.some((error) => /ambiguous/i.test(error)), payload.errors.join('\n'));
});

test('closeout template satisfies the closeout schema required contract', async () => {
  const schema = JSON.parse(await readRoot('schemas', 'plan-closeout.schema.json'));
  const template = JSON.parse(await readRoot('templates', 'execution', 'PLAN_CLOSEOUT.template.json'));

  for (const key of schema.required) {
    assert.ok(Object.hasOwn(template, key), `${key} should be present in closeout template`);
  }
  assert.equal(template.schemaVersion, 1);
  assert.ok(schema.properties.status.enum.includes(template.status));
  assert.deepEqual(Object.keys(template.verification).sort(), ['commands', 'notes', 'verdictFiles']);
  assert.ok(schema.properties.installSync.properties.status.enum.includes(template.installSync.status));
});

test('browser flow runner writes generated-state verdicts and supports smoke health checks', async () => {
  const tempRoot = await makeTempRoot('moonshot-relay-browser-flow-');
  const fakeBrowserctl = path.join(tempRoot, process.platform === 'win32' ? 'browserctl.cmd' : 'browserctl');
  const script = process.platform === 'win32'
    ? '@echo off\r\necho healthy\r\nexit /b 0\r\n'
    : '#!/usr/bin/env sh\necho healthy\nexit 0\n';
  await writeFile(fakeBrowserctl, script);
  await chmod(fakeBrowserctl, 0o755);

  const result = spawnSync(process.execPath, [
    'scripts/browser-flow-runner.mjs',
    '--flow',
    'smoke',
    '--url',
    'data:text/html,ok',
    '--browserctl',
    fakeBrowserctl,
    '--run-id',
    'contract',
    '--verdict-dir',
    path.join(tempRoot, '.moonshot-relay'),
  ], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout.trim(), /\.moonshot-relay\/browser-flow-verdict-contract\.json$/);
  const verdict = JSON.parse(await readFile(path.join(tempRoot, '.moonshot-relay', 'browser-flow-verdict-contract.json'), 'utf8'));
  assert.equal(verdict.status, 'passed');
  assert.equal(verdict.setupGap, false);
  assert.equal(verdict.flow, 'smoke');
});

test('browser runtime verifier defaults generated verdicts to .moonshot-relay', async () => {
  const content = await readRoot('agents', 'verification', 'verify-runtime.sh');

  assert.match(content, /mkdir -p \.claude \.moonshot-relay/);
  assert.match(content, /HARNESS_VERDICT_FILE:-\.moonshot-relay\/runtime-verdict-\$\{RUN_ID\}\.json/);
  assert.match(content, /grep -E '\^\(\\.moonshot-relay\|\\.claude\)\/browser-flow-verdict-'/);
});

test('package dry-run includes workflow runner support scripts and excludes verdict outputs', () => {
  const result = spawnSync(process.execPath, [
    'package/build-package.mjs',
    '--runtime',
    'all',
    '--dry-run',
    '--json',
  ], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  const plannedFrom = payload.runtimes.flatMap((runtime) => runtime.planned.map((entry) => entry.from));
  const plannedTo = payload.runtimes.flatMap((runtime) => runtime.planned.map((entry) => entry.to));

  assert.ok(plannedFrom.includes('scripts/browser-flow-runner.mjs'));
  assert.ok(plannedFrom.includes('scripts/prepare-phase-runner-state.mjs'));
  assert.equal(plannedTo.some((target) => /browser-flow-verdict-/.test(target)), false);
  assert.equal(plannedTo.some((target) => /runtime-verdict-/.test(target)), false);
});

test('README directs users to npm test as the active gate', async () => {
  const readme = await readRoot('README.md');

  assert.match(readme, /npm test/);
  assert.doesNotMatch(readme, /node --test tests\/\*\.mjs/);
  assert.match(readme, /docs\/public\/reference\/phase-runner-user-workflow\.md/);
});
