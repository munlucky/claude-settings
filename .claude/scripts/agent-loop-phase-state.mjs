#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evaluateDemoFirstGate } from './demo-first-gate-lib.mjs';
import { isRelevantVerificationVerdict } from './verification-verdict-state.mjs';
import { evaluatePlanConformance } from './verify-plan-conformance.mjs';

const WORKFLOW_LOG_DIR = process.env.WORKFLOW_ENFORCEMENT_LOG_DIR || '.claude/logs/workflow-enforcement';
const CURRENT_RUN_FILE = path.join(WORKFLOW_LOG_DIR, 'current-run.json');
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_STATE_PATH = path.join(SCRIPT_DIR, 'runtime-state.mjs');

function writeFileAtomic(filePath, content) {
  const directory = path.dirname(filePath);
  const tempPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );

  fs.writeFileSync(tempPath, content, 'utf8');
  fs.renameSync(tempPath, filePath);
}

function writeStdoutLine(value = '') {
  process.stdout.write(`${String(value)}\n`);
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function shadowRuntimePhaseUpdate(config) {
  const result = spawnSync(process.execPath, [
    RUNTIME_STATE_PATH,
    'update-phase',
    config.statusFile,
    config.phaseNum,
    config.newStatus,
    config.timestamp,
    config.lastOutcome || '',
    config.incrementAttempt || 'false',
    config.activePhaseDoc || '',
    config.sprintContractPath || '',
    config.qaReportPath || '',
    config.handoffPath || '',
    config.scorecardPath || '',
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_NO_WARNINGS: process.env.NODE_NO_WARNINGS || '1',
    },
  });
  return !result.error && (result.status ?? 0) === 0;
}

function parseIsoTimestamp(value) {
  if (!value) {
    return Number.NaN;
  }

  const normalized = value.trim().replace(/^"|"$/g, '').replace(/Z$/, '+00:00');
  const parsed = Date.parse(normalized);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

function readStatusBlocks(statusFile) {
  if (!fs.existsSync(statusFile)) {
    return [];
  }

  const lines = fs.readFileSync(statusFile, 'utf8').split(/\r?\n/);
  const blocks = [];
  let current = null;
  let currentIndent = 0;
  let inAttempts = false;
  let inTiming = false;
  let inCheckpoint = false;

  const rootSignals = {};
  const rootArtifacts = {};

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    if (/^\s*-\s+number:\s*/.test(rawLine)) {
      if (current) {
        blocks.push(current);
      }
      const match = rawLine.match(/number:\s*([0-9]+)/);
      current = {
        number: match ? match[1] : null,
        title: null,
        status: null,
        planConfirmed: null,
        lastOutcome: null,
        lastUpdatedAt: null,
        timing: {},
        sprintContract: '',
        qaReport: '',
        handoff: '',
        scorecard: '',
        checkpoint: {
          status: '',
          commit: '',
          committedAt: '',
          reason: '',
        },
      };
      currentIndent = rawLine.length - rawLine.trimStart().length;
      inAttempts = false;
      continue;
    }

    if (!current) {
      const stripped = rawLine.trim();
      if (stripped === 'signals:' || stripped === 'artifacts:') {
        const target = stripped === 'signals:' ? rootSignals : rootArtifacts;
        const targetIndent = rawLine.length - rawLine.trimStart().length;
        for (let probe = index + 1; probe < lines.length; probe += 1) {
          const candidate = lines[probe];
          const candidateStripped = candidate.trim();
          if (!candidateStripped) {
            continue;
          }
          const candidateIndent = candidate.length - candidate.trimStart().length;
          if (candidateIndent <= targetIndent) {
            break;
          }
          const separator = candidateStripped.indexOf(':');
          if (separator <= 0) {
            continue;
          }
          target[candidateStripped.slice(0, separator).trim()] = candidateStripped.slice(separator + 1).trim().replace(/^"|"$/g, '');
        }
      }
      continue;
    }

    const stripped = rawLine.trim();
    if (inAttempts && (rawLine.length - rawLine.trimStart().length) <= currentIndent + 2) {
      inAttempts = false;
    }
    if (inTiming && (rawLine.length - rawLine.trimStart().length) <= currentIndent + 2) {
      inTiming = false;
    }
    if (inCheckpoint && (rawLine.length - rawLine.trimStart().length) <= currentIndent + 2) {
      inCheckpoint = false;
    }
    if (stripped.startsWith('title:')) {
      current.title = stripped.slice('title:'.length).trim().replace(/^"|"$/g, '');
    } else if (!inCheckpoint && stripped.startsWith('status:')) {
      current.status = stripped.slice('status:'.length).trim();
    } else if (stripped.startsWith('planConfirmed:')) {
      current.planConfirmed = stripped.slice('planConfirmed:'.length).trim().toLowerCase();
    } else if (stripped.startsWith('attempts:') && (rawLine.length - rawLine.trimStart().length) > currentIndent) {
      inAttempts = true;
    } else if (stripped.startsWith('timing:') && (rawLine.length - rawLine.trimStart().length) > currentIndent) {
      inTiming = true;
    } else if (stripped.startsWith('checkpoint:') && (rawLine.length - rawLine.trimStart().length) > currentIndent) {
      inCheckpoint = true;
    } else if (inAttempts && stripped.startsWith('lastOutcome:')) {
      current.lastOutcome = stripped.slice('lastOutcome:'.length).trim();
    } else if (inAttempts && stripped.startsWith('lastUpdatedAt:')) {
      current.lastUpdatedAt = stripped.slice('lastUpdatedAt:'.length).trim();
    } else if (inTiming && stripped.startsWith('startedAt:')) {
      current.timing.startedAt = stripped.slice('startedAt:'.length).trim().replace(/^"|"$/g, '');
    } else if (inTiming && stripped.startsWith('lastStage:')) {
      current.timing.lastStage = stripped.slice('lastStage:'.length).trim().replace(/^"|"$/g, '');
    } else if (inTiming && stripped.startsWith('lastStageAt:')) {
      current.timing.lastStageAt = stripped.slice('lastStageAt:'.length).trim().replace(/^"|"$/g, '');
    } else if (inTiming && stripped.startsWith('wallClockSeconds:')) {
      current.timing.wallClockSeconds = Number.parseFloat(stripped.slice('wallClockSeconds:'.length).trim().replace(/^"|"$/g, ''));
    } else if (inTiming && stripped.startsWith('runnerActiveSeconds:')) {
      current.timing.runnerActiveSeconds = Number.parseFloat(stripped.slice('runnerActiveSeconds:'.length).trim().replace(/^"|"$/g, ''));
    } else if (inTiming && stripped.startsWith('verificationSeconds:')) {
      current.timing.verificationSeconds = Number.parseFloat(stripped.slice('verificationSeconds:'.length).trim().replace(/^"|"$/g, ''));
    } else if (inTiming && stripped.startsWith('remediationSeconds:')) {
      current.timing.remediationSeconds = Number.parseFloat(stripped.slice('remediationSeconds:'.length).trim().replace(/^"|"$/g, ''));
    } else if (inTiming && stripped.startsWith('blockedSeconds:')) {
      current.timing.blockedSeconds = Number.parseFloat(stripped.slice('blockedSeconds:'.length).trim().replace(/^"|"$/g, ''));
    } else if (inTiming && stripped.startsWith('manualCloseoutSeconds:')) {
      current.timing.manualCloseoutSeconds = Number.parseFloat(stripped.slice('manualCloseoutSeconds:'.length).trim().replace(/^"|"$/g, ''));
    } else if (inTiming && stripped.startsWith('completedAt:')) {
      current.timing.completedAt = stripped.slice('completedAt:'.length).trim().replace(/^"|"$/g, '');
    } else if (inTiming && stripped.startsWith('blockedAt:')) {
      current.timing.blockedAt = stripped.slice('blockedAt:'.length).trim().replace(/^"|"$/g, '');
    } else if (inCheckpoint && stripped.startsWith('status:')) {
      current.checkpoint.status = stripped.slice('status:'.length).trim().replace(/^"|"$/g, '');
    } else if (inCheckpoint && stripped.startsWith('commit:')) {
      current.checkpoint.commit = stripped.slice('commit:'.length).trim().replace(/^"|"$/g, '');
    } else if (inCheckpoint && stripped.startsWith('committedAt:')) {
      current.checkpoint.committedAt = stripped.slice('committedAt:'.length).trim().replace(/^"|"$/g, '');
    } else if (inCheckpoint && stripped.startsWith('reason:')) {
      current.checkpoint.reason = stripped.slice('reason:'.length).trim().replace(/^"|"$/g, '');
    } else if (stripped.startsWith('sprintContract:')) {
      current.sprintContract = stripped.slice('sprintContract:'.length).trim().replace(/^"|"$/g, '');
    } else if (stripped.startsWith('qaReport:')) {
      current.qaReport = stripped.slice('qaReport:'.length).trim().replace(/^"|"$/g, '');
    } else if (stripped.startsWith('handoff:')) {
      current.handoff = stripped.slice('handoff:'.length).trim().replace(/^"|"$/g, '');
    } else if (stripped.startsWith('scorecard:')) {
      current.scorecard = stripped.slice('scorecard:'.length).trim().replace(/^"|"$/g, '');
    }
  }

  if (current) {
    blocks.push(current);
  }

  for (const block of blocks) {
    block.phaseAttemptMode = rootSignals.phaseAttemptMode || '';
    block.activePhaseDoc = rootArtifacts.activePhaseDocPath || '';
  }

  return blocks;
}

function summarizePhaseCounts(blocks) {
  const planned = blocks.filter((block) => block.number !== null && block.planConfirmed !== 'false').length;
  const completed = blocks.filter((block) => block.status === 'completed').length;
  const blocked = blocks.filter((block) => /blocked|unhealthy/i.test(String(block.status || ''))).length;
  const pending = blocks.filter((block) => block.status === 'pending').length;
  const remaining = Math.max(planned - completed - blocked, 0);

  return {
    planned,
    completed,
    blocked,
    pending,
    remaining,
  };
}

