import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
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

const profileGuidelinesRoots = new Map([
  ['AGENTS.md', 'docs/public/guidelines'],
  ['package/profile-templates/claude/.claude/CLAUDE.md', '${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/docs/public/guidelines'],
  ['package/profile-templates/codex/.codex/AGENTS.md', '${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/docs/public/guidelines'],
  ['package/profile-templates/claude/.claude/PROJECT.md', '${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/docs/public/guidelines'],
]);

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
    'AGENTS.md',
    'package/profile-templates/claude/.claude/CLAUDE.md',
    'package/profile-templates/codex/.codex/AGENTS.md',
    'package/profile-templates/claude/.claude/PROJECT.md',
  ];

  for (const file of files) {
    const content = await readRoot(file);
    assert.equal(parseYamlStringValue(content, 'tasksRoot'), '.moonshot-relay/docs/tasks', `${file} tasksRoot`);
    assert.equal(parseYamlStringValue(content, 'agreementsRoot'), '.moonshot-relay/docs/agreements', `${file} agreementsRoot`);
    assert.doesNotMatch(content, /tasksRoot:\s*"docs\/claude-tasks"/);
    if (content.includes('guidelinesRoot:')) {
      assert.equal(parseYamlStringValue(content, 'guidelinesRoot'), profileGuidelinesRoots.get(file), `${file} guidelinesRoot`);
    }
  }
});

test('service profile TOCs carry current boundary metadata', async () => {
  const files = [
    'package/profile-templates/claude/.claude/CLAUDE.md',
    'package/profile-templates/codex/.codex/AGENTS.md',
  ];

  for (const file of files) {
    const content = await readRoot(file);
    assert.match(content, /Last-Reviewed: 2026-06-06/, `${file} review date`);
    assert.doesNotMatch(content, /Last-Reviewed: 2026-04-09/, `${file} stale review date`);
    assert.match(content, /service runtime profile, not canonical source/i, `${file} boundary wording`);
    assert.doesNotMatch(content, /development profile, not canonical source/i, `${file} stale boundary wording`);
  }
});

