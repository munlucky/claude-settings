import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { buildKernelCommitMessage, commitMessageConstants, deriveKernelCommitSubject } from '../scripts/kernel/git/commit-message.mjs';
import { executeKernelGitCloseout } from '../scripts/kernel/git/closeout.mjs';
import { runGit } from '../scripts/lib/git-safe.mjs';

test('Kernel commit messages preserve the requested subject/body and add Korean task context', () => {
  const message = buildKernelCommitMessage({
    message: 'fix: informative closeout\n\n기존 요청 본문을 보존한다.',
    run: {
      runId: 'run-message-1',
      projectId: 'project-message-1',
      objective: '커밋 메시지의 작업 문맥을 강화한다',
      planRevision: 4,
      mutationRevision: 2,
      proofTier: 'T2',
      evidenceTier: 'E1',
      taskContract: {
        acceptance: [{ id: 'AC-1', statement: '작업 목표와 검증 결과를 확인할 수 있다.' }],
      },
    },
    completion: {
      decision: 'accepted',
      evidenceDigest: `sha256:${'a'.repeat(64)}`,
      decisionJson: {
        verifications: [{ obligationId: 'unit-test', status: 'passed', acceptanceCoverage: ['AC-1'] }],
      },
    },
    projectId: 'project-message-1',
    selectedPaths: ['scripts\\kernel\\git\\commit-message.mjs'],
    excludedPaths: [{ path: '.env.local' }],
    knowledgeCommitReceipt: { status: 'committed', digest: 'knowledge-1' },
    closeoutMode: 'commit_and_push',
  });

  assert.equal(message.startsWith('fix: informative closeout\n'), true);
  assert.match(message, /요청 메시지:/u);
  assert.match(message, /기존 요청 본문을 보존한다\./u);
  assert.match(message, /Kernel 작업:/u);
  assert.match(message, /작업 목표: 커밋 메시지의 작업 문맥을 강화한다/u);
  assert.match(message, /완료 판정: 승인됨/u);
  assert.match(message, /지식 마감: 커밋됨/u);
  assert.match(message, /Git 마감: 커밋 및 푸시/u);
  assert.match(message, /인수조건 충족: AC-1/u);
  assert.match(message, /검증: unit-test=통과/u);
  assert.match(message, /변경 경로 \(1\):\n- scripts\/kernel\/git\/commit-message\.mjs/u);
  assert.match(message, /제외 경로 \(1\)/u);
});

test('Kernel commit message generation derives a Korean fallback and stays bounded', () => {
  const subject = deriveKernelCommitSubject({ objective: '자동 제목을 생성한다' });
  assert.equal(subject, 'feat(kernel): 자동 제목을 생성한다');

  const message = buildKernelCommitMessage({
    run: {
      runId: 'run-bounded',
      projectId: 'project-bounded',
      objective: '긴 작업 목표 '.repeat(400),
      taskContract: {
        acceptance: Array.from({ length: 100 }, (_, index) => ({
          id: `AC-${index + 1}`,
          statement: `긴 인수조건 설명 ${index + 1} `.repeat(40),
        })),
      },
    },
    selectedPaths: Array.from({ length: 100 }, (_, index) => `src/generated/change-${index + 1}.mjs`),
  });

  assert.match(message, /^feat\(kernel\): 긴 작업 목표/u);
  assert.ok(message.length <= commitMessageConstants.maxCommitMessageLength);
  assert.doesNotMatch(message, /\u0000/u);
  assert.match(message, /추가 작업 정보는 생략됨/u);
});

test('Kernel Git closeout writes the task-aware message into the created commit', async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), 'kernel-commit-message-repo-'));
  const runId = 'run-closeout-message';
  const receipts = [];
  try {
    runGit(repoRoot, ['init', '-b', 'main']);
    runGit(repoRoot, ['config', 'user.name', 'Kernel Test']);
    runGit(repoRoot, ['config', 'user.email', 'kernel-test@example.invalid']);
    await writeFile(path.join(repoRoot, 'initial.txt'), 'initial\n', 'utf8');
    runGit(repoRoot, ['add', '--all']);
    runGit(repoRoot, ['commit', '-m', 'fixture']);
    await writeFile(path.join(repoRoot, 'change.txt'), 'kernel change\n', 'utf8');

    const stateStore = {
      getRun: () => ({
        runId,
        projectId: 'project-closeout-message',
        objective: '커밋 closeout에 작업 정보를 기록한다',
        planRevision: 2,
        mutationRevision: 1,
        taskContract: { acceptance: [{ id: 'AC-1', statement: '생성된 커밋에서 작업 문맥을 확인할 수 있다.' }] },
      }),
      getCompletionDecision: () => ({
        decision: 'accepted',
        decisionJson: { verifications: [{ obligationId: 'message-test', status: 'passed', acceptanceCoverage: ['AC-1'] }] },
      }),
      recordGitCloseoutReceipt: (_runId, receipt) => receipts.push(receipt),
    };

    const result = await executeKernelGitCloseout({
      runId,
      projectId: 'project-closeout-message',
      stateStore,
      repoRoot,
      gitCloseoutRequest: {
        requested: true,
        mode: 'commit',
        approvalReceipt: 'approval://test/1',
        message: 'fix: 작업 정보가 있는 closeout',
      },
      knowledgeCommitReceipt: { status: 'committed', digest: 'knowledge-closeout-1' },
      changedFiles: ['change.txt'],
    });

    const commitBody = String(runGit(repoRoot, ['log', '-1', '--format=%B']).stdout || '').trim();
    assert.equal(result.status, 'completed');
    assert.equal(result.commitSubject, 'fix: 작업 정보가 있는 closeout');
    assert.equal(commitBody, result.commitMessage.trim());
    assert.match(commitBody, /작업 목표: 커밋 closeout에 작업 정보를 기록한다/u);
    assert.match(commitBody, /인수조건 상세:/u);
    assert.match(commitBody, /검증: message-test=통과/u);
    assert.equal(receipts.at(-1).receiptJson.commitMessage, result.commitMessage);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test('Invariant S1: Commit message omits knowledge closeout line when knowledge is null or pending', () => {
  const message = buildKernelCommitMessage({
    run: {
      runId: 'run-no-kn',
      projectId: 'project-no-kn',
      objective: '지식 마감 없는 커밋 메시지',
    },
    knowledgeCommitReceipt: null,
    selectedPaths: ['index.mjs'],
  });
  assert.doesNotMatch(message, /지식 마감:/u);
});