function readRootStatusMetadata(statusFile) {
  if (!fs.existsSync(statusFile)) {
    return {
      activePhaseNumber: Number.NaN,
      activeExecutionStatus: '',
      activeCurrentStage: '',
      activeActionablePhasesRemaining: Number.NaN,
      activePlannedPhases: Number.NaN,
      activeCompletedPhases: Number.NaN,
      activeBlockedPhases: Number.NaN,
      activePendingPhases: Number.NaN,
      activeRemainingPhases: Number.NaN,
      normalizedRunVerdict: '',
      stopReasonClass: '',
      stopReasonExplanation: '',
    };
  }

  const result = {
    activePhaseNumber: Number.NaN,
    activeExecutionStatus: '',
    activeCurrentStage: '',
    activeActionablePhasesRemaining: Number.NaN,
    activePlannedPhases: Number.NaN,
    activeCompletedPhases: Number.NaN,
    activeBlockedPhases: Number.NaN,
    activePendingPhases: Number.NaN,
    activeRemainingPhases: Number.NaN,
    normalizedRunVerdict: '',
    stopReasonClass: '',
    stopReasonExplanation: '',
  };
  const lines = fs.readFileSync(statusFile, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const stripped = line.trim();
    if (!stripped) {
      continue;
    }
    if (stripped === 'phases:') {
      break;
    }
    if (stripped.startsWith('activePhaseNumber:')) {
      result.activePhaseNumber = Number.parseInt(stripped.slice('activePhaseNumber:'.length).trim().replace(/^"|"$/g, ''), 10);
    } else if (stripped.startsWith('activeExecutionStatus:')) {
      result.activeExecutionStatus = stripped.slice('activeExecutionStatus:'.length).trim().replace(/^"|"$/g, '');
    } else if (stripped.startsWith('activeCurrentStage:')) {
      result.activeCurrentStage = stripped.slice('activeCurrentStage:'.length).trim().replace(/^"|"$/g, '');
    } else if (stripped.startsWith('activeActionablePhasesRemaining:')) {
      result.activeActionablePhasesRemaining = Number.parseInt(
        stripped.slice('activeActionablePhasesRemaining:'.length).trim().replace(/^"|"$/g, ''),
        10,
      );
    } else if (stripped.startsWith('activePlannedPhases:')) {
      result.activePlannedPhases = Number.parseInt(stripped.slice('activePlannedPhases:'.length).trim().replace(/^"|"$/g, ''), 10);
    } else if (stripped.startsWith('activeCompletedPhases:')) {
      result.activeCompletedPhases = Number.parseInt(stripped.slice('activeCompletedPhases:'.length).trim().replace(/^"|"$/g, ''), 10);
    } else if (stripped.startsWith('activeBlockedPhases:')) {
      result.activeBlockedPhases = Number.parseInt(stripped.slice('activeBlockedPhases:'.length).trim().replace(/^"|"$/g, ''), 10);
    } else if (stripped.startsWith('activePendingPhases:')) {
      result.activePendingPhases = Number.parseInt(stripped.slice('activePendingPhases:'.length).trim().replace(/^"|"$/g, ''), 10);
    } else if (stripped.startsWith('activeRemainingPhases:')) {
      result.activeRemainingPhases = Number.parseInt(stripped.slice('activeRemainingPhases:'.length).trim().replace(/^"|"$/g, ''), 10);
    } else if (stripped.startsWith('normalizedRunVerdict:')) {
      result.normalizedRunVerdict = stripped.slice('normalizedRunVerdict:'.length).trim().replace(/^"|"$/g, '');
    } else if (stripped.startsWith('stopReasonClass:')) {
      result.stopReasonClass = stripped.slice('stopReasonClass:'.length).trim().replace(/^"|"$/g, '');
    } else if (stripped.startsWith('stopReasonExplanation:')) {
      result.stopReasonExplanation = stripped.slice('stopReasonExplanation:'.length).trim().replace(/^"|"$/g, '');
    }
  }

  return result;
}

function findAuthoritativeActiveBlock(statusFile, blocks = readStatusBlocks(statusFile)) {
  const root = readRootStatusMetadata(statusFile);
  if (Number.isInteger(root.activePhaseNumber)) {
    const matched = blocks.find((block) => Number.parseInt(String(block.number), 10) === root.activePhaseNumber);
    if (matched && matched.status === 'in_progress' && matched.planConfirmed !== 'false') {
      return matched;
    }
    return null;
  }

  return blocks.find((block) => block.status === 'in_progress' && block.planConfirmed !== 'false') || null;
}

function listStaleInProgressPhases(statusFile, staleSeconds) {
  const now = Date.now();
  const results = [];
  const blocks = readStatusBlocks(statusFile);
  const authoritative = findAuthoritativeActiveBlock(statusFile, blocks);
  const candidates = authoritative ? [authoritative] : blocks;

  for (const block of candidates) {
    if (block.status !== 'in_progress' || block.planConfirmed === 'false') {
      continue;
    }
    if (block.lastOutcome !== 'running') {
      continue;
    }
    const updatedAt = parseIsoTimestamp(block.lastUpdatedAt);
    if (Number.isNaN(updatedAt)) {
      continue;
    }
    if (now - updatedAt >= staleSeconds * 1000 && block.number !== null) {
      results.push(block.number);
    }
  }

  return results;
}

function getPhaseSummary(statusFile, phaseNum) {
  const blocks = readStatusBlocks(statusFile);
  const target = blocks.find((block) => String(block.number) === String(phaseNum));
  const counts = summarizePhaseCounts(blocks);
  if (target) {
    return {
      ...target,
      checkpointStatus: target.checkpoint?.status || '',
      checkpointCommit: target.checkpoint?.commit || '',
      checkpointCommittedAt: target.checkpoint?.committedAt || '',
      checkpointReason: target.checkpoint?.reason || '',
      phaseCounts: counts,
    };
  }
  return target || {
    number: String(phaseNum),
    title: '',
    status: '',
    planConfirmed: '',
    lastOutcome: '',
    lastUpdatedAt: '',
    timing: {},
    sprintContract: '',
    qaReport: '',
    handoff: '',
    scorecard: '',
    checkpoint: {},
    checkpointStatus: '',
    checkpointCommit: '',
    checkpointCommittedAt: '',
    checkpointReason: '',
    phaseAttemptMode: '',
    activePhaseDoc: '',
    phaseCounts: counts,
  };
}

function getActivePhaseContext(statusFile) {
  const blocks = readStatusBlocks(statusFile);
  const active = findAuthoritativeActiveBlock(statusFile, blocks);
  const counts = summarizePhaseCounts(blocks);
  if (active) {
    return {
      ...active,
      phaseCounts: counts,
    };
  }

  return {
    number: '',
    title: '',
    status: '',
    planConfirmed: '',
    lastOutcome: '',
    lastUpdatedAt: '',
    sprintContract: '',
    qaReport: '',
    handoff: '',
    scorecard: '',
    phaseAttemptMode: '',
    activePhaseDoc: '',
    timing: {},
    phaseCounts: counts,
  };
}

