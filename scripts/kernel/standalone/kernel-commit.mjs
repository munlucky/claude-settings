#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { openKernelStateStore } from '../state-store.mjs';
import { commitProjectKnowledge } from '../knowledge/commit.mjs';
import { buildCodebaseIndex } from '../codebase/build-index.mjs';
import { extractCodebaseCandidates } from '../knowledge-ingestion/candidate-extract.mjs';
import { commitImportedProjectKnowledge } from '../knowledge-ingestion/import.mjs';
import { runGit, gitCurrentBranch } from '../../lib/git-safe.mjs';
import { gitTreeDigest } from '../../lib/candidate-identity.mjs';
import { parseCliArgs, printResult, readJson, resolveStandaloneProject, sha256, writeJsonAtomic } from './common.mjs';

const DENY_PATTERNS = [
  /^\.agents(?:\/|$)/i,
  /^\.mcp\.json$/i,
  /^\.claude\/memory\.json$/i,
  /^\.claude\/(?:memorygraph|cache\/memorygraph)(?:\/|$)/i,
  /^\.moon-relay(?:\/|$)/i,
  /^\.moonshot-relay(?:\/|$)/i,
  /(?:^|\/)runtime-state\.sqlite$/i,
  /(?:^|\/)\.moon-relay-kernel(?:\/|$)/i,
];

export function isDeniedStagingPath(relativePath) {
  const normalized = String(relativePath || '').replaceAll('\\', '/').replace(/^\.\//, '');
  return DENY_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function parseGitStatus(output = '') {
  return String(output).split(/\r?\n/).filter(Boolean).map((line) => {
    const status = line.slice(0, 2);
    let file = line.slice(3);
    if (file.includes(' -> ')) file = file.split(' -> ').pop();
    if ((file.startsWith('"') && file.endsWith('"')) || (file.startsWith("'") && file.endsWith("'"))) file = file.slice(1, -1);
    return { status, path: file.replaceAll('\\', '/') };
  });
}

export function selectStagingPaths(statusEntries = []) {
  const selected = [];
  const denied = [];
  for (const entry of statusEntries) {
    if (isDeniedStagingPath(entry.path)) denied.push({ ...entry, reason: 'deny_path' });
    else selected.push(entry.path);
  }
  return { selected: [...new Set(selected)], denied };
}

const runGitChecked = (repoRoot, args) => {
  const result = runGit(repoRoot, args, { maxBuffer: 8 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`git_failed: ${args.join(' ')}: ${String(result.stderr || result.error?.message || '').trim()}`);
  return result;
};

export async function kernelCommit({ cwd = process.cwd(), env = process.env, message = null, push = false, memory = false, memoryReview = false, approvalRef = null, runId = null } = {}) {
  const project = resolveStandaloneProject({ cwd, env });
  const statusResult = runGitChecked(project.projectRoot, ['status', '--porcelain=v1']);
  const { selected, denied } = selectStagingPaths(parseGitStatus(statusResult.stdout));
  if (!message && selected.length > 0) throw new Error('COMMIT_MESSAGE_REQUIRED');
  const stateStore = await openKernelStateStore({ runtimeHome: project.runtimeHome });
  try {
    const index = await buildCodebaseIndex({ projectRoot: project.projectRoot, projectId: project.projectId, codebaseRoot: project.codebaseRoot, runtimeHome: project.runtimeHome });
    let candidates = [];
    if (memory || memoryReview) {
      const map = await readJson(path.join(project.codebaseRoot, 'codebase-map.json'), { files: [] });
      candidates = extractCodebaseCandidates(map, { projectId: project.projectId, sourceDigest: index.manifest?.sourceTreeDigest });
    }
    if (memoryReview && !approvalRef) return { status: 'awaiting_review', projectId: project.projectId, staging: { selected, denied }, candidates, index };
    if (selected.length === 0) return { status: 'no_op', projectId: project.projectId, staging: { selected, denied }, index, candidates };
    runGitChecked(project.projectRoot, ['add', '--', ...selected]);
    const commitResult = runGitChecked(project.projectRoot, ['commit', '-m', message]);
    const commitHash = runGitChecked(project.projectRoot, ['rev-parse', 'HEAD']).stdout.trim();
    const receipt = { schemaVersion: 1, projectId: project.projectId, branch: gitCurrentBranch(project.projectRoot), commitHash, selectedPaths: selected, deniedPaths: denied, treeDigest: gitTreeDigest(project.projectRoot), knowledgeStatus: 'staged', closeoutStatus: 'partial', createdAt: new Date().toISOString() };
    if (memory && candidates.length > 0) {
      const sourceDigest = index.manifest?.sourceTreeDigest || sha256(commitHash);
      if (approvalRef) {
        const result = await commitImportedProjectKnowledge({ stateStore, projectId: project.projectId, expectedKnowledgeRevision: stateStore.getProjectKnowledgeRevision(project.projectId), candidates: candidates.map((candidate) => ({ ...candidate, selected: true })), sourceReceipt: { sourceType: 'git_commit', sourceIdentity: `git:${commitHash}`, sourceDigest, sourceSnapshotRef: `git:${commitHash}` }, userApprovalRef: approvalRef, receiptsRoot: project.receiptsRoot });
        receipt.knowledgeStatus = result.status;
        receipt.closeoutStatus = result.status === 'committed' || result.status === 'no_op' ? 'completed' : 'partial';
        receipt.knowledgeReceipt = result.receipt || null;
      } else {
        const snapshotPath = path.join(project.importsRoot, 'sources', `${sourceDigest.replace(/[^a-zA-Z0-9-]/g, '')}.json`);
        await writeJsonAtomic(snapshotPath, { schemaVersion: 1, kind: 'git_commit', projectId: project.projectId, sourceReceipt: { sourceType: 'git_commit', sourceIdentity: `git:${commitHash}`, sourceDigest, sourceSnapshotRef: `git:${commitHash}` }, candidates, createdAt: new Date().toISOString() });
        receipt.candidateSnapshot = path.relative(project.projectRuntimeRoot, snapshotPath).replaceAll('\\', '/');
      }
    }
    const receiptPath = path.join(project.receiptsRoot, 'commits', `${commitHash}.json`);
    await writeJsonAtomic(receiptPath, receipt);
    if (push) {
      runGitChecked(project.projectRoot, ['push']);
      const remoteHead = runGitChecked(project.projectRoot, ['ls-remote', 'origin', `refs/heads/${receipt.branch}`]).stdout.trim().split(/\s+/)[0] || null;
      receipt.pushStatus = remoteHead === commitHash ? 'completed' : 'parity_failed';
      receipt.remoteHead = remoteHead;
      if (receipt.pushStatus !== 'completed') throw new Error('REMOTE_PARITY_FAILED');
      await writeJsonAtomic(receiptPath, receipt);
    }
    return { status: 'committed', projectId: project.projectId, commitHash, receipt, staging: { selected, denied }, index };
  } finally { await stateStore.close(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = parseCliArgs(process.argv.slice(2));
  kernelCommit({ message: args.message || null, push: args.push === true, memory: args.memory === true, memoryReview: args.memoryReview === true, approvalRef: args.approvalRef || null, runId: args.runId || null }).then((result) => printResult(result, { json: args.json })).catch((error) => { printResult({ status: 'error', errorCode: error.code || error.message }, { json: true }); process.exitCode = 1; });
}
