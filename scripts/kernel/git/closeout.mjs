import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { rm } from 'node:fs/promises';
import { runGit, gitCurrentBranch } from '../../lib/git-safe.mjs';
import { filterStagingSelection } from './staging-policy.mjs';
import { verifyRemoteParity } from './remote-parity.mjs';

export class KernelGitCloseoutError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'KernelGitCloseoutError';
    this.code = code;
    this.details = details;
  }
}

export async function executeKernelGitCloseout({
  runId,
  projectId,
  repoRoot = process.cwd(),
  gitCloseoutRequest = null,
  knowledgeCommitReceipt = null,
  changedFiles = [],
}) {
  // If not explicitly requested, return skipped receipt
  if (!gitCloseoutRequest || !gitCloseoutRequest.requested) {
    const skippedReceipt = {
      schemaVersion: 1,
      runId,
      projectId,
      requestedMode: 'none',
      status: 'skipped',
      digest: crypto.createHash('sha256').update(`${runId}:skipped`).digest('hex'),
    };
    return skippedReceipt;
  }

  if (!gitCloseoutRequest.approvalReceipt) {
    throw new KernelGitCloseoutError('APPROVAL_REQUIRED', 'Explicit Git closeout requires valid approvalReceipt');
  }

  if (!knowledgeCommitReceipt) {
    throw new KernelGitCloseoutError('KNOWLEDGE_RECEIPT_REQUIRED', 'Git closeout follows knowledge closeout receipt');
  }

  const currentBranch = gitCurrentBranch(repoRoot);
  if (!currentBranch) {
    throw new KernelGitCloseoutError('DETACHED_HEAD', 'Git closeout requires an active branch, found detached HEAD');
  }

  const { selectedPaths, excludedPaths } = filterStagingSelection(changedFiles);

  // Empty selection check: do not make empty commits
  if (selectedPaths.length === 0 && !gitCloseoutRequest.existingCommitSha) {
    return {
      schemaVersion: 1,
      runId,
      projectId,
      requestedMode: gitCloseoutRequest.mode || 'soft',
      status: 'skipped',
      reason: 'no_selected_changes',
      digest: crypto.createHash('sha256').update(`${runId}:no_selected_changes`).digest('hex'),
    };
  }

  const beforeHeadRes = runGit(repoRoot, ['rev-parse', 'HEAD']);
  const beforeHeadSha = beforeHeadRes.status === 0 ? String(beforeHeadRes.stdout || '').trim() : '';

  let commitSha = gitCloseoutRequest.existingCommitSha || beforeHeadSha;

  // If retry with existing commitSha, skip creating new commit
  if (!gitCloseoutRequest.existingCommitSha) {
    const tempIndexFile = path.join(os.tmpdir(), `kernel-git-index-${runId}-${Date.now()}-${Math.random().toString(36).slice(2)}.idx`);
    const tempGitEnv = { ...process.env, GIT_INDEX_FILE: tempIndexFile };

    try {
      if (beforeHeadSha) {
        runGit(repoRoot, ['read-tree', 'HEAD'], { env: tempGitEnv });
      }

      const addRes = runGit(repoRoot, ['add', '--', ...selectedPaths], { env: tempGitEnv });
      if (addRes.status !== 0) {
        throw new KernelGitCloseoutError('GIT_ADD_FAILED', `Git add failed: ${addRes.stderr}`);
      }

      const writeTreeRes = runGit(repoRoot, ['write-tree'], { env: tempGitEnv });
      if (writeTreeRes.status !== 0) {
        throw new KernelGitCloseoutError('GIT_WRITE_TREE_FAILED', `Git write-tree failed: ${writeTreeRes.stderr}`);
      }
      const treeSha = String(writeTreeRes.stdout || '').trim();

      const commitMsg = `feat(kernel): update ${projectId} implementation\n\n- Completed phase execution for ${runId}\n- Knowledge commit ref: ${knowledgeCommitReceipt.digest || 'none'}`;
      const commitArgs = ['commit-tree', treeSha, '-m', commitMsg];
      if (beforeHeadSha) {
        commitArgs.push('-p', beforeHeadSha);
      }

      const commitTreeRes = runGit(repoRoot, commitArgs, { env: tempGitEnv });
      if (commitTreeRes.status !== 0) {
        throw new KernelGitCloseoutError('GIT_COMMIT_FAILED', `Git commit-tree failed: ${commitTreeRes.stderr}`);
      }
      commitSha = String(commitTreeRes.stdout || '').trim();

      if (!commitSha || commitSha === beforeHeadSha) {
        throw new KernelGitCloseoutError('GIT_COMMIT_NOT_CREATED', 'Git commit was not created (HEAD did not advance)');
      }

      // Branch ref CAS update (with beforeHeadSha)
      const updateRefArgs = ['update-ref', `refs/heads/${currentBranch}`, commitSha];
      if (beforeHeadSha) {
        updateRefArgs.push(beforeHeadSha);
      }
      const updateRefRes = runGit(repoRoot, updateRefArgs);
      if (updateRefRes.status !== 0) {
        throw new KernelGitCloseoutError('GIT_REF_CONFLICT', `Git update-ref CAS conflict on branch ${currentBranch}: ${updateRefRes.stderr}`);
      }
    } finally {
      try { await rm(tempIndexFile, { force: true }); } catch {}
    }
  }

  let pushStatus = 'skipped';
  let parity = 'not_requested';
  let remoteHeadSha = '';

  if (gitCloseoutRequest.mode === 'commit_and_push') {
    const pushRes = runGit(repoRoot, ['push', 'origin', `HEAD:refs/heads/${currentBranch}`]);
    if (pushRes.status === 0) {
      pushStatus = 'completed';
      const parityCheck = verifyRemoteParity(repoRoot, { branch: currentBranch, remote: 'origin' });
      parity = parityCheck.parity;
      remoteHeadSha = parityCheck.remoteHeadSha;

      if (parityCheck.parity !== 'matched') {
        throw new KernelGitCloseoutError('REMOTE_PARITY_MISMATCH', `Remote parity mismatch on branch ${currentBranch}: local ${commitSha} != remote ${remoteHeadSha}`);
      }
    } else {
      pushStatus = 'failed';
      throw new KernelGitCloseoutError('GIT_PUSH_FAILED', `Git push failed: ${pushRes.stderr}`);
    }
  }

  const payload = {
    schemaVersion: 1,
    runId,
    projectId,
    requestedMode: gitCloseoutRequest.mode,
    knowledgeCommitReceiptRef: knowledgeCommitReceipt.digest || '',
    selectedPaths,
    excludedPaths,
    commitSha,
    branch: currentBranch,
    pushStatus,
    remoteHeadSha,
    parity,
    approvalReceipt: gitCloseoutRequest.approvalReceipt,
    status: 'completed',
  };

  const digest = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  payload.digest = digest;

  return payload;
}