function shellQuote(value) {
  if (value === undefined || value === null) {
    return "''";
  }
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function yamlScalar(value) {
  if (value === null || value === undefined || value === '') {
    return '""';
  }
  const stringValue = String(value);
  if (/^(true|false|null|[0-9]+)$/i.test(stringValue)) {
    return `"${stringValue.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  if (/^[a-zA-Z0-9_.:/@+-]+$/.test(stringValue)) {
    return stringValue;
  }
  return `"${stringValue.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function setRootScalarInLines(lines, key, value) {
  const prefix = `${key}:`;
  const normalizedValue = value === null || value === undefined ? 'null' : value;
  const index = lines.findIndex((line) => line.startsWith(prefix));
  if (index >= 0) {
    lines[index] = `${prefix} ${normalizedValue}`;
    return;
  }

  let insertAt = lines.length;
  for (let probe = 0; probe < lines.length; probe += 1) {
    const stripped = lines[probe].trim();
    if (stripped === 'phases:') {
      insertAt = probe;
      break;
    }
  }
  lines.splice(insertAt, 0, `${prefix} ${normalizedValue}`);
}

function readAtomicLedgerStatus(phaseExecutionDir) {
  const ledgerPath = phaseExecutionDir ? path.join(phaseExecutionDir, 'WORKSETS.yaml') : '';
  if (!ledgerPath || !fs.existsSync(ledgerPath)) {
    return {
      complete: false,
      reason: 'atomic-ledger-missing',
      pending: [],
      total: 0,
      path: ledgerPath,
    };
  }

  const tasks = [];
  let inAtomicTasks = false;
  let current = null;
  for (const rawLine of fs.readFileSync(ledgerPath, 'utf8').split(/\r?\n/)) {
    const stripped = rawLine.trim();
    const indent = rawLine.length - rawLine.trimStart().length;
    if (stripped === 'atomicTasks:') {
      inAtomicTasks = true;
      continue;
    }
    if (inAtomicTasks && indent === 0 && stripped && stripped !== 'atomicTasks:') {
      break;
    }
    if (!inAtomicTasks) {
      continue;
    }

    const idMatch = stripped.match(/^-\s+id:\s*(AT-[0-9]+)/i);
    if (idMatch) {
      current = {
        id: idMatch[1],
        status: 'pending',
      };
      tasks.push(current);
      continue;
    }
    if (current && stripped.startsWith('status:')) {
      current.status = stripped.slice('status:'.length).trim().replace(/^"|"$/g, '');
    }
  }

  if (tasks.length === 0) {
    return {
      complete: false,
      reason: 'atomic-ledger-empty',
      pending: [],
      total: 0,
      path: ledgerPath,
    };
  }

  const pending = tasks.filter((task) => task.status !== 'completed').map((task) => `${task.id}:${task.status}`);
  return {
    complete: pending.length === 0,
    reason: pending.length === 0 ? 'ok' : 'atomic-tasks-incomplete',
    pending,
    total: tasks.length,
    path: ledgerPath,
  };
}

function extractWorkflowSection(text) {
  const lines = String(text || '').split(/\r?\n/);
  const result = {};
  let inSection = false;
  for (const line of lines) {
    const stripped = line.trim();
    if (stripped === '## Workflow Execution') {
      inSection = true;
      continue;
    }
    if (inSection && line.startsWith('## ')) {
      break;
    }
    if (!inSection) {
      continue;
    }
    if (stripped.startsWith('- Selected bundles:')) {
      result.selected = stripped.split(':', 2)[1]?.trim() ?? '';
    } else if (stripped.startsWith('- Applied skills:')) {
      result.applied = stripped.split(':', 2)[1]?.trim() ?? '';
    } else if (stripped.startsWith('- Skipped skills:')) {
      result.skipped = stripped.split(':', 2)[1]?.trim() ?? '';
    } else if (stripped.startsWith('- Selected harness components:')) {
      result.selectedHarnessComponents = stripped.split(':', 2)[1]?.trim() ?? '';
    } else if (stripped.startsWith('- Skipped harness components:')) {
      result.skippedHarnessComponents = stripped.split(':', 2)[1]?.trim() ?? '';
    } else if (stripped.startsWith('- Selection reason:')) {
      result.selectionReason = stripped.split(':', 2)[1]?.trim() ?? '';
    } else if (stripped.startsWith('- Runtime isolation:')) {
      result.runtimeIsolation = stripped.split(':', 2)[1]?.trim() ?? '';
    } else if (stripped.startsWith('- Model effort profile:')) {
      result.modelEffortProfile = stripped.split(':', 2)[1]?.trim() ?? '';
    } else if (stripped.startsWith('- Effort escalation reason:')) {
      result.effortEscalationReason = stripped.split(':', 2)[1]?.trim() ?? '';
    } else if (stripped.startsWith('- Selected model provider:')) {
      result.selectedModelProvider = stripped.split(':', 2)[1]?.trim() ?? '';
    } else if (stripped.startsWith('- Selected model:')) {
      result.selectedModel = stripped.split(':', 2)[1]?.trim() ?? '';
    } else if (stripped.startsWith('- Selected model effort:')) {
      result.selectedModelEffort = stripped.split(':', 2)[1]?.trim() ?? '';
    } else if (stripped.startsWith('- Model selection reason:')) {
      result.modelSelectionReason = stripped.split(':', 2)[1]?.trim() ?? '';
    } else if (stripped.startsWith('- Retrieval budget:')) {
      result.retrievalBudget = stripped.split(':', 2)[1]?.trim() ?? '';
    } else if (stripped.startsWith('- Validation profile:')) {
      result.validationProfile = stripped.split(':', 2)[1]?.trim() ?? '';
    } else if (stripped.startsWith('- Phase replay policy:')) {
      result.phaseReplayPolicy = stripped.split(':', 2)[1]?.trim() ?? '';
    }
  }
  return result;
}

function extractBulletValue(text, heading, label) {
  const lines = String(text || '').split(/\r?\n/);
  let inSection = false;
  const prefix = `- ${label}:`;
  for (const line of lines) {
    if (line.trim() === heading) {
      inSection = true;
      continue;
    }
    if (inSection && line.startsWith('## ')) {
      break;
    }
    if (inSection && line.trim().startsWith(prefix)) {
      return line.trim().split(':', 2)[1]?.trim() ?? '';
    }
  }
  return '';
}

function parseListString(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function normalizeLower(value) {
  return String(value || '').trim().toLowerCase();
}

function isNoneLikeValue(value) {
  const normalized = normalizeLower(value).replace(/[.`]/g, '').trim();
  return normalized === 'none' || normalized === '없음';
}

function containsPendingMarker(value) {
  const lowered = String(value || '').toLowerCase();
  return lowered.includes('not evaluated yet') || lowered.includes('review pending') || lowered.includes('pending until');
}

function listIncludesToken(items, token) {
  const normalizedToken = normalizeLower(token);
  return (items || []).some((item) => {
    const normalizedItem = normalizeLower(item);
    return normalizedItem === normalizedToken
      || normalizedItem.startsWith(`${normalizedToken} `)
      || normalizedItem.startsWith(`${normalizedToken}(`)
      || normalizedItem.includes(`${normalizedToken} (`)
      || normalizedItem.includes(`${normalizedToken}:`);
  });
}

function parseScorecardSummary(scorecardPath) {
  const summary = {
    exists: false,
    current: 0,
    target: 100,
    unmetItems: 0,
    blockingDefects: 0,
    verdict: 'missing',
    taskStatus: 'missing',
    taskStatusSource: 'missing',
    taskStatusExplicit: false,
    taskFull: false,
    done: false,
  };

  if (!scorecardPath || !fs.existsSync(scorecardPath)) {
    return summary;
  }

  summary.exists = true;
  const lines = fs.readFileSync(scorecardPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const stripped = line.trim();
    let match = stripped.match(/^- Current score:\s*([0-9]+)\s*$/);
    if (match) {
      summary.current = Number.parseInt(match[1], 10);
      continue;
    }
    match = stripped.match(/^- Target score:\s*([0-9]+)\s*$/);
    if (match) {
      summary.target = Number.parseInt(match[1], 10);
      continue;
    }
    match = stripped.match(/^- Unmet checklist items:\s*([0-9]+)\s*$/);
    if (match) {
      summary.unmetItems = Number.parseInt(match[1], 10);
      continue;
    }
    match = stripped.match(/^- Blocking defects:\s*([0-9]+)\s*$/);
    if (match) {
      summary.blockingDefects = Number.parseInt(match[1], 10);
      continue;
    }
    match = stripped.match(/^- Verdict:\s*([A-Za-z_ -]+)\s*$/);
    if (match) {
      summary.verdict = match[1].trim().toLowerCase().replace(/ /g, '_');
      continue;
    }
    match = stripped.match(/^- Current task status:\s*([A-Za-z_ -]+)\s*$/);
    if (match) {
      summary.taskStatus = match[1].trim().toUpperCase().replace(/ /g, '_');
      summary.taskStatusSource = 'scorecard-markdown';
      summary.taskStatusExplicit = true;
    }
  }

  summary.done = summary.verdict === 'done'
    && summary.current >= summary.target
    && summary.unmetItems === 0
    && summary.blockingDefects === 0;

  if (!summary.taskStatusExplicit) {
    summary.taskStatus = summary.done ? 'FULL' : 'NO';
    summary.taskStatusSource = summary.done ? 'legacy-inferred' : 'legacy-default';
  }
  summary.taskFull = summary.taskStatus === 'FULL';

  return summary;
}

function parseHandoffSummary(handoffPath) {
  const summary = {
    exists: false,
    required: '',
    stopReason: '',
    cleanFinish: false,
  };

  if (!handoffPath || !fs.existsSync(handoffPath)) {
    return summary;
  }

  summary.exists = true;
  const text = fs.readFileSync(handoffPath, 'utf8');
  summary.required = extractBulletValue(text, '## Status', 'Required');
  summary.stopReason = extractBulletValue(text, '## Resume Trigger', 'Stop reason');
  summary.cleanFinish = normalizeLower(summary.stopReason) === 'clean_finish'
    || normalizeLower(summary.required) === 'no';
  return summary;
}

function fileLatestTimestamp(paths) {
  let latest = 0;
  for (const candidate of paths) {
    if (!candidate || !fs.existsSync(candidate)) {
      continue;
    }
    latest = Math.max(latest, fs.statSync(candidate).mtimeMs);
  }
  return latest > 0
    ? new Date(latest).toISOString().replace(/\.\d{3}Z$/, 'Z')
    : new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function evaluateCleanFinishArtifacts({ qaReportPath, scorecardPath, handoffPath }) {
  const scorecard = parseScorecardSummary(scorecardPath);
  const handoff = parseHandoffSummary(handoffPath);
  const planConformance = evaluatePlanConformance({
    qaReportPath,
    scorecardPath,
    handoffPath,
  });

  if (!qaReportPath || !fs.existsSync(qaReportPath)) {
    return {
      cleanFinish: false,
      scorecard,
      handoff,
      planConformance,
      timestamp: fileLatestTimestamp([scorecardPath, handoffPath]),
    };
  }

  const qaText = fs.readFileSync(qaReportPath, 'utf8');
  const qaStatus = normalizeLower(extractBulletValue(qaText, '## Verdict', 'Status'));
  const qaNextPath = normalizeLower(extractBulletValue(qaText, '## Verdict', 'Next path'));
  const qaCloseoutReason = normalizeLower(extractBulletValue(qaText, '## Verdict', 'Closeout reason'));
  const qaReviewCompleted = normalizeLower(extractBulletValue(qaText, '## Review Checkpoint', 'Review completed')).startsWith('yes');
  const workflow = extractWorkflowSection(qaText);
  const finishStopWhy = extractBulletValue(qaText, '## Finish Readiness', 'Why this round may stop now');
  const finishRemainingScope = extractBulletValue(qaText, '## Finish Readiness', 'Remaining in-scope work');
  const finishRemainingBlockers = extractBulletValue(qaText, '## Finish Readiness', 'Remaining blockers before closeout');

  const cleanFinish = (qaStatus === 'pass' || qaStatus === 'passed')
    && qaNextPath === 'clean_finish'
    && qaCloseoutReason === 'scope_complete'
    && qaReviewCompleted
    && Boolean(workflow.selected && workflow.applied && workflow.skipped)
    && Boolean(finishStopWhy)
    && isNoneLikeValue(finishRemainingScope)
    && isNoneLikeValue(finishRemainingBlockers)
    && scorecard.done
    && scorecard.taskFull
    && planConformance.allowed
    && (handoff.cleanFinish || !handoff.exists || (qaNextPath === 'clean_finish' && qaCloseoutReason === 'scope_complete'));

  return {
    cleanFinish,
    scorecard,
    handoff,
    planConformance,
    qaStatus,
    qaNextPath,
    qaCloseoutReason,
    timestamp: fileLatestTimestamp([qaReportPath, scorecardPath, handoffPath]),
  };
}

function resolveCandidatePath(rawPath, qaReportDir) {
  const normalized = String(rawPath || '').trim().replace(/^['"]|['"]$/g, '');
  if (!normalized) {
    return '';
  }
  if (path.isAbsolute(normalized)) {
    return normalized;
  }
  const qaRelative = path.normalize(path.join(qaReportDir || '.', normalized));
  if (fs.existsSync(qaRelative)) {
    return qaRelative;
  }
  const rootRelative = path.normalize(normalized);
  if (fs.existsSync(rootRelative)) {
    return rootRelative;
  }
  return qaReportDir ? qaRelative : rootRelative;
}

function gatherCandidatePaths(patterns) {
  const candidates = new Set();
  for (const pattern of patterns) {
    const dir = path.dirname(pattern);
    const base = path.basename(pattern);
    const regex = new RegExp(`^${base.replace(/\./g, '\\.').replace(/\*/g, '.*')}$`);
    if (!fs.existsSync(dir)) {
      continue;
    }
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && regex.test(entry.name)) {
        candidates.add(path.join(dir, entry.name));
      }
    }
  }
  return candidates;
}

function readCurrentWorkflowState() {
  if (!fs.existsSync(CURRENT_RUN_FILE)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(CURRENT_RUN_FILE, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function extractPhaseNumberHint(qaReportPath, phaseExecutionDir) {
  const candidates = [phaseExecutionDir, qaReportPath]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    const segments = candidate.split(path.sep).filter(Boolean).reverse();
    for (const segment of segments) {
      const match = segment.match(/^([0-9]{1,2})-/);
      if (match) {
        return Number.parseInt(match[1], 10);
      }
    }
  }

  return null;
}

function artifactExplicitlyReferenced(candidatePath, explicitVerdictPaths) {
  if (explicitVerdictPaths.size === 0) {
    return false;
  }
  return explicitVerdictPaths.has(path.resolve(candidatePath));
}

function artifactMatchesPhase(payload, activePhaseNumber) {
  if (!Number.isInteger(activePhaseNumber)) {
    return null;
  }

  const payloadPhaseNumber = Number.parseInt(String(payload?.phase?.number ?? ''), 10);
  if (!Number.isNaN(payloadPhaseNumber)) {
    return payloadPhaseNumber === activePhaseNumber;
  }

  const runId = String(payload?.runId || '');
  if (new RegExp(`(^|[^0-9])0?${activePhaseNumber}([^0-9]|$)`, 'i').test(runId) && /phase/i.test(runId)) {
    return true;
  }

  return null;
}

function pathMatchesPhase(candidatePath, activePhaseNumber) {
  if (!Number.isInteger(activePhaseNumber)) {
    return null;
  }

  const normalizedPath = String(candidatePath || '').replace(/\\/g, '/');
  if (!normalizedPath) {
    return null;
  }

  const phasePattern = new RegExp(`(^|[^0-9])0?${activePhaseNumber}([^0-9]|$)`, 'i');
  if (phasePattern.test(path.basename(normalizedPath)) && /phase/i.test(normalizedPath)) {
    return true;
  }

  return null;
}

function isArtifactRelevantToActivePhase({
  candidatePath,
  payload,
  qaReportPath,
  phaseExecutionDir,
  explicitVerdictPaths,
  activePhaseNumber,
}) {
  return isRelevantVerificationVerdict(
    { payload, filePath: candidatePath },
    {
      candidatePath,
      qaReportPath,
      phaseExecutionDir,
      explicitVerdictPaths,
      activePhaseNumber,
    },
  );
}

function evaluatePhaseCompletionGate(config) {
  const startEpoch = Number.parseFloat(config.phaseStartEpoch);
  const qaReportPath = config.qaReportPath || '';
  const scorecardPath = config.scorecardPath || '';
  const phaseExecutionDir = config.phaseExecutionDir || '';
  const handoffPath = config.handoffPath || '';
  const scorecardRequired = (config.scorecardRequired || 'true').toLowerCase() === 'true';
  const targetScoreDefault = Number.parseInt(config.targetCompletionScore || '100', 10);
  const qaReportDir = qaReportPath ? path.dirname(qaReportPath) : '';
  const activePhaseNumber = extractPhaseNumberHint(qaReportPath, phaseExecutionDir);
  const markdownScore = parseScorecardSummary(scorecardPath);
  const cleanFinishArtifacts = evaluateCleanFinishArtifacts({
    qaReportPath,
    scorecardPath,
    handoffPath,
  });
  const planConformance = cleanFinishArtifacts.planConformance || evaluatePlanConformance({
    qaReportPath,
    scorecardPath,
    handoffPath,
    sprintContractPath: phaseExecutionDir ? path.join(phaseExecutionDir, 'SPRINT_CONTRACT.md') : '',
  });

  const patterns = [
    '.claude/verification-verdict-*.json',
    '.claude/runtime-verdict-*.json',
  ];
  if (phaseExecutionDir) {
    patterns.push(
      path.join(phaseExecutionDir, 'verification-verdict-*.json'),
      path.join(phaseExecutionDir, 'runtime-verdict-*.json'),
    );
  }

  const latestByScript = new Map();
  const candidatePaths = gatherCandidatePaths(patterns);
  const failures = [];
  const passedPaths = [];
  let codeChangeDetected = false;

  let workflowReason = 'ok';
  let qaFreshEvidence = false;
  let qaVerdictPassed = false;
  const qaVerificationLines = [];
  const qaVerdictPaths = [];
  let workflowSection = {};
  let reviewCompleted = false;
  let finishStopWhy = '';
  let finishRemainingScope = '';
  let finishRemainingBlockers = '';
  let latestWorkflowWarnings = [];
  let latestWorkflowSelected = [];
  let latestWorkflowApplied = [];
  let latestWorkflowSkipped = [];
  let latestWorkflowStageOrder = [];
  const currentWorkflowState = readCurrentWorkflowState();
  const explicitVerdictPaths = new Set();

  if (qaReportPath && fs.existsSync(qaReportPath)) {
    const qaText = fs.readFileSync(qaReportPath, 'utf8');
    const qaLines = qaText.split(/\r?\n/);
    workflowSection = extractWorkflowSection(qaText);
    reviewCompleted = extractBulletValue(qaText, '## Review Checkpoint', 'Review completed').toLowerCase().startsWith('yes');
    finishStopWhy = extractBulletValue(qaText, '## Finish Readiness', 'Why this round may stop now');
    finishRemainingScope = extractBulletValue(qaText, '## Finish Readiness', 'Remaining in-scope work');
    finishRemainingBlockers = extractBulletValue(qaText, '## Finish Readiness', 'Remaining blockers before closeout');

    let currentHeading = '';
    let inVerificationEvidence = false;
    for (const line of qaLines) {
      const stripped = line.trim();
      if (stripped.startsWith('## ')) {
        currentHeading = stripped;
      }
      if (currentHeading === '## Verdict' && stripped.startsWith('- Status:')) {
        const status = stripped.split(':', 2)[1]?.trim().toLowerCase();
        qaVerdictPassed = status === 'passed' || status === 'pass';
      } else if (currentHeading === '## Finish Readiness' && stripped.startsWith('- Fresh evidence confirmed:')) {
        qaFreshEvidence = (stripped.split(':', 2)[1] || '').trim().toLowerCase().startsWith('yes');
      } else if (currentHeading === '## Runtime Updates' && stripped.startsWith('- Verification verdict file:')) {
        const verdictPath = stripped.split(':', 2)[1]?.trim();
        if (verdictPath) {
          qaVerdictPaths.push(verdictPath);
        }
      } else if (currentHeading === '## Runtime Updates' && stripped.startsWith('- Verification verdict:')) {
        if ((stripped.split(':', 2)[1] || '').trim().toLowerCase() === 'passed') {
          qaVerificationLines.push(stripped);
        }
      }

      if (stripped === '## Verification Evidence') {
        inVerificationEvidence = true;
        continue;
      }
      if (inVerificationEvidence && line.startsWith('## ')) {
        inVerificationEvidence = false;
      }
      if (inVerificationEvidence && stripped.startsWith('- ') && stripped.toLowerCase().includes('passed')) {
        qaVerificationLines.push(stripped);
      }
    }

    for (const verdictPath of qaVerdictPaths) {
      const resolved = resolveCandidatePath(verdictPath, qaReportDir);
      if (resolved) {
        candidatePaths.add(resolved);
        explicitVerdictPaths.add(path.resolve(resolved));
      }
    }
  }

  for (const candidatePath of [...candidatePaths].sort()) {
    let stats;
    try {
      stats = fs.statSync(candidatePath);
    } catch {
      continue;
    }
    if (stats.mtimeMs + 1000 < startEpoch * 1000) {
      continue;
    }

    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
    } catch {
      continue;
    }

    if (payload?.stale === true || payload?.superseded === true || String(payload?.supersededBy || '').trim()) {
      continue;
    }

    if (!isArtifactRelevantToActivePhase({
      candidatePath,
      payload,
      qaReportPath,
      phaseExecutionDir,
      explicitVerdictPaths,
      activePhaseNumber,
    })) {
      continue;
    }

    const script = payload.script || path.basename(candidatePath);
    const previous = latestByScript.get(script);
    if (!previous || stats.mtimeMs > previous.mtimeMs) {
      latestByScript.set(script, { mtimeMs: stats.mtimeMs, path: candidatePath, payload });
    }
  }

  let latestScorePayload = null;
  for (const script of [...latestByScript.keys()].sort()) {
    const { path: verdictPath, payload } = latestByScript.get(script);
    const verdict = payload.verdict;
    const evidenceFresh = payload.evidenceFresh === true;
    const contract = payload.contract || {};
    const verificationMode = payload.verificationMode || contract.verificationMode || '';
    const contractApplicable = Boolean(contract.applicable);
    const missingRequired = payload.requiredChecks?.missing || [];
    const blocking = payload.blocking === true;
    const failureClass = String(payload.failureClass || '').trim().toLowerCase();
    const blockingReasonCode = String(payload.blockingReasonCode || '').trim().toLowerCase();
    const workflowEvidence = payload.workflowEvidence && typeof payload.workflowEvidence === 'object' ? payload.workflowEvidence : {};
    const workflowWarnings = Array.isArray(workflowEvidence.warnings) ? workflowEvidence.warnings : [];
    if (workflowWarnings.length > 0) {
      latestWorkflowWarnings = workflowWarnings;
    }
    if (Array.isArray(workflowEvidence.selectedBundles) && workflowEvidence.selectedBundles.length > 0) {
      latestWorkflowSelected = workflowEvidence.selectedBundles.map((item) => String(item).trim()).filter(Boolean);
    }
    if (Array.isArray(workflowEvidence.appliedSkills) && workflowEvidence.appliedSkills.length > 0) {
      latestWorkflowApplied = workflowEvidence.appliedSkills.map((item) => String(item).trim()).filter(Boolean);
    }
    if (Array.isArray(workflowEvidence.skippedSkills) && workflowEvidence.skippedSkills.length > 0) {
      latestWorkflowSkipped = workflowEvidence.skippedSkills.map((item) => String(item).trim()).filter(Boolean);
    }
    if (Array.isArray(workflowEvidence.stageOrder) && workflowEvidence.stageOrder.length > 0) {
      latestWorkflowStageOrder = workflowEvidence.stageOrder.map((item) => String(item).trim()).filter(Boolean);
    }

    if (blocking && (failureClass === 'environment' || failureClass === 'contract')) {
      failures.push(`blocked:${blockingReasonCode || script}`);
      continue;
    }

    if (verdict !== 'passed') {
      failures.push(`${script}:verdict=${verdict}`);
      continue;
    }
    if (!evidenceFresh) {
      failures.push(`${script}:evidenceFresh=false`);
      continue;
    }
    if ((contractApplicable || verificationMode === 'contract') && missingRequired.length > 0) {
      failures.push(`${script}:missingRequiredChecks`);
      continue;
    }

    for (const changedPath of payload.changedFiles || []) {
      const suffix = path.extname(changedPath).toLowerCase();
      if (new Set(['.js','.jsx','.ts','.tsx','.mjs','.cjs','.py','.rb','.go','.rs','.java','.kt','.kts','.cs','.php','.swift','.scala','.sh','.bash','.zsh','.ps1','.psm1','.c','.cc','.cpp','.cxx','.h','.hh','.hpp','.hxx']).has(suffix)) {
        codeChangeDetected = true;
      }
    }
    passedPaths.push(verdictPath);

    if (Object.keys(workflowSection).length === 0) {
      workflowReason = 'workflow-section-missing';
    } else if (!workflowSection.selected) {
      workflowReason = 'workflow-selected-bundles-missing';
    } else if (!workflowSection.applied) {
      workflowReason = 'workflow-applied-skills-missing';
    } else if (!workflowSection.skipped) {
      workflowReason = 'workflow-skipped-skills-missing';
    } else if (!workflowSection.selectedHarnessComponents) {
      workflowReason = 'workflow-selected-harness-components-missing';
    } else if (
      !workflowSection.selectionReason ||
      !workflowSection.runtimeIsolation ||
      !workflowSection.modelEffortProfile ||
      !workflowSection.effortEscalationReason ||
      !workflowSection.selectedModelProvider ||
      !workflowSection.selectedModel ||
      !workflowSection.selectedModelEffort ||
      !workflowSection.modelSelectionReason ||
      !workflowSection.retrievalBudget ||
      !workflowSection.validationProfile ||
      !workflowSection.phaseReplayPolicy
    ) {
      workflowReason = 'workflow-harness-decision-evidence-missing';
    } else if (
      ['deep', 'max'].includes(workflowSection.modelEffortProfile) &&
      ['', 'none'].includes(workflowSection.effortEscalationReason.toLowerCase())
    ) {
      workflowReason = 'workflow-effort-escalation-reason-missing';
    } else if (
      codeChangeDetected &&
      !normalizeLower(workflowSection.applied).includes('code-simplifier') &&
      (!normalizeLower(workflowSection.skipped).includes('code-simplifier') || workflowSection.skipped.toLowerCase().includes('not evaluated yet'))
    ) {
      workflowReason = 'workflow-code-simplifier-missing';
    }

    const score = payload.score;
    if (score && typeof score === 'object' && score.detected === true) {
      latestScorePayload = score;
    }
  }

  let scoreReason = 'ok';
  let currentScore = 0;
  let targetScore = targetScoreDefault;
  let unmetItems = 0;
  let blockingDefects = 0;
  let scoreVerdict = 'missing';
  let scoreSource = 'none';
  let taskStatus = markdownScore.taskStatus;
  let taskStatusSource = markdownScore.taskStatusSource;

  if (latestScorePayload) {
    currentScore = Number.parseInt(latestScorePayload.current ?? 0, 10);
    targetScore = Number.parseInt(latestScorePayload.target ?? targetScoreDefault, 10);
    unmetItems = Number.parseInt(latestScorePayload.unmetChecklistItems ?? 0, 10);
    blockingDefects = Number.parseInt(latestScorePayload.blockingDefects ?? 0, 10);
    scoreVerdict = String(latestScorePayload.verdict ?? 'missing').trim().toLowerCase().replace(/ /g, '_');
    scoreSource = 'verifier-artifact';

    if (
      cleanFinishArtifacts.cleanFinish
      && markdownScore.done
      && scoreVerdict !== 'done'
    ) {
      currentScore = markdownScore.current;
      targetScore = markdownScore.target;
      unmetItems = markdownScore.unmetItems;
      blockingDefects = markdownScore.blockingDefects;
      scoreVerdict = markdownScore.verdict;
      scoreSource = 'scorecard-markdown-reconciled';
      taskStatus = markdownScore.taskStatus;
      taskStatusSource = markdownScore.taskStatusSource;
    }
  } else if (scorecardRequired) {
    if (!markdownScore.exists) {
      scoreReason = 'scorecard-missing';
    } else {
      currentScore = markdownScore.current;
      targetScore = markdownScore.target;
      unmetItems = markdownScore.unmetItems;
      blockingDefects = markdownScore.blockingDefects;
      scoreVerdict = markdownScore.verdict;
      scoreSource = 'scorecard-markdown';
      taskStatus = markdownScore.taskStatus;
      taskStatusSource = markdownScore.taskStatusSource;
    }
  }

  if (scorecardRequired) {
    if (scoreVerdict !== 'done') {
      scoreReason = `scorecard-verdict=${scoreVerdict}`;
    } else if (currentScore < targetScore) {
      scoreReason = 'scorecard-score-below-target';
    } else if (unmetItems > 0) {
      scoreReason = 'scorecard-unmet-items';
    } else if (blockingDefects > 0) {
      scoreReason = 'scorecard-blocking-defects';
    } else if (taskStatus !== 'FULL') {
      scoreReason = `scorecard-task-status=${taskStatus.toLowerCase()}`;
    }
  }

  if (passedPaths.length === 0 && failures.length === 0 && qaFreshEvidence && (qaVerificationLines.length > 0 || qaVerdictPassed)) {
    passedPaths.push(qaReportPath || 'qa-report-fallback');
  }

  const selectedBundles = latestWorkflowSelected.length > 0
    ? latestWorkflowSelected
    : Array.isArray(currentWorkflowState?.selectedBundles) && currentWorkflowState.selectedBundles.length > 0
      ? currentWorkflowState.selectedBundles.map((item) => String(item).trim()).filter(Boolean)
      : parseListString(workflowSection.selected);
  const appliedSkills = latestWorkflowApplied.length > 0
    ? latestWorkflowApplied
    : Array.isArray(currentWorkflowState?.appliedSkills) && currentWorkflowState.appliedSkills.length > 0
      ? currentWorkflowState.appliedSkills.map((item) => String(item).trim()).filter(Boolean)
      : parseListString(workflowSection.applied);
  const skippedSkills = latestWorkflowSkipped.length > 0
    ? latestWorkflowSkipped
    : Array.isArray(currentWorkflowState?.skippedSkills) && currentWorkflowState.skippedSkills.length > 0
      ? currentWorkflowState.skippedSkills.map((item) => String(item).trim()).filter(Boolean)
      : parseListString(workflowSection.skipped);
  const effectiveStageOrder = latestWorkflowStageOrder.length > 0
    ? latestWorkflowStageOrder
    : Array.isArray(currentWorkflowState?.stageOrder) && currentWorkflowState.stageOrder.length > 0
      ? currentWorkflowState.stageOrder.map((item) => String(item).trim()).filter(Boolean)
      : [];
  const planningReady = currentWorkflowState?.readiness?.planningReady === true;
  const executionReady = currentWorkflowState?.readiness?.executionReady === true;
  const closeoutStatus = String(currentWorkflowState?.completion?.closeoutStatus || '');
  const completionBlockers = Array.isArray(currentWorkflowState?.completion?.blockers)
    ? currentWorkflowState.completion.blockers.map((item) => String(item).trim()).filter(Boolean)
    : [];
  const closeoutConcrete = cleanFinishArtifacts.cleanFinish
    || (
      qaVerdictPassed
      && reviewCompleted
      && Boolean(
        workflowSection.selected
        && workflowSection.applied
        && workflowSection.skipped
        && workflowSection.selectedHarnessComponents
        && workflowSection.skippedHarnessComponents
        && workflowSection.selectionReason
        && workflowSection.runtimeIsolation
        && workflowSection.modelEffortProfile
      )
      && Boolean(finishStopWhy && finishRemainingScope && finishRemainingBlockers)
      && !finishStopWhy.toLowerCase().includes('checkpoint')
      && !finishStopWhy.toLowerCase().includes('milestone')
      && isNoneLikeValue(finishRemainingScope)
      && isNoneLikeValue(finishRemainingBlockers)
      && (closeoutStatus === 'complete' || closeoutStatus === 'clean_finish')
    );
  const structuredVerdictReady = passedPaths.length > 0
    && failures.length === 0
    && scoreReason === 'ok'
    && scoreVerdict === 'done';
  const atomicLedger = readAtomicLedgerStatus(phaseExecutionDir);
  const demoFirstGate = evaluateDemoFirstGate({
    phaseExecutionDir,
    qaReportPath,
    scorecardPath,
    sprintContractPath: phaseExecutionDir ? path.join(phaseExecutionDir, 'SPRINT_CONTRACT.md') : '',
  });
  const informationalWorkflowWarnings = latestWorkflowWarnings.length > 0
    && structuredVerdictReady
    && closeoutConcrete
    && completionBlockers.length === 0;

  if (workflowReason === 'ok') {
    if (!planConformance.allowed) {
      workflowReason = `plan-conformance-${planConformance.reason}`;
    } else if (completionBlockers.includes('review_incomplete')) {
      workflowReason = 'review-incomplete';
    } else if (completionBlockers.includes('fresh_evidence_missing')) {
      workflowReason = 'no-fresh-verification-artifact';
    } else if (codeChangeDetected && !selectedBundles.includes('review-bundle')) {
      workflowReason = 'workflow-review-bundle-missing';
    } else if (!selectedBundles.includes('finish-bundle')) {
      workflowReason = 'workflow-finish-bundle-missing';
    } else if (codeChangeDetected && !reviewCompleted) {
      workflowReason = 'review-incomplete';
    } else if (codeChangeDetected && !listIncludesToken(appliedSkills, 'codex-review-code')) {
      workflowReason = 'workflow-review-skill-missing';
    } else if (containsPendingMarker(workflowSection.skipped) && normalizeLower(workflowSection.skipped).includes('codex-review-code')) {
      workflowReason = 'review-incomplete';
    } else if (!finishStopWhy || !finishRemainingScope || !finishRemainingBlockers) {
      workflowReason = 'finish-closeout-incomplete';
    } else if (finishStopWhy.toLowerCase().includes('checkpoint') || finishStopWhy.toLowerCase().includes('milestone')) {
      workflowReason = 'finish-closeout-incomplete';
    } else if (latestWorkflowWarnings.length > 0 && !informationalWorkflowWarnings) {
      workflowReason = 'workflow-evidence-warnings';
    }
  }

  const finalAllowed = passedPaths.length > 0
    && failures.length === 0
    && workflowReason === 'ok'
    && scoreReason === 'ok'
    && atomicLedger.complete
    && demoFirstGate.allowed;
  const finalReason = finalAllowed
    ? 'ok'
    : failures[0] || (workflowReason !== 'ok'
      ? workflowReason
      : (scoreReason !== 'ok'
        ? scoreReason
        : (!atomicLedger.complete ? atomicLedger.reason : (!demoFirstGate.allowed ? demoFirstGate.reason : 'no-fresh-verification-artifact'))));

  return {
    PHASE_COMPLETION_ALLOWED: finalAllowed ? 'true' : 'false',
    PHASE_COMPLETION_REASON: finalReason,
    PHASE_COMPLETION_ARTIFACTS: passedPaths.join('\n'),
    PHASE_COMPLETION_SCORE: String(currentScore),
    PHASE_COMPLETION_TARGET: String(targetScore),
    PHASE_COMPLETION_UNMET: String(unmetItems),
    PHASE_COMPLETION_BLOCKERS: String(blockingDefects),
    PHASE_COMPLETION_SCORE_VERDICT: scoreVerdict,
    PHASE_COMPLETION_SCORE_SOURCE: scoreSource,
    PHASE_COMPLETION_TASK_STATUS: taskStatus,
    PHASE_COMPLETION_TASK_STATUS_SOURCE: taskStatusSource,
    PHASE_COMPLETION_STATUS: String(currentWorkflowState?.completionStatus || ''),
    PHASE_COMPLETION_STAGE_ORDER: effectiveStageOrder.join(','),
    PHASE_SELECTED_HARNESS_COMPONENTS: workflowSection.selectedHarnessComponents || '',
    PHASE_SKIPPED_HARNESS_COMPONENTS: workflowSection.skippedHarnessComponents || '',
    PHASE_HARNESS_SELECTION_REASON: workflowSection.selectionReason || '',
    PHASE_RUNTIME_ISOLATION: workflowSection.runtimeIsolation || '',
    PHASE_MODEL_EFFORT_PROFILE: workflowSection.modelEffortProfile || '',
    PHASE_EFFORT_ESCALATION_REASON: workflowSection.effortEscalationReason || '',
    PHASE_SELECTED_MODEL_PROVIDER: workflowSection.selectedModelProvider || '',
    PHASE_SELECTED_MODEL: workflowSection.selectedModel || '',
    PHASE_SELECTED_MODEL_EFFORT: workflowSection.selectedModelEffort || '',
    PHASE_MODEL_SELECTION_REASON: workflowSection.modelSelectionReason || '',
    PHASE_RETRIEVAL_BUDGET: workflowSection.retrievalBudget || '',
    PHASE_VALIDATION_PROFILE: workflowSection.validationProfile || '',
    PHASE_REPLAY_POLICY: workflowSection.phaseReplayPolicy || '',
    PHASE_PLANNING_READY: planningReady ? 'true' : 'false',
    PHASE_EXECUTION_READY: executionReady ? 'true' : 'false',
    PHASE_CLOSEOUT_STATUS: closeoutStatus,
    PHASE_COMPLETION_BLOCKER_CODES: completionBlockers.join('\n'),
    PHASE_COMPLETION_CLEAN_FINISH: closeoutConcrete ? 'true' : 'false',
    PHASE_COMPLETION_ATOMIC_TASKS_DONE: atomicLedger.complete ? 'true' : 'false',
    PHASE_COMPLETION_ATOMIC_TASKS_PENDING: atomicLedger.pending.join('\n'),
    PHASE_COMPLETION_ATOMIC_TASK_LEDGER: atomicLedger.path || '',
    PHASE_COMPLETION_DEMO_FIRST_APPLIES: demoFirstGate.applies ? 'true' : 'false',
    PHASE_COMPLETION_DEMO_FIRST_ALLOWED: demoFirstGate.allowed ? 'true' : 'false',
    PHASE_COMPLETION_DEMO_FIRST_REASON: demoFirstGate.reason,
    PHASE_COMPLETION_DEMO_FIRST_MATURITY: demoFirstGate.maturityTarget || '',
    PHASE_COMPLETION_DEMO_FIRST_APPROVAL_STATUS: demoFirstGate.approvalStatus || '',
    PHASE_COMPLETION_DEMO_FIRST_APPROVED_SCOPE: demoFirstGate.approvedScopePresent ? 'true' : 'false',
    PHASE_PLAN_CONFORMANCE_ALLOWED: planConformance.allowed ? 'true' : 'false',
    PHASE_PLAN_CONFORMANCE_REASON: planConformance.reason,
    PHASE_PLAN_CONFORMANCE_VIOLATIONS: planConformance.violations.map((item) => `${item.code}: ${item.message}`).join('\n'),
    PHASE_COMPLETION_WARNING_COUNT: String(latestWorkflowWarnings.length),
    PHASE_COMPLETION_WARNING_NOTES: informationalWorkflowWarnings ? latestWorkflowWarnings.join('\n') : '',
  };
}

function updatePhaseState(config) {
  const statusFile = config.statusFile;
  if (!fs.existsSync(statusFile)) {
    return;
  }

  const rootMetadata = readRootStatusMetadata(statusFile);
  const currentRun = readJsonIfExists(CURRENT_RUN_FILE) || {};
  const activeStage = rootMetadata.activeCurrentStage || currentRun.currentStage || currentRun.phaseRunLease?.currentStage || '';
  const existingBlocks = readStatusBlocks(statusFile);
  const lines = fs.readFileSync(statusFile, 'utf8').split(/\r?\n/).filter((_, index, arr) => !(index === arr.length - 1 && arr[index] === ''));
  const blockRanges = [];
  let currentStart = null;
  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s*-\s+number:\s*/.test(lines[index])) {
      if (currentStart !== null) {
        blockRanges.push([currentStart, index]);
      }
      currentStart = index;
    }
  }
  if (currentStart !== null) {
    blockRanges.push([currentStart, lines.length]);
  }

  let targetRange = null;
  for (const [start, end] of blockRanges) {
    const match = lines[start].match(/number:\s*([0-9]+)/);
    if (match && match[1] === config.phaseNum) {
      targetRange = [start, end];
      break;
    }
  }
  if (!targetRange) {
    return;
  }

  const [start, end] = targetRange;
  const block = lines.slice(start, end);
  const currentBlock = existingBlocks.find((entry) => String(entry.number) === String(config.phaseNum)) || null;
  const itemIndent = block[0].length - block[0].trimStart().length;
  const topIndent = ' '.repeat(itemIndent + 2);
  const attemptIndent = ' '.repeat(itemIndent + 4);
  const timingIndent = ' '.repeat(itemIndent + 4);

  function setTopLevel(key, value) {
    const prefix = `${topIndent}${key}:`;
    const foundIndex = block.findIndex((line) => line.startsWith(prefix));
    if (foundIndex >= 0) {
      block[foundIndex] = `${prefix} ${value}`;
      return;
    }
    let insertAt = block.length;
    for (let index = 1; index < block.length; index += 1) {
      const indent = block[index].length - block[index].trimStart().length;
      if (indent <= itemIndent) {
        insertAt = index;
        break;
      }
    }
    block.splice(insertAt, 0, `${prefix} ${value}`);
  }

  function setRootScalarValue(key, value) {
    const prefix = `${key}:`;
    const index = lines.findIndex((line) => line.startsWith(prefix));
    const normalizedValue = value === null || value === undefined ? 'null' : value;
    if (index >= 0) {
      lines[index] = `${prefix} ${normalizedValue}`;
      return;
    }
    let insertAt = lines.length;
    for (let probe = 0; probe < lines.length; probe += 1) {
      const stripped = lines[probe].trim();
      if (stripped === 'phases:') {
        insertAt = probe;
        break;
      }
    }
    lines.splice(insertAt, 0, `${prefix} ${normalizedValue}`);
  }

  function setRootMappingValue(parent, child, value) {
    const parentPrefix = `${parent}:`;
    const childPrefix = `  ${child}:`;
    let parentIndex = lines.findIndex((line) => line.startsWith(parentPrefix));
    let parentEnd = lines.length;
    if (parentIndex === -1) {
      lines.push(parentPrefix, `${childPrefix} ${value}`);
      return;
    }
    for (let index = parentIndex + 1; index < lines.length; index += 1) {
      const stripped = lines[index].trimStart();
      const indent = lines[index].length - stripped.length;
      if (indent === 0 && stripped) {
        parentEnd = index;
        break;
      }
    }
    for (let index = parentIndex + 1; index < parentEnd; index += 1) {
      if (lines[index].startsWith(childPrefix)) {
        lines[index] = `${childPrefix} ${value}`;
        return;
      }
    }
    lines.splice(parentEnd, 0, `${childPrefix} ${value}`);
  }

  function removeRootKey(parent) {
    const parentPrefix = `${parent}:`;
    const index = lines.findIndex((line) => line.startsWith(parentPrefix));
    if (index === -1) {
      return;
    }
    let endIndex = lines.length;
    for (let probe = index + 1; probe < lines.length; probe += 1) {
      const stripped = lines[probe].trimStart();
      const indent = lines[probe].length - stripped.length;
      if (indent === 0 && stripped) {
        endIndex = probe;
        break;
      }
    }
    lines.splice(index, endIndex - index);
  }

  function ensureAttemptsBlock() {
    const prefix = `${topIndent}attempts:`;
    const foundIndex = block.findIndex((line) => line.startsWith(prefix));
    if (foundIndex >= 0) {
      let endIndex = block.length;
      for (let probe = foundIndex + 1; probe < block.length; probe += 1) {
        const indent = block[probe].length - block[probe].trimStart().length;
        if (indent <= topIndent.length) {
          endIndex = probe;
          break;
        }
      }
      return [foundIndex, endIndex];
    }
    let insertAt = block.length;
    for (let index = 1; index < block.length; index += 1) {
      const indent = block[index].length - block[index].trimStart().length;
      if (indent <= itemIndent) {
        insertAt = index;
        break;
      }
    }
    block.splice(insertAt, 0,
      `${topIndent}attempts:`,
      `${attemptIndent}total: 0`,
      `${attemptIndent}lastOutcome: pending`,
      `${attemptIndent}lastUpdatedAt: "${config.timestamp}"`,
    );
    return [insertAt, insertAt + 4];
  }

  function ensureTimingBlock() {
    const prefix = `${topIndent}timing:`;
    const foundIndex = block.findIndex((line) => line.startsWith(prefix));
    if (foundIndex >= 0) {
      let endIndex = block.length;
      for (let probe = foundIndex + 1; probe < block.length; probe += 1) {
        const indent = block[probe].length - block[probe].trimStart().length;
        if (indent <= topIndent.length) {
          endIndex = probe;
          break;
        }
      }
      return [foundIndex, endIndex];
    }

    let insertAt = block.length;
    for (let index = 1; index < block.length; index += 1) {
      const indent = block[index].length - block[index].trimStart().length;
      if (indent <= itemIndent) {
        insertAt = index;
        break;
      }
    }
    block.splice(insertAt, 0,
      `${topIndent}timing:`,
      `${timingIndent}startedAt: "${config.timestamp}"`,
      `${timingIndent}lastStage: ""`,
      `${timingIndent}lastStageAt: "${config.timestamp}"`,
      `${timingIndent}wallClockSeconds: 0`,
      `${timingIndent}runnerActiveSeconds: 0`,
      `${timingIndent}verificationSeconds: 0`,
      `${timingIndent}remediationSeconds: 0`,
      `${timingIndent}blockedSeconds: 0`,
      `${timingIndent}manualCloseoutSeconds: 0`,
    );
    return [insertAt, insertAt + 10];
  }

  function getTimingValue(name, defaultValue) {
    const [startIdx, endIdx] = ensureTimingBlock();
    const prefix = `${timingIndent}${name}:`;
    for (let index = startIdx + 1; index < endIdx; index += 1) {
      if (block[index].startsWith(prefix)) {
        return [index, block[index].slice(prefix.length).trim().replace(/^"|"$/g, '')];
      }
    }
    block.splice(endIdx, 0, `${prefix} ${defaultValue}`);
    return [endIdx, defaultValue.replace(/^"|"$/g, '')];
  }

  function updateTimingBucket(bucketName, deltaSeconds) {
    const [index, currentValue] = getTimingValue(bucketName, '0');
    const currentSeconds = Number.parseFloat(currentValue) || 0;
    block[index] = `${timingIndent}${bucketName}: ${Math.max(currentSeconds + deltaSeconds, 0)}`;
  }

  function classifyTimingBucket() {
    const statusValue = String(config.newStatus || '').toLowerCase();
    const outcomeValue = String(config.lastOutcome || '').toLowerCase();
    const stageValue = String(activeStage || '').toLowerCase();
    if (statusValue.includes('blocked') || outcomeValue.includes('blocked') || stageValue.includes('blocked')) {
      return 'blockedSeconds';
    }
    if (statusValue.includes('verification') || outcomeValue.includes('verification') || stageValue.startsWith('verify')) {
      return 'verificationSeconds';
    }
    if (statusValue.includes('reverify') || outcomeValue.includes('reverify') || outcomeValue.includes('remediation')) {
      return 'remediationSeconds';
    }
    if (stageValue.startsWith('finish') || statusValue.includes('closeout') || outcomeValue.includes('closeout')) {
      return 'manualCloseoutSeconds';
    }
    return 'runnerActiveSeconds';
  }

  function parseIsoMaybe(value) {
    const parsed = Date.parse(String(value || '').trim().replace(/^"|"$/g, ''));
    return Number.isNaN(parsed) ? null : parsed;
  }

  const currentTiming = currentBlock?.timing || {};
  const previousStageAt = parseIsoMaybe(currentTiming.lastStageAt || currentTiming.startedAt || currentBlock?.lastUpdatedAt || config.timestamp);
  const currentTimestamp = parseIsoMaybe(config.timestamp) || Date.now();
  const deltaSeconds = previousStageAt ? Math.max((currentTimestamp - previousStageAt) / 1000, 0) : 0;

  function getAttemptValue(name, defaultValue) {
    const [startIdx, endIdx] = ensureAttemptsBlock();
    const prefix = `${attemptIndent}${name}:`;
    for (let index = startIdx + 1; index < endIdx; index += 1) {
      if (block[index].startsWith(prefix)) {
        return [index, block[index].slice(prefix.length).trim().replace(/^"|"$/g, '')];
      }
    }
    block.splice(endIdx, 0, `${prefix} ${defaultValue}`);
    return [endIdx, defaultValue.replace(/^"|"$/g, '')];
  }

  setTopLevel('status', config.newStatus);
  setTopLevel('planConfirmed', 'true');
  if (config.sprintContractPath) setTopLevel('sprintContract', `"${config.sprintContractPath}"`);
  if (config.qaReportPath) setTopLevel('qaReport', `"${config.qaReportPath}"`);
  if (config.handoffPath) setTopLevel('handoff', `"${config.handoffPath}"`);
  if (config.scorecardPath) setTopLevel('scorecard', `"${config.scorecardPath}"`);

  if (config.newStatus === 'completed') {
    setTopLevel('completedAt', `"${config.timestamp}"`);
  } else {
    const completedPrefix = `${topIndent}completedAt:`;
    for (let index = block.length - 1; index >= 0; index -= 1) {
      if (block[index].startsWith(completedPrefix)) {
        block.splice(index, 1);
      }
    }
  }

  if (config.incrementAttempt === 'true' || config.lastOutcome) {
    const [totalIdx, totalValue] = getAttemptValue('total', '0');
    if (config.incrementAttempt === 'true') {
      const totalNumber = Number.parseInt(totalValue, 10) || 0;
      block[totalIdx] = `${attemptIndent}total: ${totalNumber + 1}`;
    }
    if (config.lastOutcome) {
      const [outcomeIdx] = getAttemptValue('lastOutcome', 'pending');
      block[outcomeIdx] = `${attemptIndent}lastOutcome: ${config.lastOutcome}`;
    }
    const [updatedIdx] = getAttemptValue('lastUpdatedAt', `"${config.timestamp}"`);
    block[updatedIdx] = `${attemptIndent}lastUpdatedAt: "${config.timestamp}"`;
  }

  const [startedAtIdx, startedAtValue] = getTimingValue('startedAt', `"${config.timestamp}"`);
  block[startedAtIdx] = `${timingIndent}startedAt: "${startedAtValue || config.timestamp}"`;
  const startedAtEpoch = parseIsoMaybe(startedAtValue || config.timestamp) || currentTimestamp;
  const [lastStageIdx] = getTimingValue('lastStage', '""');
  block[lastStageIdx] = `${timingIndent}lastStage: "${activeStage}"`;
  const [lastStageAtIdx] = getTimingValue('lastStageAt', `"${config.timestamp}"`);
  block[lastStageAtIdx] = `${timingIndent}lastStageAt: "${config.timestamp}"`;
  const [wallClockIdx] = getTimingValue('wallClockSeconds', '0');
  block[wallClockIdx] = `${timingIndent}wallClockSeconds: ${Math.max(Math.round((currentTimestamp - startedAtEpoch) / 1000), 0)}`;
  updateTimingBucket(classifyTimingBucket(), Math.round(deltaSeconds));
  if (config.newStatus === 'completed') {
    const [completedAtIdx] = getTimingValue('completedAt', `"${config.timestamp}"`);
    block[completedAtIdx] = `${timingIndent}completedAt: "${config.timestamp}"`;
  } else if (String(config.newStatus || '').includes('blocked')) {
    const [blockedAtIdx] = getTimingValue('blockedAt', `"${config.timestamp}"`);
    block[blockedAtIdx] = `${timingIndent}blockedAt: "${config.timestamp}"`;
  }

  lines.splice(start, end - start, ...block);

  if (config.newStatus === 'in_progress' && config.activePhaseDoc) {
    setRootMappingValue('signals', 'phaseAttemptMode', 'true');
    setRootMappingValue('artifacts', 'activePhaseDocPath', `"${config.activePhaseDoc}"`);
  } else {
    removeRootKey('signals');
    removeRootKey('artifacts');
  }

  const updatedBlocks = existingBlocks.map((entry) => (
    String(entry.number) === String(config.phaseNum)
      ? {
        ...entry,
        status: config.newStatus,
      }
      : entry
  ));
  const counts = summarizePhaseCounts(updatedBlocks);
  setRootScalarValue('activePlannedPhases', counts.planned);
  setRootScalarValue('activeCompletedPhases', counts.completed);
  setRootScalarValue('activeBlockedPhases', counts.blocked);
  setRootScalarValue('activePendingPhases', counts.pending);
  setRootScalarValue('activeRemainingPhases', counts.remaining);
  setRootScalarValue('activeActionablePhasesRemaining', counts.remaining);

  writeFileAtomic(statusFile, `${lines.join('\n')}\n`);
  shadowRuntimePhaseUpdate(config);
}

function findPhaseBlockRange(lines, phaseNum) {
  const blockRanges = [];
  let currentStart = null;
  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s*-\s+number:\s*/.test(lines[index])) {
      if (currentStart !== null) {
        blockRanges.push([currentStart, index]);
      }
      currentStart = index;
    }
  }
  if (currentStart !== null) {
    blockRanges.push([currentStart, lines.length]);
  }

  for (const [start, end] of blockRanges) {
    const match = lines[start].match(/number:\s*([0-9]+)/);
    if (match && match[1] === String(phaseNum)) {
      return [start, end];
    }
  }
  return null;
}

function setPhaseCheckpoint(statusFile, phaseNum, checkpoint) {
  if (!fs.existsSync(statusFile)) {
    return;
  }
  const lines = fs.readFileSync(statusFile, 'utf8').split(/\r?\n/).filter((_, index, arr) => !(index === arr.length - 1 && arr[index] === ''));
  const range = findPhaseBlockRange(lines, phaseNum);
  if (!range) {
    return;
  }

  const [start, end] = range;
  const block = lines.slice(start, end);
  const itemIndent = block[0].length - block[0].trimStart().length;
  const topIndent = ' '.repeat(itemIndent + 2);
  const checkpointIndent = ' '.repeat(itemIndent + 4);
  const prefix = `${topIndent}checkpoint:`;
  let checkpointStart = block.findIndex((line) => line.startsWith(prefix));
  let checkpointEnd = block.length;
  if (checkpointStart >= 0) {
    for (let probe = checkpointStart + 1; probe < block.length; probe += 1) {
      const indent = block[probe].length - block[probe].trimStart().length;
      if (indent <= topIndent.length) {
        checkpointEnd = probe;
        break;
      }
    }
    block.splice(checkpointStart, checkpointEnd - checkpointStart);
  } else {
    checkpointStart = block.length;
    for (let index = 1; index < block.length; index += 1) {
      const indent = block[index].length - block[index].trimStart().length;
      if (indent <= itemIndent) {
        checkpointStart = index;
        break;
      }
    }
  }

  block.splice(checkpointStart, 0,
    `${topIndent}checkpoint:`,
    `${checkpointIndent}status: ${yamlScalar(checkpoint.status)}`,
    `${checkpointIndent}commit: ${yamlScalar(checkpoint.commit)}`,
    `${checkpointIndent}committedAt: ${yamlScalar(checkpoint.committedAt)}`,
    `${checkpointIndent}reason: ${yamlScalar(checkpoint.reason)}`,
  );

  lines.splice(start, end - start, ...block);
  writeFileAtomic(statusFile, `${lines.join('\n')}\n`);
}

function setRootRunVerdict(statusFile, normalizedRunVerdict, stopReasonClass, stopReasonExplanation) {
  if (!fs.existsSync(statusFile)) {
    return;
  }
  const lines = fs.readFileSync(statusFile, 'utf8').split(/\r?\n/).filter((_, index, arr) => !(index === arr.length - 1 && arr[index] === ''));
  setRootScalarInLines(lines, 'normalizedRunVerdict', yamlScalar(normalizedRunVerdict));
  setRootScalarInLines(lines, 'stopReasonClass', yamlScalar(stopReasonClass));
  setRootScalarInLines(lines, 'stopReasonExplanation', yamlScalar(stopReasonExplanation));
  writeFileAtomic(statusFile, `${lines.join('\n')}\n`);
}

function runSelfTest() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-state-'));
  const statusFile = path.join(tempDir, 'phase-status.yaml');
  try {
    fs.writeFileSync(statusFile, `schemaVersion: 1
activeExecutionStatus: running
phases:
  - number: 1
    title: "Fixture"
    status: completed
    planConfirmed: true
`, 'utf8');

    setPhaseCheckpoint(statusFile, '1', {
      status: 'committed',
      commit: 'abc123',
      committedAt: '2026-05-05T00:00:00.000Z',
      reason: 'checkpoint_commit_created',
    });
    setRootRunVerdict(statusFile, 'success_with_warning', 'reconciled_nonzero', 'completed after reconciled non-zero exit');
    const metadata = readRootStatusMetadata(statusFile);
    const summary = getPhaseSummary(statusFile, '1');
    if (metadata.normalizedRunVerdict !== 'success_with_warning') {
      throw new Error('root normalizedRunVerdict was not persisted');
    }
    if (summary.checkpointStatus !== 'committed' || summary.checkpointCommit !== 'abc123') {
      throw new Error('phase checkpoint fields were not persisted');
    }
    writeStdoutLine('agent-loop-phase-state self-test passed');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function reconcileCompletedPhases(statusFile) {
  if (!fs.existsSync(statusFile)) {
    return [];
  }

  const reconciled = [];
  for (const block of readStatusBlocks(statusFile)) {
    if (!block.number || block.status === 'completed') {
      continue;
    }

    const artifactState = evaluateCleanFinishArtifacts({
      qaReportPath: block.qaReport,
      scorecardPath: block.scorecard,
      handoffPath: block.handoff,
    });

    if (!artifactState.cleanFinish) {
      continue;
    }
    const executionDir = block.qaReport ? path.dirname(block.qaReport) : '';
    const atomicLedger = readAtomicLedgerStatus(executionDir);
    if (!atomicLedger.complete) {
      continue;
    }
    const demoFirstGate = evaluateDemoFirstGate({
      phaseExecutionDir: executionDir,
      qaReportPath: block.qaReport,
      scorecardPath: block.scorecard,
      sprintContractPath: block.sprintContract,
      phaseDocPath: block.archivedPhaseDoc,
    });
    if (!demoFirstGate.allowed) {
      continue;
    }

    updatePhaseState({
      statusFile,
      phaseNum: String(block.number),
      newStatus: 'completed',
      timestamp: artifactState.timestamp,
      lastOutcome: 'completed',
      incrementAttempt: 'false',
      activePhaseDoc: '',
      sprintContractPath: block.sprintContract,
      qaReportPath: block.qaReport,
      handoffPath: block.handoff,
      scorecardPath: block.scorecard,
    });

    reconciled.push({
      phaseNum: String(block.number),
      fromStatus: block.status || '',
      reason: 'clean-finish-artifacts',
      timestamp: artifactState.timestamp,
    });
  }

  return reconciled;
}

function printUsage() {
  console.error([
    'Usage:',
    '  agent-loop-phase-state.mjs list-stale-in-progress-phases <status-file> [stale-seconds]',
    '  agent-loop-phase-state.mjs get-phase-summary <status-file> <phase-num>',
    '  agent-loop-phase-state.mjs get-active-phase-context <status-file>',
    '  agent-loop-phase-state.mjs evaluate-phase-completion-gate <phase-start-epoch> <qa-report-path> <scorecard-path> <phase-execution-dir> <scorecard-required> <target-completion-score> [handoff-path]',
    '  agent-loop-phase-state.mjs reconcile-completed-phases <status-file>',
    '  agent-loop-phase-state.mjs set-phase-checkpoint <status-file> <phase-num> <status> <commit> <committed-at> <reason>',
    '  agent-loop-phase-state.mjs set-root-run-verdict <status-file> <normalized-verdict> <stop-reason-class> <explanation>',
    '  agent-loop-phase-state.mjs update-phase-state <status-file> <phase-num> <new-status> <timestamp> <last-outcome> <increment-attempt> <active-phase-doc> <sprint-contract> <qa-report> <handoff> <scorecard>',
    '  agent-loop-phase-state.mjs self-test',
  ].join('\n'));
}

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case 'list-stale-in-progress-phases': {
    const [statusFile, staleSecondsRaw = '1800'] = args;
    if (!statusFile) {
      printUsage();
      process.exit(64);
    }
    const staleSeconds = Number.parseFloat(staleSecondsRaw);
    for (const phase of listStaleInProgressPhases(statusFile, staleSeconds)) {
      writeStdoutLine(phase);
    }
    break;
  }
  case 'evaluate-phase-completion-gate': {
    const result = evaluatePhaseCompletionGate({
      phaseStartEpoch: args[0],
      qaReportPath: args[1],
      scorecardPath: args[2],
      phaseExecutionDir: args[3],
      scorecardRequired: args[4],
      targetCompletionScore: args[5],
      handoffPath: args[6],
    });
    for (const [key, value] of Object.entries(result)) {
      writeStdoutLine(`${key}=${shellQuote(value)}`);
    }
    break;
  }
  case 'get-phase-summary': {
    const [statusFile, phaseNum] = args;
    if (!statusFile || !phaseNum) {
      printUsage();
      process.exit(64);
    }
    const result = getPhaseSummary(statusFile, phaseNum);
    for (const [key, value] of Object.entries(result)) {
      writeStdoutLine(`${key}=${shellQuote(value)}`);
    }
    break;
  }
  case 'get-active-phase-context': {
    const [statusFile] = args;
    if (!statusFile) {
      printUsage();
      process.exit(64);
    }
    const result = getActivePhaseContext(statusFile);
    for (const [key, value] of Object.entries(result)) {
      writeStdoutLine(`${key}=${shellQuote(value)}`);
    }
    break;
  }
  case 'reconcile-completed-phases': {
    const [statusFile] = args;
    if (!statusFile) {
      printUsage();
      process.exit(64);
    }
    const reconciled = reconcileCompletedPhases(statusFile);
    for (const entry of reconciled) {
      writeStdoutLine(`${entry.phaseNum}|${entry.fromStatus}|${entry.reason}|${entry.timestamp}`);
    }
    break;
  }
  case 'update-phase-state':
    updatePhaseState({
      statusFile: args[0],
      phaseNum: args[1],
      newStatus: args[2],
      timestamp: args[3],
      lastOutcome: args[4],
      incrementAttempt: args[5],
      activePhaseDoc: args[6],
      sprintContractPath: args[7],
      qaReportPath: args[8],
      handoffPath: args[9],
      scorecardPath: args[10],
    });
    break;
  case 'set-phase-checkpoint': {
    const [statusFile, phaseNum, status, commit, committedAt, reason] = args;
    if (!statusFile || !phaseNum || !status) {
      printUsage();
      process.exit(64);
    }
    setPhaseCheckpoint(statusFile, phaseNum, {
      status,
      commit: commit || '',
      committedAt: committedAt || '',
      reason: reason || '',
    });
    break;
  }
  case 'set-root-run-verdict': {
    const [statusFile, normalizedRunVerdict, stopReasonClass, stopReasonExplanation] = args;
    if (!statusFile || !normalizedRunVerdict || !stopReasonClass) {
      printUsage();
      process.exit(64);
    }
    setRootRunVerdict(statusFile, normalizedRunVerdict, stopReasonClass, stopReasonExplanation || '');
    break;
  }
  case 'self-test':
    runSelfTest();
    break;
  default:
    printUsage();
    process.exit(64);
}
