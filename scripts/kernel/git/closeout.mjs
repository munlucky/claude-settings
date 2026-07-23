import crypto from 'node:crypto';
import { runGit } from '../../lib/git-safe.mjs';
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

  const { selectedPaths, excludedPaths } = filterStagingSelection(changedFiles);

  if (selectedPaths.length > 0) {
    const addRes = runGit(repoRoot, ['add', '--', ...selectedPaths]);
    if (addRes.status !== 0) {
      throw new KernelGitCloseoutError('GIT_ADD_FAILED', `Git add failed: ${addRes.stderr}`);
    }
  }

  const commitMsg = `feat(kernel): update ${projectId} implementation\n\n- Completed phase execution for ${runId}\n- Knowledge commit ref: ${knowledgeCommitReceipt.digest || 'none'}`;
  const commitRes = runGit(repoRoot, ['commit', '-m', commitMsg]);

  const revRes = runGit(repoRoot, ['rev-parse', 'HEAD']);
  const commitSha = String(revRes.stdout || '').trim();

  let pushStatus = 'skipped';
  let parity = 'not_requested';
  let remoteHeadSha = '';

  if (gitCloseoutRequest.mode === 'commit_and_push') {
    const pushRes = runGit(repoRoot, ['push', 'origin', 'HEAD']);
    if (pushRes.status === 0) {
      pushStatus = 'completed';
      const parityCheck = verifyRemoteParity(repoRoot);
      parity = parityCheck.parity;
      remoteHeadSha = parityCheck.remoteHeadSha;
    } else {
      pushStatus = 'failed';
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
    pushStatus,
    remoteHeadSha,
    parity,
    approvalReceipt: gitCloseoutRequest.approvalReceipt,
    status: pushStatus === 'failed' ? 'partial' : 'completed',
  };

  const digest = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  payload.digest = digest;

  return payload;
}