test('service profile TOCs point at their own profile entries and common home docs', async () => {
  const claude = await readRoot('package/profile-templates/claude/.claude/CLAUDE.md');
  const codex = await readRoot('package/profile-templates/codex/.codex/AGENTS.md');

  assert.match(claude, /Runtime contract: `CLAUDE\.md` \+ `verification\.contract\.yaml`/);
  assert.match(codex, /Runtime contract: `AGENTS\.md` \+ `verification\.contract\.yaml`/);
  assert.match(claude, /@PROJECT\.md/);
  assert.match(claude, /@rules\/agents\/agent-definition\.md/);
  assert.match(codex, /@rules\/agents\/agent-definition\.md/);
  assert.match(claude, /\$\{MOONSHOT_RELAY_HOME:-~\/\.moonshot-relay\}\/docs\/public\/guidelines\//);
  assert.match(codex, /\$\{MOONSHOT_RELAY_HOME:-~\/\.moonshot-relay\}\/docs\/public\/guidelines\//);
  assert.doesNotMatch(codex, /\.claude\//, 'Codex TOC must not point at Claude profile paths');
  assert.doesNotMatch(codex, /@docs\/public\/guidelines\//, 'Codex TOC common docs are not profile-local');
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
    path.join(tempRoot, '.moonshot-relay', 'docs', 'phase-status.yaml'),
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
  assert.equal(payload.activeExecutionStatus, 'active');
  assert.equal(payload.activePhaseDoc, '01-sample-v1.md');
  assert.equal(payload.phases[0].status, 'in_progress');
  assert.equal(payload.dryRun, true);
  assert.equal(existsSync(path.join(tempRoot, '.moonshot-relay', 'docs', 'phase-status.yaml')), false);
  assert.ok(payload.plannedWrites.some((entry) => entry.endsWith('phase-status.yaml')));
  assert.ok(payload.plannedWrites.some((entry) => entry.endsWith('phase-runner-readiness.json')));
});

test('tracked source roadmaps default execution scratch to docs implementation', () => {
  const result = spawnSync(process.execPath, [
    fromRoot('scripts', 'prepare-phase-runner-state.mjs'),
    '--dry-run',
    '--json',
    '--plan-dir',
    'docs/public/roadmaps/harness-control-plane-modernization',
    '--master-plan',
    'docs/public/roadmaps/harness-control-plane-modernization/00-master-plan-v1.md',
  ], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.ok(payload.plannedWrites.includes('docs/implementation/harness-control-plane-modernization/execution/phase-runner-readiness.json'));
  assert.equal(payload.plannedWrites.some((entry) => entry.startsWith('docs/public/roadmaps/') && entry.includes('/execution/')), false);
});

test('phase runner default run ids are unique when omitted', () => {
  const runPrepare = () => {
    const result = spawnSync(process.execPath, [
      fromRoot('scripts', 'prepare-phase-runner-state.mjs'),
      '--dry-run',
      '--json',
      '--plan-dir',
      'docs/public/roadmaps/harness-control-plane-modernization',
      '--master-plan',
      'docs/public/roadmaps/harness-control-plane-modernization/00-master-plan-v2.md',
    ], {
      cwd: root,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return JSON.parse(result.stdout);
  };

  const first = runPrepare();
  const second = runPrepare();
  assert.match(first.runId, /^phase-runner-\d{14}-[0-9a-f-]{8}$/);
  assert.match(second.runId, /^phase-runner-\d{14}-[0-9a-f-]{8}$/);
  assert.notEqual(first.runId, second.runId);
});

test('phase runner plan preparation selects phase docs matching the explicit master version', () => {
  const result = spawnSync(process.execPath, [
    fromRoot('scripts', 'prepare-phase-runner-state.mjs'),
    '--dry-run',
    '--json',
    '--plan-dir',
    'docs/public/roadmaps/harness-control-plane-modernization',
    '--master-plan',
    'docs/public/roadmaps/harness-control-plane-modernization/00-master-plan-v2.md',
  ], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.ok(payload.phaseDocs.length >= 12);
  assert.ok(payload.phaseDocs.every((file) => file.endsWith('-v2.md')), payload.phaseDocs.join('\n'));
  assert.ok(payload.phaseDocs.includes('01-current-truth-baseline-and-source-preservation-v2.md'));
  assert.equal(payload.phaseDocs.includes('01-baseline-source-truth-v1.md'), false);
  assert.equal(payload.activePhaseDoc, '01-current-truth-baseline-and-source-preservation-v2.md');
  assert.equal(payload.phases[0].status, 'in_progress');
  assert.equal(payload.phases[1].status, 'pending');
});

test('implicit phase plan resolution blocks when multiple plan packages exist', () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'moonshot-relay-ambiguous-plans-'));
  tempRoots.push(tempRoot);
  mkdirSync(path.join(tempRoot, 'docs', 'implementation', 'plan-a'), { recursive: true });
  mkdirSync(path.join(tempRoot, 'docs', 'implementation', 'plan-b'), { recursive: true });
  writeFileSync(path.join(tempRoot, 'docs', 'implementation', 'plan-a', '00-master-plan-v1.md'), '# Plan A\n');
  writeFileSync(path.join(tempRoot, 'docs', 'implementation', 'plan-b', '00-master-plan-v1.md'), '# Plan B\n');

  const result = spawnSync(process.execPath, [
    fromRoot('scripts', 'prepare-phase-runner-state.mjs'),
    '--dry-run',
    '--json',
  ], {
    cwd: tempRoot,
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
  const verifyChanges = await readRoot('agents', 'verification', 'verify-changes.sh');
  const contract = await readRoot('schemas', 'verification.contract.yaml');

  assert.match(content, /HARNESS_VERDICT_FILE:-\.moonshot-relay\/runtime-verdict-\$\{RUN_ID\}\.json/);
  assert.match(content, /mkdir -p "\$\(dirname "\$VERDICT_FILE"\)"/);
  assert.match(verifyChanges, /HARNESS_VERDICT_FILE:-\.moonshot-relay\/verification-verdict-\$\{RUN_ID\}\.json/);
  assert.match(contract, /runtimeVerdict:\s*"\.moonshot-relay\/runtime-verdict-<runId>\.json"/);
  assert.match(contract, /verdict:\s*"\.moonshot-relay\/verification-verdict-<runId>\.json"/);
  assert.doesNotMatch(contract, /runtimeVerdict:\s*"\.claude\/runtime-verdict-/);
  assert.doesNotMatch(contract, /verdict:\s*"\.claude\/verification-verdict-/);
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

test('phase runner treats review rejects as carry-forward blockers while phases remain', async () => {
  const runner = await readRoot('skills', 'moonshot-phase-runner', 'SKILL.md');
  const executor = await readRoot('skills', 'moonshot-phase-executor', 'SKILL.md');

  assert.match(runner, /Do not stop the whole plan just because a completed phase produced review findings/i);
  assert.match(runner, /carry-forward evidence/i);
  assert.match(runner, /continue to the next independent actionable phase/i);
  assert.match(runner, /Only the final whole-plan completion claim requires `assess-completion` to return `accepted`/);
  assert.match(executor, /REJECT`.*worsened eval or blocking runtime event/i);
  assert.match(executor, /carry-forward blockers rather than automatic whole-plan stop conditions/i);
});

test('runtime control plane docs publish DB authority matrix and closeout boundaries', async () => {
  const controlPlane = await readRoot('docs', 'public', 'runtime-control-plane.md');
  const workflow = await readRoot('docs', 'public', 'reference', 'phase-runner-user-workflow.md');
  const coordinator = await readRoot('skills', 'moonshot-in-session-coordinator', 'SKILL.md');

  assert.match(controlPlane, /## Workflow Authority Matrix/);
  assert.match(controlPlane, /runtime-state\.sqlite/);
  assert.match(controlPlane, /\|\s*phase start\s*\|[\s\S]*runtime_events[\s\S]*phase\.start/);
  assert.match(controlPlane, /\|\s*resume\s*\|[\s\S]*resume_snapshots[\s\S]*resume\.(success|failure)/);
  assert.match(controlPlane, /\|\s*blocker\s*\|[\s\S]*runtime_events[\s\S]*blocking/);
  assert.match(controlPlane, /\|\s*phase closeout\s*\|[\s\S]*phase-local evidence/);
  assert.match(controlPlane, /\|\s*whole-plan closeout\s*\|[\s\S]*completion_decisions[\s\S]*accepted/);
  assert.match(controlPlane, /phase-status\.yaml[\s\S]*projection/i);
  assert.match(controlPlane, /projection[\s\S]*must not become authority/i);

  assert.match(workflow, /Phase closeout/i);
  assert.match(workflow, /Whole-plan closeout/i);
  assert.match(workflow, /phase-local evidence/i);
  assert.match(workflow, /assess-completion[\s\S]*accepted DB decision/i);
  assert.match(workflow, /phase-status\.yaml[\s\S]*projection/i);

  assert.match(coordinator, /phase-status\.yaml[\s\S]*projection/i);
  assert.match(coordinator, /whole-plan completion authority/i);
  assert.match(coordinator, /assess-completion[\s\S]*accepted DB decision/i);
});

test('phase runner surfaces describe phase-status as projection only', async () => {
  const files = [
    ['skills', 'moonshot-phase-runner', 'SKILL.md'],
    ['skills', 'moonshot-phase-runner', 'SKILL.ko.md'],
    ['skills', 'moonshot-phase-runner', 'references', 'control-plane.md'],
    ['skills', 'moonshot-in-session-coordinator', 'SKILL.md'],
    ['skills', 'moonshot-in-session-coordinator', 'SKILL.ko.md'],
    ['docs', 'public', 'reference', 'phase-runner-user-workflow.md'],
    ['docs', 'public', 'reference', 'phase-final-guard-hooks.md'],
    ['templates', 'execution', 'PHASE_COORDINATOR_CONTRACT.md'],
  ];
  const unsafePatterns = [
    /phaseStatusFile[\s\S]{0,120}authoritative for this run/i,
    /Runtime status:\s*active\s+`?phase-status\.yaml/i,
    /phase-status\.yaml[\s\S]{0,120}(?:is|as)\s+(?:the\s+)?(?:single\s+)?authority/i,
  ];

  for (const segments of files) {
    const text = await readRoot(...segments);
    assert.match(
      text,
      /phase-status\.yaml|phaseStatusFile/,
      `${segments.join('/')} should name the phase status projection surface`,
    );
    assert.match(
      text,
      /projection|cursor/i,
      `${segments.join('/')} should describe phase status as a projection or cursor`,
    );
    for (const pattern of unsafePatterns) {
      assert.doesNotMatch(text, pattern, `${segments.join('/')} should not imply phase-status authority`);
    }
  }
});
