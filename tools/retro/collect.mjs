import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  normalizeFailureClasses,
  normalizeReviewFindings,
  normalizeScorePayload,
  normalizeStatus,
  readJsonIfExists,
  validateDate,
} from './retro-normalize.mjs';
import { defaultOutboxRoot, writeCollectRecord } from './retro-store.mjs';

const evidenceFileCandidates = {
  requirements: ['requirements.md', 'REQUIREMENTS.md'],
  design: ['design.md', 'DESIGN.md'],
  plan: ['plan.md', 'PLAN.md'],
  progress: ['progress.md', 'PROGRESS.md'],
  findings: ['findings.md', 'FINDINGS.md'],
  verify: ['artifacts/verify.json', 'verify.json'],
  score: ['artifacts/score.json', 'score.json'],
};

function firstExisting(root, candidates) {
  return candidates.map((candidate) => path.join(root, candidate)).find((candidate) => existsSync(candidate));
}

function portableRelative(root, filePath) {
  return path.relative(process.cwd(), filePath || root).replaceAll(path.sep, '/');
}

export async function collectRetroRecord({
  projectId,
  taskId,
  taskRoot,
  date,
  out,
  replace = false,
}) {
  if (!projectId) throw new Error('--project is required');
  if (!taskId) throw new Error('--task-id is required');
  if (!taskRoot) throw new Error('--task-root is required');
  validateDate(date);

  const root = path.resolve(taskRoot);
  const evidence = {};
  for (const [key, candidates] of Object.entries(evidenceFileCandidates)) {
    const found = firstExisting(root, candidates);
    if (found) evidence[key] = portableRelative(process.cwd(), found);
  }
  if (!evidence.verify || !evidence.score) {
    throw new Error('retro collect requires verify.json and score.json evidence');
  }

  const verify = await readJsonIfExists(path.resolve(evidence.verify));
  const scorePayload = await readJsonIfExists(path.resolve(evidence.score));
  const score = normalizeScorePayload(scorePayload || {});
  const status = normalizeStatus(score.status === 'UNKNOWN' ? verify?.status : score.status);
  const failureClasses = normalizeFailureClasses(verify || {}, scorePayload || {});
  const reviewFindings = normalizeReviewFindings(verify || {});
  const record = {
    schemaVersion: 'retro.collect.v1',
    projectId,
    taskId,
    date,
    sourceRepo: '',
    sourceBranch: '',
    commitSha: '',
    status,
    score,
    execution: {
      startedAt: '',
      closedAt: '',
      replanCount: Number(verify?.replanCount || scorePayload?.replanCount || 0),
      verifyCount: Number(verify?.verifyCount || 1),
      reviewCount: Number(verify?.reviewCount || 0),
    },
    failureClasses,
    reviewFindings,
    changedFiles: {
      count: Number(verify?.changedFiles?.count || 0),
      paths: verify?.changedFiles?.paths || [],
    },
    evidence,
    candidateLessons: (verify?.candidateLessons || []).map((lesson) => ({
      type: String(lesson.type || 'observation'),
      summary: String(lesson.summary || ''),
      confidence: ['low', 'medium', 'high'].includes(lesson.confidence) ? lesson.confidence : 'medium',
    })).filter((lesson) => lesson.summary),
    redactions: {
      rawLogsCopied: false,
      secretsDetected: false,
    },
    promotionAuthority: false,
  };

  const outRoot = out || defaultOutboxRoot({ date });
  const pathWritten = await writeCollectRecord({ record, outRoot, replace });
  return { record, path: pathWritten };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.error('Use tools/retro/retro-cli.mjs collect ...');
  process.exitCode = 1;
}
