import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { after, test } from 'node:test';

const root = process.cwd();
const tempRoots = [];

const makeTempRoot = async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'moonshot-phase-final-guard-'));
  tempRoots.push(dir);
  return dir;
};

after(async () => {
  await Promise.all(tempRoots.map((dir) => rm(dir, { recursive: true, force: true })));
});

const runGuard = (args, input = {}) => spawnSync(process.execPath, [
  'scripts/phase-final-guard.mjs',
  ...args,
], {
  cwd: root,
  encoding: 'utf8',
  input: `${JSON.stringify(input)}\n`,
  env: {
    ...process.env,
    PHASE_RUNTIME_DB: path.join(os.tmpdir(), `moonshot-phase-final-guard-${process.pid}.sqlite`),
  },
});

const runRuntimeState = (args, dbPath) => spawnSync(process.execPath, [
  'scripts/runtime-state.mjs',
  ...args,
], {
  cwd: root,
  encoding: 'utf8',
  env: {
    ...process.env,
    PHASE_RUNTIME_DB: dbPath,
  },
});

const parseJson = (result) => {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
};

const writeStatus = async (dir, phases, extra = {}) => {
  const statusFile = path.join(dir, 'phase-status.yaml');
  const lines = [
    'planDir: "docs/public/roadmaps/demo"',
    'masterPlan: "docs/public/roadmaps/demo/00-master-plan-v1.md"',
    `runId: "${extra.runId || 'run-final-guard'}"`,
    `goalId: "${extra.goalId || 'goal-final-guard'}"`,
    'workspaceId: "workspace-final-guard"',
    `activeExecutionStatus: "${extra.activeExecutionStatus || 'active'}"`,
    `activePhaseDoc: "${extra.activePhaseDoc || phases.find((phase) => phase.status !== 'complete')?.doc || ''}"`,
    `status: "${extra.status || 'ready'}"`,
    'phaseDocs:',
    ...phases.map((phase) => `  - "${phase.doc}"`),
    'phases:',
  ];
  for (const [index, phase] of phases.entries()) {
    lines.push(`  - number: ${index + 1}`);
    lines.push(`    title: "Phase ${index + 1}"`);
    lines.push(`    doc: "${phase.doc}"`);
    lines.push(`    status: "${phase.status}"`);
  }
  await writeFile(statusFile, `${lines.join('\n')}\n`);
  return statusFile;
};

const writeTranscript = async (dir, messages) => {
  const transcriptPath = path.join(dir, 'transcript.jsonl');
  const records = messages.map((text) => JSON.stringify({
    type: 'response_item',
    payload: {
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text }],
    },
  }));
  await writeFile(transcriptPath, `${records.join('\n')}\n`);
  return transcriptPath;
};

test('Claude Stop adapter blocks final completion claims when actionable phases remain', async () => {
  const dir = await makeTempRoot();
  const statusFile = await writeStatus(dir, [
    { doc: '01-baseline-v1.md', status: 'complete' },
    { doc: '02-package-v1.md', status: 'in_progress' },
    { doc: '03-rollout-v1.md', status: 'pending' },
  ]);

  const payload = parseJson(runGuard([
    '--mode',
    'claude-stop',
    '--status-file',
    statusFile,
    '--json',
  ], {
    hook_event_name: 'Stop',
    last_assistant_message: '작업 진행 완료했습니다.',
  }));

  assert.equal(payload.status, 'resume_required');
  assert.equal(payload.hookOutput.decision, 'block');
  assert.match(payload.hookOutput.reason, /02-package-v1\.md/);
  assert.equal(payload.remainingPhases.length, 2);
});

test('Codex Stop adapter uses the same block decision contract', async () => {
  const dir = await makeTempRoot();
  const statusFile = await writeStatus(dir, [
    { doc: '01-baseline-v1.md', status: 'complete' },
    { doc: '02-package-v1.md', status: 'pending' },
  ]);

  const payload = parseJson(runGuard([
    '--mode',
    'codex-stop',
    '--status-file',
    statusFile,
    '--json',
  ], {
    hook_event_name: 'Stop',
    last_assistant_message: 'All work is complete.',
  }));

  assert.equal(payload.status, 'resume_required');
  assert.equal(payload.hookOutput.decision, 'block');
  assert.match(payload.hookOutput.reason, /02-package-v1\.md/);
});

test('Codex Phase Runner Stop blocks unfinished work without completion wording', async () => {
  const dir = await makeTempRoot();
  const statusFile = await writeStatus(dir, [
    { doc: '01-baseline-v1.md', status: 'complete' },
    { doc: '02-package-v1.md', status: 'in_progress' },
  ]);
  const transcriptPath = await writeTranscript(dir, [
    '[$moonshot-phase-runner] 모든 페이즈 완료될 때까지 진행해',
  ]);
  const payload = parseJson(runGuard([
    '--mode', 'codex-phase-runner-stop', '--status-file', statusFile, '--json',
  ], {
    hook_event_name: 'Stop',
    transcript_path: transcriptPath,
    last_assistant_message: '현재 Phase 02 작업을 계속합니다.',
  }));

  assert.equal(payload.status, 'resume_required');
  assert.equal(payload.phaseRunnerTaskEvidence.detected, true);
  assert.equal(payload.hookOutput.decision, 'block');
  assert.match(payload.hookOutput.reason, /Resume it now/);
});

