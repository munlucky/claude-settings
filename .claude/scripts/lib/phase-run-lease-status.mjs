import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { readJson, resolveLeaseFiles } from './phase-run-lease-store.mjs';
import { evaluateWorkerIdentityLiveness } from './phase-liveness-checker.mjs';
import { workerLivenessCanPromoteCompletion } from './phase-run-lease-policy.mjs';

export function readStatusBlocks(statusFile) {
  if (!statusFile || !fs.existsSync(statusFile)) {
    return [];
  }

  const lines = fs.readFileSync(statusFile, 'utf8').split(/\r?\n/);
  const blocks = [];
  let current = null;

  for (const rawLine of lines) {
    if (/^\s*-\s+number:\s*/.test(rawLine)) {
      if (current) {
        blocks.push(current);
      }
      const match = rawLine.match(/number:\s*([0-9]+)/);
      current = {
        number: match ? match[1] : null,
        status: '',
        planConfirmed: '',
      };
      continue;
    }

    if (!current) {
      continue;
    }

    const stripped = rawLine.trim();
    if (stripped.startsWith('status:')) {
      current.status = stripped.split(':', 2)[1].trim();
    } else if (stripped.startsWith('planConfirmed:')) {
      current.planConfirmed = stripped.split(':', 2)[1].trim().toLowerCase();
    }
  }

  if (current) {
    blocks.push(current);
  }

  return blocks;
}

export function countActionablePhases(statusFile) {
  return readStatusBlocks(statusFile).filter((block) => {
    if (block.planConfirmed === 'false') {
      return false;
    }
    return block.status === 'pending' || block.status === 'in_progress' || block.status === 'failed';
  }).length;
}

function repoRelative(repoRoot, filePath) {
  return path.relative(repoRoot, filePath).replace(/\\/g, '/') || '.';
}

function resolveFromRoot(repoRoot, filePath) {
  if (!filePath) {
    return '';
  }
  return path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(repoRoot, filePath);
}

function sha256RawBytes(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function fileCursor(repoRoot, filePath, { hash = true } = {}) {
  const resolved = resolveFromRoot(repoRoot, filePath);
  if (!resolved) {
    return { path: '', exists: false };
  }
  if (!fs.existsSync(resolved)) {
    return { path: repoRelative(repoRoot, resolved), exists: false };
  }
  const stat = fs.statSync(resolved);
  return {
    path: repoRelative(repoRoot, resolved),
    exists: true,
    sizeBytes: stat.size,
    mtimeMs: Math.trunc(stat.mtimeMs),
    hash: hash ? sha256RawBytes(resolved) : '',
  };
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (!value || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
}

function hashCursor(value) {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex');
}

function artifactEntries(currentIndex = {}) {
  const artifacts = currentIndex && typeof currentIndex === 'object' ? currentIndex.artifacts : null;
  if (!artifacts || typeof artifacts !== 'object') {
    return [];
  }
  return Object.entries(artifacts)
    .map(([key, value]) => ({ key, ...(value && typeof value === 'object' ? value : {}) }))
    .filter((entry) => String(entry.kind || entry.key || '').startsWith('canonical-verdict'))
    .sort((left, right) => String(left.kind || left.key).localeCompare(String(right.kind || right.key)));
}

export function buildCompositeMonitorCursor({
  repoRoot = process.cwd(),
  statusFile = '.claude/docs/phase-status.yaml',
  workflowDir = '.claude/logs/workflow-enforcement',
} = {}) {
  const root = path.resolve(repoRoot);
  const statusPath = resolveFromRoot(root, statusFile);
  const workflowRoot = resolveFromRoot(root, workflowDir);
  const currentIndexPath = path.join(workflowRoot, 'current-artifacts.json');
  const currentIndex = readJson(currentIndexPath) || {};
  const manifestPath = resolveFromRoot(root, currentIndex.manifestPath || '');
  const leaseFiles = resolveLeaseFiles(statusPath);
  const activeLease = readJson(leaseFiles.activeRunFile) || {};
  const workflowLogs = ['current-run.json', 'active-phase-run.json', 'latest-dispatch.json']
    .map((basename) => fileCursor(root, path.join(workflowRoot, basename)));
  const activeVerdicts = artifactEntries(currentIndex).map((entry) => ({
    kind: entry.kind || entry.key,
    commitToken: entry.commitToken || currentIndex.commitToken || '',
    manifestHash: entry.hash || '',
    file: fileCursor(root, entry.path || entry.relativePath || ''),
  }));
  const cursor = {
    schemaVersion: 1,
    statusFile: fileCursor(root, statusPath),
    currentIndex: {
      commitToken: currentIndex.commitToken || '',
      manifestHash: currentIndex.manifestHash || '',
      file: fileCursor(root, currentIndexPath),
    },
    manifest: fileCursor(root, manifestPath),
    lease: {
      runLeaseId: activeLease.runLeaseId || '',
      status: activeLease.status || '',
      completionStatus: activeLease.completionStatus || '',
      currentStage: activeLease.currentStage || '',
      lastHeartbeatAt: activeLease.lastHeartbeatAt || '',
      file: fileCursor(root, leaseFiles.activeRunFile),
    },
    workflowLogs,
    activeVerdicts,
  };
  return {
    ...cursor,
    fingerprint: hashCursor(cursor),
  };
}

export function classifyLeaseProgressEvidence({
  manifest,
  heartbeat,
  observedProcess,
  artifactProgress = false,
} = {}) {
  const liveness = evaluateWorkerIdentityLiveness({
    manifest,
    heartbeat,
    observedProcess,
    artifactProgress,
  });
  return {
    ...liveness,
    canPromoteCompletion: workerLivenessCanPromoteCompletion(liveness.classification),
  };
}

function quoteStatusValue(value) {
  return `"${String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n')}"`;
}

function hasOpenDoubleQuotedScalar(line) {
  let escaped = false;
  let quoteCount = 0;
  for (const char of String(line || '')) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      quoteCount += 1;
    }
  }
  return quoteCount % 2 === 1;
}

