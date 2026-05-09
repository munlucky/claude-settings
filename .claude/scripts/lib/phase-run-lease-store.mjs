import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { nowIsoSeconds } from './clock.mjs';

const WORKFLOW_LOG_DIR = process.env.WORKFLOW_ENFORCEMENT_LOG_DIR || '.claude/logs/workflow-enforcement';
const DEFAULT_STATUS_FILE = path.resolve(process.cwd(), '.claude/docs/phase-status.yaml');
const ACTIVE_RUN_BASENAME = 'active-phase-run.json';
const CURRENT_RUN_BASENAME = 'current-run.json';

export function resolveStatusFile(statusFile) {
  if (!statusFile) {
    return DEFAULT_STATUS_FILE;
  }
  return path.resolve(statusFile);
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

export function utcTimestamp() {
  return nowIsoSeconds();
}

export function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function mirrorToCurrentRun(statusFile, leasePayload) {
  const leaseFiles = resolveLeaseFiles(statusFile);
  const existing = readJson(leaseFiles.currentRunFile) || {};
  const identityFields = {
    runLeaseId: leasePayload.runLeaseId || existing.runLeaseId || '',
    status: leasePayload.status || existing.status || '',
    completionStatus: leasePayload.completionStatus || existing.completionStatus || '',
    executionBoundary: leasePayload.executionBoundary || existing.executionBoundary || '',
    planDir: leasePayload.planDir || existing.planDir || '',
    statusFile: leasePayload.statusFile || existing.statusFile || statusFile || '',
    executionRoot: leasePayload.executionRoot || existing.executionRoot || '',
    masterPlan: leasePayload.masterPlan || existing.masterPlan || '',
    activeExecutionStatus: leasePayload.completionStatus || leasePayload.status || existing.activeExecutionStatus || '',
    activeCurrentStage: leasePayload.currentStage || existing.activeCurrentStage || '',
    activePhaseNumber: leasePayload.phase?.number ?? existing.activePhaseNumber ?? '',
    activePhaseTitle: leasePayload.phase?.title ?? existing.activePhaseTitle ?? '',
    activeActionablePhasesRemaining: leasePayload.actionablePhasesRemaining ?? existing.activeActionablePhasesRemaining ?? '',
  };
  const next = {
    ...existing,
    ...identityFields,
    updatedAt: utcTimestamp(),
    unavailableCapabilities: leasePayload.unavailableCapabilities || existing.unavailableCapabilities || [],
    phaseRunLease: leasePayload,
  };
  writeJson(leaseFiles.currentRunFile, next);

  if (!leaseFiles.mirrorGlobalCurrentRun) {
    return;
  }

  const globalCurrentRunFile = path.join(WORKFLOW_LOG_DIR, CURRENT_RUN_BASENAME);
  if (globalCurrentRunFile === leaseFiles.currentRunFile) {
    return;
  }
  writeJson(globalCurrentRunFile, next);
}

export function readActiveLease(statusFile) {
  return readJson(resolveLeaseFiles(statusFile).activeRunFile);
}

export function writeActiveLease(statusFile, payload) {
  writeJson(resolveLeaseFiles(statusFile).activeRunFile, payload);
  mirrorToCurrentRun(statusFile, payload);
}