test('Codex Phase Runner Stop follows continuation turns in the same task', async () => {
  const dir = await makeTempRoot();
  const statusFile = await writeStatus(dir, [
    { doc: '01-baseline-v1.md', status: 'complete' },
    { doc: '02-package-v1.md', status: 'in_progress' },
  ], { runId: 'phase-runner-continuation' });
  const transcriptPath = await writeTranscript(dir, [
    '[$moonshot-phase-runner] 모든 페이즈 완료될 때까지 진행해',
    '이어서 진행해',
    '계속 진행해',
  ]);
  const payload = parseJson(runGuard([
    '--mode', 'codex-phase-runner-stop', '--status-file', statusFile, '--json',
  ], { transcript_path: transcriptPath }));

  assert.equal(payload.status, 'resume_required');
  assert.equal(payload.phaseRunnerTaskEvidence.source, 'transcript_continuation');
  assert.equal(payload.hookOutput.decision, 'block');
});

test('Codex Phase Runner Stop does not cross an unrelated task boundary', async () => {
  const dir = await makeTempRoot();
  const statusFile = await writeStatus(dir, [
    { doc: '01-baseline-v1.md', status: 'complete' },
    { doc: '02-package-v1.md', status: 'pending' },
  ], { runId: 'phase-runner-stale-continuation' });
  const transcriptPath = await writeTranscript(dir, [
    '[$moonshot-phase-runner] 모든 페이즈 완료될 때까지 진행해',
    '일반적인 단일 파일 점검만 해줘',
    '계속 진행해',
  ]);
  const payload = parseJson(runGuard([
    '--mode', 'codex-phase-runner-stop', '--status-file', statusFile, '--json',
  ], { transcript_path: transcriptPath }));

  assert.equal(payload.status, 'not_phase_runner_task');
  assert.equal(payload.phaseRunnerTaskEvidence.detected, false);
  assert.deepEqual(payload.hookOutput, {});
});

test('Claude Stop adapter allows non-final status reports while still reporting remaining work', async () => {
  const dir = await makeTempRoot();
  const statusFile = await writeStatus(dir, [
    { doc: '01-baseline-v1.md', status: 'complete' },
    { doc: '02-package-v1.md', status: 'in_progress' },
  ]);

  const payload = parseJson(runGuard([
    '--mode',
    'claude-stop',
    '--status-file',
    statusFile,
    '--json',
  ], {
    hook_event_name: 'Stop',
    last_assistant_message: '현재 Phase 02가 in_progress이고 전체 완료는 아닙니다.',
  }));

  assert.equal(payload.status, 'resume_required');
  assert.deepEqual(payload.hookOutput, {});
});

test('Codex turn-ended adapter writes a resume-required artifact for unfinished phase runs', async () => {
  const dir = await makeTempRoot();
  const statusFile = await writeStatus(dir, [
    { doc: '01-baseline-v1.md', status: 'complete' },
    { doc: '02-package-v1.md', status: 'pending' },
  ]);
  const resumeFile = path.join(dir, 'phase-final-guard-resume-required.json');

  const payload = parseJson(runGuard([
    '--mode',
    'codex-turn-ended',
    '--status-file',
    statusFile,
    '--resume-file',
    resumeFile,
    '--json',
  ], {
    type: 'agent-turn-complete',
  }));

  assert.equal(payload.status, 'resume_required');
  assert.equal(payload.resumeArtifact?.path, resumeFile);
  assert.equal(existsSync(resumeFile), true);
  const artifact = JSON.parse(await readFile(resumeFile, 'utf8'));
  assert.equal(artifact.status, 'resume_required');
  assert.equal(artifact.remainingPhases[0].doc, '02-package-v1.md');
});

test('final guard treats all-complete phase projection without completion authority as blocked', async () => {
  const dir = await makeTempRoot();
  const statusFile = await writeStatus(dir, [
    { doc: '01-baseline-v1.md', status: 'complete' },
    { doc: '02-package-v1.md', status: 'complete' },
  ]);

  const payload = parseJson(runGuard([
    '--mode',
    'claude-stop',
    '--status-file',
    statusFile,
    '--json',
  ], {
    hook_event_name: 'Stop',
    last_assistant_message: '전체 작업 완료했습니다.',
  }));

  assert.equal(payload.status, 'completion_authority_missing');
  assert.equal(payload.hookOutput.decision, 'block');
  assert.match(payload.hookOutput.reason, /accepted completion decision/);
});

test('final guard reports latest spec-test obligation blocker when all phases project complete', async () => {
  const dir = await makeTempRoot();
  const dbPath = path.join(dir, 'runtime-state.sqlite');
  const statusFile = await writeStatus(dir, [
    { doc: '01-contract-v1.md', status: 'complete' },
    { doc: '02-validator-v1.md', status: 'complete' },
  ], {
    runId: 'run-spec-obligation-guard',
    goalId: 'goal-spec-obligation-guard',
  });
  assert.equal(runRuntimeState(['init', '--json'], dbPath).status, 0);
  assert.equal(runRuntimeState([
    'record-event',
    '--run-id',
    'run-spec-obligation-guard',
    '--goal-id',
    'goal-spec-obligation-guard',
    '--event-type',
    'verification.evidence',
    '--severity',
    'blocking',
    '--payload-json',
    JSON.stringify({
      fresh: true,
      requiredChecksPassed: false,
      taskEvidenceBlockers: [
        { code: 'spec_test_obligation_missing', reason: 'REQ-002 has no specTestObligations row' },
      ],
    }),
    '--json',
  ], dbPath).status, 0);

  const payload = parseJson(runGuard([
    '--mode',
    'claude-stop',
    '--status-file',
    statusFile,
    '--db',
    dbPath,
    '--json',
  ], {
    hook_event_name: 'Stop',
    last_assistant_message: '전체 작업 완료했습니다.',
  }));

  assert.equal(payload.status, 'completion_authority_missing');
  assert.equal(payload.hookOutput.decision, 'block');
  assert.match(payload.hookOutput.reason, /spec_test_obligation_missing/);
  assert.match(payload.hookOutput.reason, /REQ-002/);
});