function upsertRootKey(lines, key, value) {
  const prefix = `${key}:`;
  const rendered = `${prefix} ${value}`;
  const index = lines.findIndex((line) => line.startsWith(prefix));
  if (index >= 0) {
    let deleteCount = 1;
    let openQuotedScalar = hasOpenDoubleQuotedScalar(lines[index]);
    while (openQuotedScalar && index + deleteCount < lines.length) {
      openQuotedScalar = !hasOpenDoubleQuotedScalar(lines[index + deleteCount]);
      deleteCount += 1;
    }
    lines.splice(index, deleteCount, rendered);
    return lines;
  }
  const insertAt = lines.findIndex((line) => line.startsWith('phases:'));
  if (insertAt >= 0) {
    lines.splice(insertAt, 0, rendered);
    return lines;
  }
  lines.push(rendered);
  return lines;
}

export function updateStatusLease(statusFile, fields) {
  if (!statusFile || !fs.existsSync(statusFile)) {
    return;
  }

  const lines = fs.readFileSync(statusFile, 'utf8').split(/\r?\n/).filter((_, index, array) => !(index === array.length - 1 && array[index] === ''));
  const nextLines = [...lines];

  const mapping = {
    activeRunLeaseId: quoteStatusValue,
    activeExecutionBoundary: quoteStatusValue,
    activeExecutionAttachedAt: quoteStatusValue,
    activeExecutionHeartbeatAt: quoteStatusValue,
    activeExecutionStatus: quoteStatusValue,
    activeActionablePhasesRemaining: (value) => String(value),
    activeCurrentStage: quoteStatusValue,
    activePhaseNumber: (value) => value === '' ? 'null' : String(value),
    activePhaseTitle: (value) => value ? quoteStatusValue(value) : 'null',
    lastRunLeaseId: (value) => value ? quoteStatusValue(value) : 'null',
    lastExecutionBoundary: (value) => value ? quoteStatusValue(value) : 'null',
    lastExecutionAttachedAt: (value) => value ? quoteStatusValue(value) : 'null',
    lastExecutionHeartbeatAt: (value) => value ? quoteStatusValue(value) : 'null',
    lastExecutionStatus: (value) => value ? quoteStatusValue(value) : 'null',
    lastReturnBoundary: (value) => value ? quoteStatusValue(value) : 'null',
    lastStopReasonCode: (value) => value ? quoteStatusValue(value) : 'null',
    lastStopReasonDetail: (value) => value ? quoteStatusValue(value) : 'null',
  };

  for (const [key, formatter] of Object.entries(mapping)) {
    if (fields[key] === undefined) {
      continue;
    }
    if (fields[key] === null) {
      const prefix = `${key}:`;
      const index = nextLines.findIndex((line) => line.startsWith(prefix));
      if (index >= 0) {
        nextLines.splice(index, 1);
      }
      continue;
    }
    upsertRootKey(nextLines, key, formatter(fields[key]));
  }

  fs.writeFileSync(statusFile, `${nextLines.join('\n')}\n`, 'utf8');
}
