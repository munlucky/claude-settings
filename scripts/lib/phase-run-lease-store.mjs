import crypto from 'node:crypto';
import path from 'node:path';

import { runtimeStateRelativePath } from './runtime-state-root.mjs';

const WORKFLOW_LOG_DIR = process.env.WORKFLOW_ENFORCEMENT_LOG_DIR || runtimeStateRelativePath('logs', 'workflow-enforcement');
const DEFAULT_STATUS_FILE = path.resolve(process.cwd(), '.claude/docs/phase-status.yaml');
const ACTIVE_RUN_BASENAME = 'active-phase-run.json';
const CURRENT_RUN_BASENAME = 'current-run.json';

function resolveStatusFile(statusFile) {
  return statusFile ? path.resolve(statusFile) : DEFAULT_STATUS_FILE;
}

function statusFileHash(statusFile) {
  return crypto.createHash('sha1').update(resolveStatusFile(statusFile)).digest('hex').slice(0, 12);
}

export function resolveLeaseFiles(statusFile) {
  const resolvedStatusFile = resolveStatusFile(statusFile);
  const defaultLeaseFiles = {
    activeRunFile: path.join(WORKFLOW_LOG_DIR, ACTIVE_RUN_BASENAME),
    currentRunFile: path.join(WORKFLOW_LOG_DIR, CURRENT_RUN_BASENAME),
    mirrorGlobalCurrentRun: true,
  };

  if (resolvedStatusFile === DEFAULT_STATUS_FILE) {
    return defaultLeaseFiles;
  }

  const suffix = statusFileHash(resolvedStatusFile);
  return {
    activeRunFile: path.join(WORKFLOW_LOG_DIR, `active-phase-run-${suffix}.json`),
    currentRunFile: path.join(WORKFLOW_LOG_DIR, `current-run-${suffix}.json`),
    mirrorGlobalCurrentRun: false,
  };
}
