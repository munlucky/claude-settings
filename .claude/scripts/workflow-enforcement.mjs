#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { evaluatePlanConformance } from './verify-plan-conformance.mjs';
import { evaluatePhaseCloseout } from './verify-phase-closeout.mjs';
import { readCurrentArtifacts } from './lib/current-artifacts-state.mjs';
import { resolveModelRoute } from './lib/model-routing-policy.mjs';
import { collectGitStatusPaths, isInsideGitWorkTree } from './lib/git-utils.mjs';
import { parseWorksetsYaml } from './lib/phase-closeout-parsers.mjs';
import { defaultPhaseEventLedgerPath, readPhaseEvents } from './lib/phase-event-ledger.mjs';
import {
  isCodeChangingPath,
  validateCodeReviewGraphEvidence,
} from './lib/code-review-graph-evidence.mjs';
import {
  CANONICAL_CLOSEOUT_REASONS,
  CANONICAL_NEXT_PATHS,
  canonicalizeCloseoutReason,
  canonicalizeHandoffStopReason,
  canonicalizeNextPath,
} from './artifact-normalizer.mjs';

const WORKFLOW_LOG_DIR = process.env.WORKFLOW_ENFORCEMENT_LOG_DIR || '.claude/logs/workflow-enforcement';
const STATUS_FILE_DEFAULT = '.claude/docs/phase-status.yaml';
const CURRENT_RUN_FILE = path.join(WORKFLOW_LOG_DIR, 'current-run.json');
const PLAN_SUCCESS_STOP_REASON_CODES = new Set([
  'plan-directory-complete',
  'scope_complete',
  'clean_finish',
  'current-session-clean-finish',
  'success-return',
]);
const RETRY_STRATEGIES = new Set(['same_direction_refine', 'partial_redesign', 'stop_and_handoff']);
const DEFAULT_RETRIEVAL_BUDGET = 'stage=1 compact recall; repeat only for missing owner/date/path/API/failure fact; stopWhenAnswerable=true; no raw graph or memory output';
const DEFAULT_VALIDATION_PROFILE = 'workflow_core';
const DEFAULT_PHASE_REPLAY_POLICY = 'preserve assistant phase commentary/final_answer when replaying; never add phase to user items';
const SELF_HEALING_STALE_WARNINGS = new Set([
  'latest_dispatch_missing',
  'current_run_missing',
  'latest_dispatch_older_than_phase_status',
  'current_run_older_than_latest_dispatch',
]);
const RUNTIME_CAPABILITY_FIELDS = [
  'fork',
  'mcp',
  'shell',
  'browser',
  'worktree',
  'toolInheritance',
  'fallbackSupport',
];

function defaultEffortEscalationReason(profile) {
  return ['deep', 'max'].includes(String(profile || '').trim()) ? '' : 'none';
}

function effortEscalationMissing(profile, reason) {
  const normalizedProfile = String(profile || '').trim();
  const normalizedReason = String(reason || '').trim().toLowerCase();
  return ['deep', 'max'].includes(normalizedProfile) && (!normalizedReason || normalizedReason === 'none');
}

function usage() {
  console.log(`Usage:
  workflow-enforcement.sh record-dispatch --plan-dir <path> --execution-mode <mode> --execution-root <path> --runtime <runtime> [--status-file <path>] [--master-plan <path>]
  workflow-enforcement.sh record-bounded --analysis-path <path> [--qa-report-path <path>] [--handoff-path <path>]
  workflow-enforcement.sh verify [changed-files...]`);
}

function logError(message) {
  console.error(`ERROR: ${message}`);
}

function utcTimestamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function stampTimestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}-${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
}

function envAvailability(name, fallback = 'unknown') {
  const raw = String(process.env[name] || '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'available', 'passed'].includes(raw)) return 'available';
  if (['0', 'false', 'no', 'unavailable', 'failed'].includes(raw)) return 'unavailable';
  if (['degraded', 'partial'].includes(raw)) return 'degraded';
  return fallback;
}

function statMtimeIso(filePath) {
  try {
    return fs.existsSync(filePath) ? fs.statSync(filePath).mtime.toISOString() : null;
  } catch {
    return null;
  }
}

function classifyUnavailableCapability(name, status) {
  if (!['unavailable', 'degraded'].includes(status)) {
    return null;
  }
  if (name === 'mcp') {
    return 'mcp_unavailable';
  }
  if (['shell', 'browser', 'worktree'].includes(name)) {
    return 'runtime_unavailable';
  }
  return 'tool_unavailable';
}

function buildRuntimeCapabilityStatus(runtime) {
  const normalizedRuntime = String(runtime || 'auto').trim() || 'auto';
  const forkStatus = normalizedRuntime === 'claude-code' || normalizedRuntime === 'claude'
    ? 'available'
    : 'degraded';
  const toolInheritanceStatus = normalizedRuntime === 'codex' ? 'degraded' : 'available';
  const capabilities = {
    fork: {
      status: envAvailability('WORKFLOW_CAPABILITY_FORK', forkStatus),
      evidence: normalizedRuntime === 'codex'
        ? 'Codex review/verify fork semantics require native sub-agent support or recorded current-session fallback.'
        : 'Claude runtime can route forked Task-style review/verification attempts.',
    },
    mcp: {
      status: envAvailability('WORKFLOW_CAPABILITY_MCP', 'unknown'),
      evidence: 'MCP connectors/tools must be looked up before an unavailable classification is recorded.',
    },
    shell: {
      status: envAvailability('WORKFLOW_CAPABILITY_SHELL', 'available'),
      evidence: 'Shell verification commands are part of the active verification contract.',
    },
    browser: {
      status: envAvailability('WORKFLOW_CAPABILITY_BROWSER', 'unknown'),
      evidence: 'Browser capability is optional unless the source phase or verification contract requires runtime UI evidence.',
    },
    worktree: {
      status: envAvailability('WORKFLOW_CAPABILITY_WORKTREE', 'available'),
      evidence: 'Git worktree support is required for isolated phase waves; sequential fallback remains available.',
    },
    toolInheritance: {
      status: envAvailability('WORKFLOW_CAPABILITY_TOOL_INHERITANCE', toolInheritanceStatus),
      evidence: 'Forked attempts must receive only artifact-backed inputs and cannot assume all coordinator tools are inherited.',
    },
    fallbackSupport: {
      status: envAvailability('WORKFLOW_CAPABILITY_FALLBACK_SUPPORT', 'available'),
      evidence: 'Codex direct fallback may execute the phase attempt in-session when slash orchestration is unavailable.',
    },
  };
  return {
    schemaVersion: '1.0',
    runtime: normalizedRuntime,
    recordedAt: utcTimestamp(),
    capabilities,
    deferredToolLookup: {
      requiredBeforeUnavailable: true,
      evidenceField: 'toolLookupEvidence',
      policy: 'search deferred/native tool registry before reporting tool_unavailable or mcp_unavailable',
    },
    toolLookupEvidence: process.env.WORKFLOW_TOOL_LOOKUP_EVIDENCE
      || 'not_run_no_missing_tool_reported',
    unavailableClassification: Object.fromEntries(
      Object.entries(capabilities)
        .map(([name, value]) => [name, classifyUnavailableCapability(name, value.status)])
        .filter(([, value]) => value)
    ),
    fallbackPolicy: normalizedRuntime === 'codex'
      ? 'codex_direct_phase_attempt_fallback'
      : 'runtime_adapter_primary',
  };
}

function detectStaleProjectionWarnings({ statusFile, latestDispatchFile, currentRunFile }) {
  const warnings = [];
  const statusMtime = statMtimeIso(statusFile);
  const dispatchMtime = statMtimeIso(latestDispatchFile);
  const currentRunMtime = statMtimeIso(currentRunFile);
  if (statusFile && !statusMtime) warnings.push('phase_status_missing');
  if (!dispatchMtime) warnings.push('latest_dispatch_missing');
  if (!currentRunMtime) warnings.push('current_run_missing');
  if (statusMtime && dispatchMtime && new Date(dispatchMtime) < new Date(statusMtime)) {
    warnings.push('latest_dispatch_older_than_phase_status');
  }
  if (dispatchMtime && currentRunMtime && new Date(currentRunMtime) < new Date(dispatchMtime)) {
    warnings.push('current_run_older_than_latest_dispatch');
  }
  return warnings;
}

function buildCompactStatusReadModel({
  planDir,
  statusFile,
  masterPlan,
  executionRoot,
  runtime,
  sprintContractPath = '',
  qaReportPath = '',
  latestVerdictFile = '',
  suppressSelfWriteMissingWarnings = false,
}) {
  const latestDispatchFile = path.join(WORKFLOW_LOG_DIR, 'latest-dispatch.json');
  const currentArtifacts = readCurrentArtifacts({ root: process.cwd(), mode: 'current' });
  const currentVerdictFile = currentArtifacts.ok
    ? currentArtifacts.artifacts.find((entry) => entry.kind === 'verification-verdict' || /^verification-verdict-.*\.json$/.test(path.basename(entry.path)))?.relativePath || ''
    : '';
  const effectiveLatestVerdictFile = latestVerdictFile || currentVerdictFile;
  const rawStaleWarnings = detectStaleProjectionWarnings({
    statusFile,
    latestDispatchFile,
    currentRunFile: CURRENT_RUN_FILE,
  });
  const staleWarnings = suppressSelfWriteMissingWarnings
    ? rawStaleWarnings.filter((item) => !SELF_HEALING_STALE_WARNINGS.has(item))
    : rawStaleWarnings;
  return {
    schemaVersion: '1.0',
    activeContract: {
      planDir,
      statusFile,
      masterPlan,
      executionRoot,
      sprintContractPath,
      qaReportPath,
    },
    latestVerdict: effectiveLatestVerdictFile
      ? {
        path: effectiveLatestVerdictFile,
        state: currentVerdictFile && !latestVerdictFile ? 'current-artifacts' : 'recorded',
        currentArtifacts: currentArtifacts.ok ? {
          indexPath: currentArtifacts.indexPath,
          manifestPath: currentArtifacts.manifestPath,
          manifestHash: currentArtifacts.manifestHash,
          commitToken: currentArtifacts.commitToken,
        } : null,
      }
      : { path: null, state: currentArtifacts.ok ? 'pending' : currentArtifacts.reason || 'pending' },
    currentBlocker: staleWarnings.length > 0 ? 'stale_projection_warning' : 'verification_pending',
    lineage: {
      runId: process.env.PHASE_RUN_ID || process.env.WORKFLOW_RUN_ID || '',
      phaseId: process.env.PHASE_ID || process.env.PHASE_NUM || '',
      contractSnapshotId: process.env.GOAL_CONTRACT_SNAPSHOT_ID || '',
    },
    staleWarnings,
    runtime,
  };
}

function buildResumeBrief(readModel) {
  return {
    schemaVersion: '1.0',
    nextAction: readModel.currentBlocker === 'verification_pending'
      ? 'run_review_then_verification'
      : 'refresh_stale_read_models_before_closeout',
    activeContract: readModel.activeContract,
    latestVerdict: readModel.latestVerdict,
    currentBlocker: readModel.currentBlocker,
    lineage: readModel.lineage,
    staleWarnings: readModel.staleWarnings,
  };
}

function validateRuntimeReadModels(payload, artifactPath) {
  const violations = [];
  const capabilityStatus = payload.runtimeCapabilityStatus;
  if (!capabilityStatus || typeof capabilityStatus !== 'object') {
    violations.push(`${artifactPath}: runtimeCapabilityStatus is required`);
  } else {
    const capabilities = capabilityStatus.capabilities && typeof capabilityStatus.capabilities === 'object'
      ? capabilityStatus.capabilities
      : {};
    for (const field of RUNTIME_CAPABILITY_FIELDS) {
      if (!capabilities[field] || typeof capabilities[field].status !== 'string' || !capabilities[field].status.trim()) {
        violations.push(`${artifactPath}: runtimeCapabilityStatus.capabilities.${field}.status is required`);
      }
    }
    if (!capabilityStatus.deferredToolLookup?.requiredBeforeUnavailable) {
      violations.push(`${artifactPath}: runtimeCapabilityStatus.deferredToolLookup.requiredBeforeUnavailable must be true`);
    }
    if (typeof capabilityStatus.toolLookupEvidence !== 'string' || !capabilityStatus.toolLookupEvidence.trim()) {
      violations.push(`${artifactPath}: runtimeCapabilityStatus.toolLookupEvidence is required`);
    }
    const unavailableValues = Object.values(capabilityStatus.unavailableClassification || {});
    if (unavailableValues.some((item) => !['mcp_unavailable', 'tool_unavailable', 'runtime_unavailable'].includes(item))) {
      violations.push(`${artifactPath}: unavailable classifications must use mcp_unavailable, tool_unavailable, or runtime_unavailable`);
    }
  }

  const compactStatus = payload.compactStatus;
  if (!compactStatus || typeof compactStatus !== 'object') {
    violations.push(`${artifactPath}: compactStatus is required`);
  } else {
    if (!compactStatus.activeContract || typeof compactStatus.activeContract !== 'object') {
      violations.push(`${artifactPath}: compactStatus.activeContract is required`);
    }
    if (!compactStatus.latestVerdict || typeof compactStatus.latestVerdict !== 'object') {
      violations.push(`${artifactPath}: compactStatus.latestVerdict is required`);
    }
    if (!compactStatus.lineage || typeof compactStatus.lineage !== 'object') {
      violations.push(`${artifactPath}: compactStatus.lineage is required`);
    }
    if (!Array.isArray(compactStatus.staleWarnings)) {
      violations.push(`${artifactPath}: compactStatus.staleWarnings must be an array`);
    }
  }

  const resumeBrief = payload.resumeBrief;
  if (!resumeBrief || typeof resumeBrief !== 'object') {
    violations.push(`${artifactPath}: resumeBrief is required`);
  } else {
    for (const key of ['nextAction', 'activeContract', 'latestVerdict', 'currentBlocker', 'lineage', 'staleWarnings']) {
      if (!(key in resumeBrief)) {
        violations.push(`${artifactPath}: resumeBrief.${key} is required`);
      }
    }
  }
  return violations;
}

function collectCandidateFiles(args) {
  if (process.env.WORKFLOW_ENFORCEMENT_FILES) {
    return process.env.WORKFLOW_ENFORCEMENT_FILES.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  }
  if (args.length > 0) {
    return args;
  }
  if (!isInsideGitWorkTree(process.cwd())) {
    return [];
  }
  return collectGitStatusPaths(process.cwd());
}

function parseArgs(argv, specs) {
  const result = {};
  const args = [...argv];
  while (args.length > 0) {
    const arg = args.shift();
    const spec = specs[arg];
    if (!spec) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (spec.type === 'flag') {
      result[spec.key] = true;
      continue;
    }
    result[spec.key] = args.shift() ?? '';
  }
  return result;
}

function yamlScalar(value) {
  if (value === null || value === undefined || value === '') {
    return 'null';
  }
  const escaped = String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function parseScalar(value) {
  const raw = value.trim();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  return raw;
}

function parseSimpleYaml(text) {
  const result = {};
  const stack = [[-1, result]];
  const lines = text.split(/\r?\n/);

  function nextMeaningful(startIndex) {
    for (let index = startIndex + 1; index < lines.length; index += 1) {
      const stripped = lines[index].trim();
      if (!stripped || stripped.startsWith('#')) {
        continue;
      }
      const indent = lines[index].length - lines[index].trimStart().length;
      return { indent, stripped };
    }
    return null;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const stripped = rawLine.trim();
    if (!stripped || stripped.startsWith('#')) {
      continue;
    }
    const indent = rawLine.length - rawLine.trimStart().length;
    while (stack.length > 1 && indent <= stack.at(-1)[0]) {
      stack.pop();
    }
    const container = stack.at(-1)[1];

    if (stripped.startsWith('- ')) {
      if (Array.isArray(container)) {
        container.push(parseScalar(stripped.slice(2)));
      }
      continue;
    }

    const separator = stripped.indexOf(':');
    if (separator <= 0) {
      continue;
    }
    const key = stripped.slice(0, separator).trim();
    const value = stripped.slice(separator + 1).trim();
    if (!key || typeof container !== 'object' || Array.isArray(container)) {
      continue;
    }

    if (!value) {
      const next = nextMeaningful(index);
      const nested = next && next.indent > indent && next.stripped.startsWith('- ') ? [] : {};
      container[key] = nested;
      stack.push([indent, nested]);
      continue;
    }

    container[key] = parseScalar(value);
  }

  return result;
}

export function parsePhaseStatusSummary(statusFile) {
  if (!statusFile || !fs.existsSync(statusFile)) {
    return null;
  }
  const payload = parseSimpleYaml(fs.readFileSync(statusFile, 'utf8'));
  return {
    masterPlan: String(payload.masterPlan || '').trim().replace(/^"|"$/g, ''),
    executionRoot: String(payload.executionRoot || '').trim().replace(/^"|"$/g, ''),
    activeExecutionStatus: String(payload.activeExecutionStatus || '').trim().toLowerCase(),
    activeActionablePhasesRemaining: Number.parseInt(String(payload.activeActionablePhasesRemaining ?? ''), 10),
    lastStopReasonCode: String(payload.lastStopReasonCode || '').trim().replace(/^"|"$/g, '').toLowerCase(),
  };
}

export function authoritativePlanCloseoutPassed(statusSummary) {
  if (!statusSummary || statusSummary.activeExecutionStatus !== 'finished') {
    return false;
  }
  const actionableRemaining = Number.isNaN(statusSummary.activeActionablePhasesRemaining)
    ? -1
    : statusSummary.activeActionablePhasesRemaining;
  if (actionableRemaining !== 0) {
    return false;
  }
  const result = evaluatePhaseCloseout({
    statusFile: STATUS_FILE_DEFAULT,
    planDir: statusSummary.masterPlan ? path.dirname(statusSummary.masterPlan) : 'docs/implementation',
    masterPlan: statusSummary.masterPlan || '',
    executionRoot: statusSummary.executionRoot || '',
  });
  return result.allowed === true && result.status === 'pass';
}

function extractWorkflowSection(text) {
  const lines = text.split(/\r?\n/);
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

function parseListString(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function upsertTopLevelYamlBlock(lines, key, blockLines) {
  let start = lines.findIndex((line) => line.startsWith(`${key}:`));
  let end = lines.length;
  if (start >= 0) {
    for (let index = start + 1; index < lines.length; index += 1) {
      if (lines[index] && !lines[index].startsWith(' ') && !lines[index].startsWith('\t')) {
        end = index;
        break;
      }
    }
    return [...lines.slice(0, start), ...blockLines, ...lines.slice(end)];
  }
  const nextLines = [...lines];
  if (nextLines.length > 0 && nextLines.at(-1)?.trim()) {
    nextLines.push('');
  }
  nextLines.push(...blockLines);
  return nextLines;
}

function writeCurrentRunState(payload) {
  fs.mkdirSync(WORKFLOW_LOG_DIR, { recursive: true });
  const state = {
    stateVersion: '1.0',
    updatedAt: utcTimestamp(),
    ...payload,
  };
  fs.writeFileSync(CURRENT_RUN_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  return state;
}

function deriveCompletionStatusFromQaReport(qaReportPath) {
  if (!qaReportPath || !fs.existsSync(qaReportPath)) {
    return 'verification_pending';
  }
  const text = fs.readFileSync(qaReportPath, 'utf8');
  const nextPath = canonicalizeNextPath(extractBulletValue(text, '## Verdict', 'Next path'));
  const scopeStatus = extractBulletValue(text, '## Verdict', 'Scope status');
  const reviewCompleted = extractBulletValue(text, '## Review Checkpoint', 'Review completed').toLowerCase();
  if (nextPath === 'clean_finish' && scopeStatus === 'complete' && reviewCompleted === 'yes') {
    return 'complete';
  }
  if (nextPath === 'retry_loop') {
    return 'retry_required';
  }
  if (nextPath === 'resume_later_handoff') {
    return 'handoff_ready';
  }
  return 'verification_pending';
}

function deriveCloseoutStatusFromCompletionStatus(completionStatus) {
  switch (completionStatus) {
    case 'complete':
      return 'clean_finish';
    case 'retry_required':
      return 'retry_loop';
    case 'handoff_ready':
      return 'resume_later_handoff';
    default:
      return 'active';
  }
}

function deriveCompletionBlockersFromQaReport(qaReportPath) {
  if (!qaReportPath || !fs.existsSync(qaReportPath)) {
    return ['qa_report_missing'];
  }
  const text = fs.readFileSync(qaReportPath, 'utf8');
  const blockers = [];
  const reviewCompleted = extractBulletValue(text, '## Review Checkpoint', 'Review completed').toLowerCase();
  const freshEvidence = extractBulletValue(text, '## Finish Readiness', 'Fresh evidence confirmed').toLowerCase();
  const traceabilityEvidence = extractBulletValue(text, '## Finish Readiness', 'Traceability evidence confirmed').toLowerCase();
  const acceptanceEvidence = extractBulletValue(text, '## Finish Readiness', 'AC evidence confirmed').toLowerCase()
    || extractBulletValue(text, '## Finish Readiness', 'Acceptance criteria evidence confirmed').toLowerCase();
  const remainingScope = extractBulletValue(text, '## Finish Readiness', 'Remaining in-scope work').toLowerCase();
  const remainingBlockers = extractBulletValue(text, '## Finish Readiness', 'Remaining blockers before closeout').toLowerCase();
  const nextPath = canonicalizeNextPath(extractBulletValue(text, '## Verdict', 'Next path'));
  const acLinkedState = evaluateAcLinkedWorksets(path.dirname(qaReportPath));

  if (reviewCompleted !== 'yes') blockers.push('review_incomplete');
  if (freshEvidence && freshEvidence !== 'yes') blockers.push('fresh_evidence_missing');
  if (traceabilityEvidence && traceabilityEvidence !== 'yes') blockers.push('traceability_incomplete');
  if (acceptanceEvidence && acceptanceEvidence !== 'yes') blockers.push('ac_evidence_incomplete');
  if (!acLinkedState.ok) blockers.push(acLinkedState.reason);
  if (remainingScope && remainingScope !== 'none') blockers.push('remaining_scope');
  if (remainingBlockers && remainingBlockers !== 'none') blockers.push('remaining_blockers');
  if (nextPath === 'retry_loop') blockers.push('retry_loop_active');
  if (nextPath === 'resume_later_handoff') blockers.push('handoff_required');

  return blockers;
}

function evaluateAcLinkedWorksets(phaseExecutionDir) {
  const ledger = parseWorksetsYaml(path.join(phaseExecutionDir || '', 'WORKSETS.yaml'));
  if (!ledger.exists || ledger.tasks.length === 0) {
    return { ok: true, reason: 'no_ac_linkage' };
  }
  for (const task of ledger.tasks) {
    if (!task.acceptanceCriterionId) {
      continue;
    }
    const acVerdict = String(task.acVerdict || '').trim().toLowerCase();
    if (['fail', 'failed', 'blocked', 'rejected'].includes(acVerdict)) {
      return { ok: false, reason: 'ac_verdict_failed' };
    }
    if (!['pass', 'passed', 'verified', 'done', 'not_applicable'].includes(acVerdict)) {
      return { ok: false, reason: 'ac_verdict_incomplete' };
    }
    if (acVerdict !== 'not_applicable' && task.verificationEvidence.length === 0) {
      return { ok: false, reason: 'ac_evidence_missing' };
    }
  }
  return { ok: true, reason: 'ok' };
}

function executionRootFromQaReport(qaReportPath) {
  if (!qaReportPath) {
    return '';
  }
  return path.dirname(path.dirname(qaReportPath));
}

function traceabilityArtifactValid(filePath, idPattern) {
  if (!filePath || !fs.existsSync(filePath)) {
    return false;
  }
  const text = fs.readFileSync(filePath, 'utf8');
  return idPattern.test(text) && /\b(implemented|verified|pass|passed|done)\b/i.test(text);
}

function requireTraceabilityArtifacts({ qaReport, violations }) {
  const executionRoot = executionRootFromQaReport(qaReport);
  if (!executionRoot) {
    violations.push(`${qaReport}: cannot resolve execution root for traceability artifacts`);
    return;
  }
  const requirementsPath = path.join(executionRoot, 'REQUIREMENTS_TRACEABILITY.md');
  const scenarioPath = path.join(executionRoot, 'SCENARIO_MATRIX.md');
  if (!traceabilityArtifactValid(requirementsPath, /\bREQ-[A-Za-z0-9_.-]+\b/)) {
    violations.push(`${qaReport}: requirements_traceability_missing: ${path.relative(process.cwd(), requirementsPath)} must exist with verified REQ-* coverage before clean_finish`);
  }
  if (!traceabilityArtifactValid(scenarioPath, /\bSCN-[A-Za-z0-9_.-]+\b/)) {
    violations.push(`${qaReport}: scenario_matrix_missing: ${path.relative(process.cwd(), scenarioPath)} must exist with verified SCN-* coverage before clean_finish`);
  }
}

function deriveReadinessState({
  planDir,
  statusFile,
  masterPlan,
  executionRoot,
  selectedBundles,
  requiredSkills,
  stageOrder,
  sprintContractPath,
  qaReportPath,
  handoffPath,
}) {
  const planningReady = Boolean(
    (planDir || selectedBundles?.length || requiredSkills?.length || stageOrder?.length)
      && (masterPlan || selectedBundles?.length > 0)
  );
  const executionReady = Boolean(
    statusFile
      ? (statusFile && executionRoot && masterPlan)
      : (sprintContractPath && fs.existsSync(sprintContractPath) && qaReportPath && handoffPath)
  );

  return {
    planningReady,
    executionReady,
    planningBasis: planningReady ? (planDir ? 'phase-package' : 'workflow-selection') : 'missing-planning-basis',
    executionBasis: executionReady
      ? (statusFile ? 'phase-runner-dispatch' : 'bounded-artifacts-resolved')
      : (statusFile ? 'dispatch-paths-incomplete' : 'bounded-artifacts-incomplete'),
    phaseAttemptOverride: false,
  };
}

function sectionExists(text, heading) {
  return text.split(/\r?\n/).some((line) => line.trim() === heading);
}

function extractBulletValue(text, heading, label) {
  const lines = text.split(/\r?\n/);
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

function containsPlaceholderText(value) {
  const lowered = String(value || '').toLowerCase();
  return lowered.includes('placeholder') || lowered.includes('fill before') || lowered.includes('first action') || lowered.includes('second action');
}

function isCleanFinishHandoff(text) {
  const required = extractBulletValue(text, '## Status', 'Required');
  return required.toLowerCase() === 'no';
}

const SEMANTIC_TRIGGER_TERMS = [
  'ac ambiguity',
  'scope drift',
  'architecture risk',
  'security risk',
  'auth risk',
  'payment risk',
  'repeated failure',
  'user value unclear',
];

const CONSENSUS_TRIGGER_TERMS = [
  'contract reinterpretation',
  'high-risk security',
  'high-risk architecture',
  'evaluator disagreement',
];

function hasTerm(text, term) {
  return text.toLowerCase().includes(term);
}

export function validateEvaluationTriggerPipelineEvidence(text, artifactPath = 'QA_REPORT.md') {
  const violations = [];
  const normalized = text.toLowerCase();
  const nextPath = canonicalizeNextPath(extractBulletValue(text, '## Verdict', 'Next path'));
  const cleanFinish = nextPath === 'clean_finish';
  const mechanicalFailed = /mechanical (checks?|gate|verification)\s*:\s*(failed|fail|blocked)/i.test(text);
  const semanticCleanPass = /semantic evaluation\s*:\s*(pass|passed|clean_pass|clean pass)/i.test(text);
  const consensusCleanPass = /consensus evaluation\s*:\s*(pass|passed|clean_pass|clean pass)/i.test(text);
  const skippedMechanical = extractBulletValue(text, '## Evaluation Trigger Evidence', 'Skipped mechanical checks')
    || extractBulletValue(text, '## Runtime Updates', 'Skipped mechanical checks');
  const validationProfile = extractBulletValue(text, '## Workflow Execution', 'Validation profile').toLowerCase();

  if (!sectionExists(text, '## Evaluation Trigger Evidence')) {
    return violations;
  }

  for (const term of SEMANTIC_TRIGGER_TERMS) {
    if (!hasTerm(normalized, term)) {
      violations.push(`${artifactPath}: semantic evaluation trigger missing '${term}'`);
    }
  }
  for (const term of CONSENSUS_TRIGGER_TERMS) {
    if (!hasTerm(normalized, term)) {
      violations.push(`${artifactPath}: consensus evaluation trigger missing '${term}'`);
    }
  }

  if (mechanicalFailed && (cleanFinish || semanticCleanPass || consensusCleanPass)) {
    violations.push(`${artifactPath}: mechanical failure cannot be converted into clean semantic or consensus pass`);
  }

  if (cleanFinish && validationProfile && !['prompt_only', 'docs_only'].includes(validationProfile)) {
    const normalizedSkips = skippedMechanical.trim().toLowerCase();
    if (normalizedSkips && !['none', 'no', 'n/a', '[]'].includes(normalizedSkips)) {
      violations.push(`${artifactPath}: skipped mechanical checks are blocking for validation profile ${validationProfile}`);
    }
  }

  if (cleanFinish && /verification override\s*:\s*(unknown|untrusted|not_allowed|blocked)/i.test(text)) {
    violations.push(`${artifactPath}: clean_finish requires verification overrides to be explicitly allowlisted`);
  }

  if (
    cleanFinish
    && /qa backend matrix/i.test(text)
    && /(browser|a11y|visual|performance)[^\n]*\b(required|mandatory)\b[^\n]*\b(missing|unavailable|blocked)\b/i.test(text)
  ) {
    violations.push(`${artifactPath}: missing required QA backend cannot produce clean_finish`);
  }

  return violations;
}

export function validateCloseoutSynchronization({
  qaReportPath,
  scorecardPath,
  handoffPath,
}) {
  const violations = [];
  if (!qaReportPath || !fs.existsSync(qaReportPath)) {
    violations.push('qa_report_missing');
    return violations;
  }

  const qaText = fs.readFileSync(qaReportPath, 'utf8');
  const nextPath = canonicalizeNextPath(extractBulletValue(qaText, '## Verdict', 'Next path'));
  const closeoutReason = canonicalizeCloseoutReason(extractBulletValue(qaText, '## Verdict', 'Closeout reason'));
  const scopeStatus = extractBulletValue(qaText, '## Verdict', 'Scope status').toLowerCase();
  const reviewCompleted = extractBulletValue(qaText, '## Review Checkpoint', 'Review completed').toLowerCase();
  const validationProfile = extractBulletValue(qaText, '## Workflow Execution', 'Validation profile').toLowerCase();
  const acceptanceEvidence = extractBulletValue(qaText, '## Finish Readiness', 'AC evidence confirmed').toLowerCase()
    || extractBulletValue(qaText, '## Finish Readiness', 'Acceptance criteria evidence confirmed').toLowerCase();
  const acLinkedState = evaluateAcLinkedWorksets(path.dirname(qaReportPath));
  const closeoutFieldsPresent = Boolean(
    scopeStatus
      || nextPath
      || closeoutReason
      || extractBulletValue(qaText, '## Finish Readiness', 'Why this round may stop now')
  );

  if (!closeoutFieldsPresent) {
    return violations;
  }

  if (!scorecardPath || !fs.existsSync(scorecardPath)) {
    violations.push(`${qaReportPath}: scorecard_missing_for_closeout_sync`);
    return violations;
  }

  const scoreText = fs.readFileSync(scorecardPath, 'utf8');
  const currentScore = Number.parseInt(extractBulletValue(scoreText, '## Score Summary', 'Current score'), 10);
  const targetScore = Number.parseInt(extractBulletValue(scoreText, '## Score Summary', 'Target score'), 10);
  const unmetItems = Number.parseInt(extractBulletValue(scoreText, '## Score Summary', 'Unmet checklist items'), 10);
  const blockingDefects = Number.parseInt(extractBulletValue(scoreText, '## Score Summary', 'Blocking defects'), 10);
  const scoreVerdict = extractBulletValue(scoreText, '## Score Summary', 'Verdict').toLowerCase();
  const currentTaskStatus = extractBulletValue(scoreText, '## Task-Level Status Adapter', 'Current task status').toUpperCase();

  if (nextPath === 'clean_finish') {
    violations.push(...validateEvaluationTriggerPipelineEvidence(qaText, qaReportPath));
    if (scopeStatus !== 'complete') violations.push(`${qaReportPath}: clean_finish requires Scope status = complete`);
    if (closeoutReason !== 'scope_complete') violations.push(`${qaReportPath}: clean_finish requires Closeout reason = scope_complete`);
    if (reviewCompleted !== 'yes') violations.push(`${qaReportPath}: clean_finish requires Review completed = yes`);
    if (!acLinkedState.ok) violations.push(`${qaReportPath}: clean_finish requires linked AC verdict/evidence to pass (${acLinkedState.reason})`);
    if (acceptanceEvidence && acceptanceEvidence !== 'yes') violations.push(`${qaReportPath}: clean_finish requires AC evidence confirmed = yes`);
    if (scoreVerdict !== 'done') violations.push(`${scorecardPath}: clean_finish requires Verdict = done`);
    if (currentTaskStatus !== 'FULL') violations.push(`${scorecardPath}: clean_finish requires Current task status = FULL`);
    if (!Number.isFinite(currentScore) || !Number.isFinite(targetScore) || currentScore < targetScore) {
      violations.push(`${scorecardPath}: clean_finish requires Current score >= Target score`);
    }
    if (unmetItems !== 0) violations.push(`${scorecardPath}: clean_finish requires Unmet checklist items = 0`);
    if (blockingDefects !== 0) violations.push(`${scorecardPath}: clean_finish requires Blocking defects = 0`);
    if (handoffPath && fs.existsSync(handoffPath)) {
      const handoffText = fs.readFileSync(handoffPath, 'utf8');
      if (!isCleanFinishHandoff(handoffText)) {
        violations.push(`${handoffPath}: clean_finish requires a clean-finish marker with Required: no`);
      }
    }
  } else if (nextPath === 'retry_loop') {
    if (closeoutReason !== 'verification_failed') violations.push(`${qaReportPath}: retry_loop requires Closeout reason = verification_failed`);
    if (scoreVerdict !== 'retry') violations.push(`${scorecardPath}: retry_loop requires Verdict = retry`);
    if (currentTaskStatus === 'FULL') violations.push(`${scorecardPath}: retry_loop cannot report Current task status = FULL`);
    if (Number.isFinite(currentScore) && currentScore > 0) {
      violations.push(`${scorecardPath}: retry_loop requires Current score = 0`);
    }
    if (Number.isFinite(unmetItems) && unmetItems === 0) {
      violations.push(`${scorecardPath}: retry_loop requires Unmet checklist items > 0`);
    }
    if (handoffPath && fs.existsSync(handoffPath)) {
      const handoffText = fs.readFileSync(handoffPath, 'utf8');
      const stopReason = canonicalizeHandoffStopReason(extractBulletValue(handoffText, '## Resume Trigger', 'Stop reason'));
      if (!['blocked', 'interrupted', 'context_limit', 'user_pause', 'deferred_verification'].includes(stopReason)) {
        violations.push(`${handoffPath}: retry_loop requires a valid handoff stop reason when a handoff is written`);
      }
    }
  }

  return violations;
}

function isWorkflowArtifact(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized === '.claude/docs/phase-status.yaml') return true;
  if (normalized.startsWith('.claude/logs/agent-loop/')) return true;
  if (normalized.startsWith('.claude/logs/workflow-enforcement/')) return true;
  return normalized.includes('/execution/') && (
    normalized.endsWith('/SPRINT_CONTRACT.md') ||
    normalized.endsWith('/GOAL_CONTRACT.yaml') ||
    normalized.endsWith('/QA_REPORT.md') ||
    normalized.endsWith('/HANDOFF.md') ||
    normalized.endsWith('/SCORECARD.md')
  );
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

function normalizeWorkflowPath(filePath) {
  const raw = String(filePath || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!raw) {
    return '';
  }
  const resolved = path.resolve(raw);
  const relative = path.relative(process.cwd(), resolved).replace(/\\/g, '/');
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    return relative.replace(/^\.\//, '');
  }
  return raw;
}

function isImplementationArchiveArtifact(filePath) {
  return normalizeWorkflowPath(filePath).includes('/archive/');
}

function activeExecutionRootFromDispatch(payload) {
  const directRoot = normalizeWorkflowPath(payload?.executionRoot || payload?.phaseRunLease?.executionRoot || '');
  return directRoot.replace(/\/$/, '');
}

function isPreparedDispatchEvidence(payload) {
  return payload?.status === 'prepared'
    || payload?.activeExecutionStatus === 'prepared'
    || payload?.phaseRunLease?.status === 'prepared'
    || payload?.phaseRunLease?.currentStage === 'prepared';
}

function scopeWorkflowArtifactFiles(files, { activeExecutionRoot = '' } = {}) {
  const normalizedActiveRoot = normalizeWorkflowPath(activeExecutionRoot).replace(/\/$/, '');
  return files.filter((filePath) => {
    if (!isWorkflowArtifact(filePath)) {
      return true;
    }
    const normalized = normalizeWorkflowPath(filePath);
    if (isImplementationArchiveArtifact(normalized)) {
      return false;
    }
    if (!normalizedActiveRoot) {
      return true;
    }
    if (normalized === '.claude/docs/phase-status.yaml') {
      return true;
    }
    if (normalized.startsWith('.claude/logs/')) {
      return true;
    }
    if (normalized.includes('/execution/')) {
      return normalized === normalizedActiveRoot || normalized.startsWith(`${normalizedActiveRoot}/`);
    }
    return true;
  });
}

const REQUIRED_GOAL_CONTRACT_FIELDS = [
  'schemaVersion',
  'snapshotId',
  'objective',
  'scope',
  'nonGoals',
  'constraints',
  'acceptanceCriteria',
  'exitConditions',
  'brownfieldContext',
  'provenance',
];

function hasYamlField(text, fieldName) {
  return new RegExp(`^${fieldName}:`, 'm').test(String(text || ''));
}

function sprintContractRequiresGoalContract(text) {
  const lowered = String(text || '').toLowerCase();
  return lowered.includes('source plan requirements snapshot')
    && !lowered.includes('goal contract not required');
}

function validateGoalContractForSprint(sprintContract, sprintText) {
  const violations = [];
  if (!sprintContractRequiresGoalContract(sprintText)) {
    return violations;
  }

  const sprintDir = path.dirname(sprintContract);
  const goalContractPath = path.join(sprintDir, 'GOAL_CONTRACT.yaml');
  const embeddedGoalContract = /\bgoalContract\s*:/i.test(sprintText);
  if (!fs.existsSync(goalContractPath) && !embeddedGoalContract) {
    violations.push(`${sprintContract}: missing_goal_contract: non-trivial phase package requires GOAL_CONTRACT.yaml or embedded goalContract block`);
    return violations;
  }

  const goalText = fs.existsSync(goalContractPath) ? fs.readFileSync(goalContractPath, 'utf8') : sprintText;
  for (const fieldName of REQUIRED_GOAL_CONTRACT_FIELDS) {
    if (!hasYamlField(goalText, fieldName)) {
      violations.push(`${goalContractPath}: missing required Goal Contract field '${fieldName}'`);
    }
  }
  if (!/\bsnapshotId:\s*["']?goal-contract-[A-Za-z0-9_.-]+/i.test(goalText)) {
    violations.push(`${goalContractPath}: snapshotId must be stable and start with 'goal-contract-'`);
  }
  if (!/\bsourceArtifacts:\s*(?:\r?\n\s*-\s+|[\["'])/i.test(goalText)) {
    violations.push(`${goalContractPath}: provenance.sourceArtifacts must identify source artifacts`);
  }

  return violations;
}

function recordDispatch(argv) {
  const options = parseArgs(argv, {
    '--plan-dir': { key: 'planDir' },
    '--execution-mode': { key: 'executionMode' },
    '--execution-root': { key: 'executionRoot' },
    '--runtime': { key: 'runtime' },
    '--status-file': { key: 'statusFile' },
    '--master-plan': { key: 'masterPlan' },
  });

  if (!options.planDir || !options.executionMode || !options.executionRoot || !options.runtime) {
    throw new Error('record-dispatch requires --plan-dir, --execution-mode, --execution-root, and --runtime');
  }

  fs.mkdirSync(WORKFLOW_LOG_DIR, { recursive: true });
  const effortProfile = process.env.PHASE_DISPATCH_EFFORT_PROFILE || process.env.MOONSHOT_EFFORT_PROFILE || 'standard';
  const modelRoute = resolveModelRoute({
    runtime: options.runtime,
    stage: 'phase_implementation',
    profile: effortProfile,
  });
  const runtimeCapabilityStatus = buildRuntimeCapabilityStatus(options.runtime);
  const compactStatus = buildCompactStatusReadModel({
    planDir: options.planDir,
    statusFile: options.statusFile || STATUS_FILE_DEFAULT,
    masterPlan: options.masterPlan || '',
    executionRoot: options.executionRoot,
    runtime: options.runtime,
    suppressSelfWriteMissingWarnings: true,
  });
  const resumeBrief = buildResumeBrief(compactStatus);
  const payload = {
    evidenceVersion: '1.0',
    recordedAt: utcTimestamp(),
    source: 'moonshot-phase-dispatch',
    publicEntrypoint: 'moonshot-phase-runner',
    planDir: options.planDir,
    statusFile: options.statusFile || STATUS_FILE_DEFAULT,
    masterPlan: options.masterPlan || '',
    executionMode: options.executionMode,
    executionRoot: options.executionRoot,
    runtime: options.runtime,
    selectedBundles: [
      'ready-isolate-bundle',
      'implementation-bundle',
      'review-bundle',
      'verification-bundle',
      'finish-bundle',
    ],
    requiredSkills: [
      'moonshot-phase-runner',
      'moonshot-phase-executor',
      'implementation-runner',
      'codex-review-code',
      'code-simplifier',
      'completion-verifier',
      'doc-auto-sync',
      'session-logger',
    ],
    stageOrder: [
      'ready/isolate',
      'execute',
      'review',
      'verify',
      'finish/handoff',
    ],
    selectedHarnessComponents: [
      'phase-runner',
      'contract',
      'implementation',
      'review',
      'verification',
      'finish',
    ],
    skippedHarnessComponents: [],
    selectionReason: 'phase-based work uses the full cross-runtime harness by default',
    runtimeIsolation: options.runtime === 'codex'
      ? 'codex delegated-terminal; fresh review/verify attempts preferred'
      : 'claude-code adapter; Task/fork review and verification preferred',
    modelEffortProfile: effortProfile,
    effortEscalationReason: process.env.PHASE_DISPATCH_EFFORT_ESCALATION_REASON
      || process.env.MOONSHOT_EFFORT_ESCALATION_REASON
      || defaultEffortEscalationReason(effortProfile),
    selectedModelProvider: modelRoute.provider,
    selectedModel: modelRoute.model || 'runtime-default',
    selectedModelEffort: modelRoute.effort || 'runtime-default',
    modelSelectionReason: modelRoute.selectionReason,
    retrievalBudget: process.env.PHASE_RETRIEVAL_BUDGET || process.env.MOONSHOT_RETRIEVAL_BUDGET || DEFAULT_RETRIEVAL_BUDGET,
    validationProfile: process.env.PHASE_VALIDATION_PROFILE || process.env.MOONSHOT_VALIDATION_PROFILE || DEFAULT_VALIDATION_PROFILE,
    phaseReplayPolicy: process.env.PHASE_REPLAY_POLICY || process.env.MOONSHOT_PHASE_REPLAY_POLICY || DEFAULT_PHASE_REPLAY_POLICY,
    runtimeCapabilityStatus,
    compactStatus,
    resumeBrief,
    status: 'prepared',
    completionStatus: 'prepared',
    recoveryStatus: 'none',
    completionPath: 'prepared-dispatch',
    rawStopReason: '',
    rawStopReasonCode: '',
    recoveryAction: 'none',
    normalizedRunVerdict: 'prepared',
    stopReasonClass: '',
    blockingStopReasonCode: '',
    recoveryEvents: [],
    residualFailures: [],
    notes: [
      'Large or phase-based work must enter through moonshot-phase-runner.',
      'Meaningful code changes require review evidence before verification and completion.',
      'Finish or handoff can only begin after review and verification reach a stable state.',
      'Incomplete phase stops require session-logger evidence in handoff artifacts.',
    ],
  };

  const stamp = stampTimestamp();
  const logFile = path.join(WORKFLOW_LOG_DIR, `dispatch-${stamp}.json`);
  const latestFile = path.join(WORKFLOW_LOG_DIR, 'latest-dispatch.json');
  for (const target of [logFile, latestFile]) {
    fs.writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  }

  writeCurrentRunState({
    source: 'workflow-enforcement.record-dispatch',
    workflowKind: 'phase-dispatch',
    completionStatus: 'prepared',
    recoveryStatus: 'none',
    completionPath: 'prepared-dispatch',
    rawStopReason: '',
    rawStopReasonCode: '',
    recoveryAction: 'none',
    normalizedRunVerdict: 'prepared',
    stopReasonClass: '',
    blockingStopReasonCode: '',
    recoveryEvents: [],
    residualFailures: [],
    currentStage: 'ready/isolate',
    planDir: options.planDir,
    statusFile: options.statusFile || STATUS_FILE_DEFAULT,
    masterPlan: options.masterPlan || '',
    executionMode: options.executionMode,
    executionRoot: options.executionRoot,
    runtime: options.runtime,
    selectedBundles: payload.selectedBundles,
    requiredSkills: payload.requiredSkills,
    stageOrder: payload.stageOrder,
    appliedSkills: [],
    skippedSkills: [],
    selectedHarnessComponents: payload.selectedHarnessComponents,
    skippedHarnessComponents: payload.skippedHarnessComponents,
    selectionReason: payload.selectionReason,
    runtimeIsolation: payload.runtimeIsolation,
    modelEffortProfile: payload.modelEffortProfile,
    effortEscalationReason: payload.effortEscalationReason,
    selectedModelProvider: payload.selectedModelProvider,
    selectedModel: payload.selectedModel,
    selectedModelEffort: payload.selectedModelEffort,
    modelSelectionReason: payload.modelSelectionReason,
    retrievalBudget: payload.retrievalBudget,
    validationProfile: payload.validationProfile,
    phaseReplayPolicy: payload.phaseReplayPolicy,
    runtimeCapabilityStatus,
    compactStatus,
    resumeBrief,
    readiness: deriveReadinessState({
      planDir: options.planDir,
      statusFile: options.statusFile || STATUS_FILE_DEFAULT,
      masterPlan: options.masterPlan || '',
      executionRoot: options.executionRoot,
      selectedBundles: payload.selectedBundles,
      requiredSkills: payload.requiredSkills,
      stageOrder: payload.stageOrder,
    }),
    completion: {
      state: 'prepared',
      closeoutStatus: 'active',
      blockers: [],
    },
    evidenceFiles: {
      dispatch: latestFile,
      bounded: null,
    },
  });

  const statusFile = options.statusFile || STATUS_FILE_DEFAULT;
  if (fs.existsSync(statusFile)) {
    const lines = fs.readFileSync(statusFile, 'utf8').split(/\r?\n/);
    const updates = {
      lastDispatchAt: `"${payload.recordedAt}"`,
      workflowEvidenceFile: `"${latestFile}"`,
      workflowSelectedBundles: '"ready-isolate-bundle,implementation-bundle,review-bundle,verification-bundle,finish-bundle"',
      workflowRequiredSkills: '"moonshot-phase-runner,moonshot-phase-executor,implementation-runner,codex-review-code,code-simplifier,completion-verifier,doc-auto-sync,session-logger"',
    };
    let insertAt = lines.findIndex((line) => line.startsWith('phases:'));
    if (insertAt === -1) {
      insertAt = lines.length;
    }
    for (const [key, value] of Object.entries(updates)) {
      const prefix = `${key}:`;
      const index = lines.findIndex((line) => line.startsWith(prefix));
      if (index >= 0) {
        lines[index] = `${prefix} ${value}`;
      } else {
        lines.splice(insertAt, 0, `${prefix} ${value}`);
        insertAt += 1;
      }
    }
    fs.writeFileSync(statusFile, `${lines.join('\n')}\n`, 'utf8');
  }

  console.log(`Workflow enforcement dispatch recorded: ${logFile}`);
}

function recordBounded(argv) {
  const options = parseArgs(argv, {
    '--analysis-path': { key: 'analysisPath' },
    '--qa-report-path': { key: 'qaReportPath' },
    '--handoff-path': { key: 'handoffPath' },
    '--sprint-contract-path': { key: 'sprintContractPath' },
  });
  if (!options.analysisPath) {
    throw new Error('record-bounded requires --analysis-path');
  }

  fs.mkdirSync(WORKFLOW_LOG_DIR, { recursive: true });
  const analysisPath = options.analysisPath;
  const qaReportPath = options.qaReportPath || '';
  const handoffPath = options.handoffPath || '';
  const sprintContractPath = options.sprintContractPath || '';
  let selectedBundles = [
    'analysis-bundle',
    'ready-isolate-bundle',
    'implementation-bundle',
    'review-bundle',
    'verification-bundle',
    'finish-bundle',
  ];
  const requiredSkills = [
    'implementation-runner',
    'codex-review-code',
    'code-simplifier',
    'completion-verifier',
    'doc-auto-sync',
    'session-logger',
  ];
  const stageOrder = [
    'plan',
    'ready/isolate',
    'execute',
    'review',
    'verify',
    'finish/handoff',
  ];

  let existingWorkflow = {};
  if (fs.existsSync(analysisPath)) {
    const parsed = parseSimpleYaml(fs.readFileSync(analysisPath, 'utf8'));
    if (parsed.workflowEvidence && typeof parsed.workflowEvidence === 'object' && !Array.isArray(parsed.workflowEvidence)) {
      existingWorkflow = parsed.workflowEvidence;
    }
  }

  let appliedSkills = Array.isArray(existingWorkflow.appliedSkills) ? existingWorkflow.appliedSkills : [
    'implementation-runner',
    'completion-verifier',
  ];
  let skippedSkills = Array.isArray(existingWorkflow.skippedSkills) ? existingWorkflow.skippedSkills : [
    'codex-review-code (not evaluated yet)',
    'code-simplifier (not evaluated yet)',
    'doc-auto-sync (not evaluated yet)',
    'session-logger (clean completion path)',
  ];
  let selectedHarnessComponents = Array.isArray(existingWorkflow.selectedHarnessComponents) ? existingWorkflow.selectedHarnessComponents : [
    'contract',
    'implementation',
    'review',
    'verification',
    'finish',
  ];
  let skippedHarnessComponents = Array.isArray(existingWorkflow.skippedHarnessComponents) ? existingWorkflow.skippedHarnessComponents : [
    'phase-runner (bounded-direct path)',
  ];
  let selectionReason = typeof existingWorkflow.selectionReason === 'string' && existingWorkflow.selectionReason.trim()
    ? existingWorkflow.selectionReason
    : 'bounded-direct default requires contract, review, verification, and finish evidence';
  let runtimeIsolation = typeof existingWorkflow.runtimeIsolation === 'string' && existingWorkflow.runtimeIsolation.trim()
    ? existingWorkflow.runtimeIsolation
    : 'runtime-adapter; isolated review/verify preferred, documented fallback allowed';
  let modelEffortProfile = typeof existingWorkflow.modelEffortProfile === 'string' && existingWorkflow.modelEffortProfile.trim()
    ? existingWorkflow.modelEffortProfile
    : (process.env.WORKFLOW_EFFORT_PROFILE || process.env.MOONSHOT_EFFORT_PROFILE || 'standard');
  let effortEscalationReason = typeof existingWorkflow.effortEscalationReason === 'string' && existingWorkflow.effortEscalationReason.trim()
    ? existingWorkflow.effortEscalationReason
    : (process.env.WORKFLOW_EFFORT_ESCALATION_REASON || process.env.MOONSHOT_EFFORT_ESCALATION_REASON || defaultEffortEscalationReason(modelEffortProfile));
  const defaultModelRoute = resolveModelRoute({
    runtime: process.env.WORKFLOW_RUNTIME || process.env.PHASE_WORK_RUNTIME || 'auto',
    stage: 'phase_implementation',
    profile: modelEffortProfile,
  });
  let selectedModelProvider = typeof existingWorkflow.selectedModelProvider === 'string' && existingWorkflow.selectedModelProvider.trim()
    ? existingWorkflow.selectedModelProvider
    : (process.env.WORKFLOW_SELECTED_MODEL_PROVIDER || process.env.PHASE_SELECTED_MODEL_PROVIDER || defaultModelRoute.provider);
  let selectedModel = typeof existingWorkflow.selectedModel === 'string' && existingWorkflow.selectedModel.trim()
    ? existingWorkflow.selectedModel
    : (process.env.WORKFLOW_SELECTED_MODEL || process.env.PHASE_SELECTED_MODEL || defaultModelRoute.model || 'runtime-default');
  let selectedModelEffort = typeof existingWorkflow.selectedModelEffort === 'string' && existingWorkflow.selectedModelEffort.trim()
    ? existingWorkflow.selectedModelEffort
    : (process.env.WORKFLOW_SELECTED_MODEL_EFFORT || process.env.PHASE_SELECTED_MODEL_EFFORT || defaultModelRoute.effort || 'runtime-default');
  let modelSelectionReason = typeof existingWorkflow.modelSelectionReason === 'string' && existingWorkflow.modelSelectionReason.trim()
    ? existingWorkflow.modelSelectionReason
    : (process.env.WORKFLOW_MODEL_SELECTION_REASON || process.env.PHASE_MODEL_SELECTION_REASON || defaultModelRoute.selectionReason);
  let retrievalBudget = typeof existingWorkflow.retrievalBudget === 'string' && existingWorkflow.retrievalBudget.trim()
    ? existingWorkflow.retrievalBudget
    : (process.env.WORKFLOW_RETRIEVAL_BUDGET || process.env.MOONSHOT_RETRIEVAL_BUDGET || DEFAULT_RETRIEVAL_BUDGET);
  let validationProfile = typeof existingWorkflow.validationProfile === 'string' && existingWorkflow.validationProfile.trim()
    ? existingWorkflow.validationProfile
    : (process.env.WORKFLOW_VALIDATION_PROFILE || process.env.MOONSHOT_VALIDATION_PROFILE || DEFAULT_VALIDATION_PROFILE);
  let phaseReplayPolicy = typeof existingWorkflow.phaseReplayPolicy === 'string' && existingWorkflow.phaseReplayPolicy.trim()
    ? existingWorkflow.phaseReplayPolicy
    : (process.env.WORKFLOW_PHASE_REPLAY_POLICY || process.env.MOONSHOT_PHASE_REPLAY_POLICY || DEFAULT_PHASE_REPLAY_POLICY);
  const boundedRuntime = process.env.WORKFLOW_RUNTIME || process.env.PHASE_WORK_RUNTIME || 'auto';

  if (qaReportPath && fs.existsSync(qaReportPath)) {
    const section = extractWorkflowSection(fs.readFileSync(qaReportPath, 'utf8'));
    if (section.selected) selectedBundles = parseListString(section.selected);
    if (section.applied) appliedSkills = parseListString(section.applied);
    if (section.skipped) skippedSkills = parseListString(section.skipped);
    if (section.selectedHarnessComponents) selectedHarnessComponents = parseListString(section.selectedHarnessComponents);
    if (section.skippedHarnessComponents) skippedHarnessComponents = parseListString(section.skippedHarnessComponents);
    if (section.selectionReason) selectionReason = section.selectionReason;
    if (section.runtimeIsolation) runtimeIsolation = section.runtimeIsolation;
    if (section.modelEffortProfile) modelEffortProfile = section.modelEffortProfile;
    if (section.effortEscalationReason) effortEscalationReason = section.effortEscalationReason;
    if (section.selectedModelProvider) selectedModelProvider = section.selectedModelProvider;
    if (section.selectedModel) selectedModel = section.selectedModel;
    if (section.selectedModelEffort) selectedModelEffort = section.selectedModelEffort;
    if (section.modelSelectionReason) modelSelectionReason = section.modelSelectionReason;
    if (section.retrievalBudget) retrievalBudget = section.retrievalBudget;
    if (section.validationProfile) validationProfile = section.validationProfile;
    if (section.phaseReplayPolicy) phaseReplayPolicy = section.phaseReplayPolicy;
  }

  const completionState = deriveCompletionStatusFromQaReport(qaReportPath);
  const completionBlockers = deriveCompletionBlockersFromQaReport(qaReportPath);
  const closeoutStatus = deriveCloseoutStatusFromCompletionStatus(completionState);
  const readiness = deriveReadinessState({
    selectedBundles,
    requiredSkills,
    stageOrder,
    sprintContractPath,
    qaReportPath,
    handoffPath,
  });
  const qaText = qaReportPath && fs.existsSync(qaReportPath) ? fs.readFileSync(qaReportPath, 'utf8') : '';
  const runtimeCapabilityStatus = buildRuntimeCapabilityStatus(boundedRuntime);
  const compactStatus = buildCompactStatusReadModel({
    planDir: '',
    statusFile: '',
    masterPlan: '',
    executionRoot: '',
    runtime: boundedRuntime,
    sprintContractPath,
    qaReportPath,
    latestVerdictFile: extractBulletValue(qaText, '## Runtime Updates', 'Verification verdict file'),
  });
  const resumeBrief = buildResumeBrief(compactStatus);

  const workflowBlock = [
    'workflowEvidence:',
    `  mode: ${yamlScalar('bounded-direct')}`,
    '  selectedBundles:',
    ...selectedBundles.map((item) => `    - ${yamlScalar(item)}`),
    '  requiredSkills:',
    ...requiredSkills.map((item) => `    - ${yamlScalar(item)}`),
    '  stageOrder:',
    ...stageOrder.map((item) => `    - ${yamlScalar(item)}`),
    '  appliedSkills:',
    ...appliedSkills.map((item) => `    - ${yamlScalar(item)}`),
    '  skippedSkills:',
    ...skippedSkills.map((item) => `    - ${yamlScalar(item)}`),
    '  selectedHarnessComponents:',
    ...selectedHarnessComponents.map((item) => `    - ${yamlScalar(item)}`),
    '  skippedHarnessComponents:',
    ...skippedHarnessComponents.map((item) => `    - ${yamlScalar(item)}`),
    `  selectionReason: ${yamlScalar(selectionReason)}`,
    `  runtimeIsolation: ${yamlScalar(runtimeIsolation)}`,
    `  modelEffortProfile: ${yamlScalar(modelEffortProfile)}`,
    `  effortEscalationReason: ${yamlScalar(effortEscalationReason)}`,
    `  selectedModelProvider: ${yamlScalar(selectedModelProvider)}`,
    `  selectedModel: ${yamlScalar(selectedModel)}`,
    `  selectedModelEffort: ${yamlScalar(selectedModelEffort)}`,
    `  modelSelectionReason: ${yamlScalar(modelSelectionReason)}`,
    `  retrievalBudget: ${yamlScalar(retrievalBudget)}`,
    `  validationProfile: ${yamlScalar(validationProfile)}`,
    `  phaseReplayPolicy: ${yamlScalar(phaseReplayPolicy)}`,
    '  evidenceFiles:',
    `    analysisContext: ${yamlScalar(analysisPath)}`,
    `    sprintContract: ${yamlScalar(sprintContractPath)}`,
    `    qaReport: ${yamlScalar(qaReportPath)}`,
    `    handoff: ${yamlScalar(handoffPath)}`,
  ];

  const readinessBlock = [
    'readiness:',
    `  planningReady: ${readiness.planningReady ? 'true' : 'false'}`,
    `  executionReady: ${readiness.executionReady ? 'true' : 'false'}`,
    `  planningBasis: ${yamlScalar(readiness.planningBasis)}`,
    `  executionBasis: ${yamlScalar(readiness.executionBasis)}`,
    `  phaseAttemptOverride: ${readiness.phaseAttemptOverride ? 'true' : 'false'}`,
  ];

  const completionBlock = [
    'completionModel:',
    `  state: ${yamlScalar(completionState)}`,
    `  closeoutStatus: ${yamlScalar(closeoutStatus)}`,
    `  currentStage: ${yamlScalar(stageOrder.at(-1) || 'finish/handoff')}`,
    ...(completionBlockers.length > 0
      ? ['  blockers:', ...completionBlockers.map((item) => `    - ${yamlScalar(item)}`)]
      : ['  blockers: []']),
  ];

  let lines = fs.existsSync(analysisPath)
    ? fs.readFileSync(analysisPath, 'utf8').split(/\r?\n/)
    : ['schemaVersion: "1.0"'];
  if (!fs.existsSync(analysisPath)) {
    fs.mkdirSync(path.dirname(analysisPath), { recursive: true });
  }
  lines = upsertTopLevelYamlBlock(lines, 'workflowEvidence', workflowBlock);
  lines = upsertTopLevelYamlBlock(lines, 'readiness', readinessBlock);
  lines = upsertTopLevelYamlBlock(lines, 'completionModel', completionBlock);
  fs.writeFileSync(analysisPath, `${lines.join('\n')}\n`, 'utf8');

  const payload = {
    evidenceVersion: '1.0',
    recordedAt: utcTimestamp(),
    source: 'moonshot-orchestrator',
    mode: 'bounded-direct',
    analysisPath,
    sprintContractPath,
    qaReportPath,
    handoffPath,
    selectedBundles,
    requiredSkills,
    stageOrder,
    appliedSkills,
    skippedSkills,
    selectedHarnessComponents,
    skippedHarnessComponents,
    selectionReason,
    runtimeIsolation,
    modelEffortProfile,
    effortEscalationReason,
    selectedModelProvider,
    selectedModel,
    selectedModelEffort,
    modelSelectionReason,
    retrievalBudget,
    validationProfile,
    phaseReplayPolicy,
    runtimeCapabilityStatus,
    compactStatus,
    resumeBrief,
    readiness,
    completion: {
      state: completionState,
      closeoutStatus,
      blockers: completionBlockers,
      rawStopReason: '',
      rawStopReasonCode: '',
      recoveryAction: completionState === 'complete' ? 'none' : 'continue',
      normalizedRunVerdict: completionState === 'complete' ? 'success' : completionState,
      stopReasonClass: completionState === 'complete' ? 'clean_complete' : completionState,
    },
    evidenceFiles: {
      analysisContext: analysisPath,
      sprintContract: sprintContractPath || null,
      qaReport: qaReportPath || null,
      handoff: handoffPath || null,
    },
  };
  const logFile = path.join(WORKFLOW_LOG_DIR, 'latest-bounded.json');
  fs.writeFileSync(logFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

  writeCurrentRunState({
    source: 'workflow-enforcement.record-bounded',
    workflowKind: 'bounded-direct',
    completionStatus: completionState,
    rawStopReason: '',
    rawStopReasonCode: '',
    recoveryAction: completionState === 'complete' ? 'none' : 'continue',
    normalizedRunVerdict: completionState === 'complete' ? 'success' : completionState,
    stopReasonClass: completionState === 'complete' ? 'clean_complete' : completionState,
    currentStage: stageOrder.at(-1) || 'finish/handoff',
    planDir: null,
    statusFile: null,
    masterPlan: null,
    executionMode: null,
    executionRoot: null,
    runtime: null,
    selectedBundles,
    requiredSkills,
    stageOrder,
    appliedSkills,
    skippedSkills,
    selectedHarnessComponents,
    skippedHarnessComponents,
    selectionReason,
    runtimeIsolation,
    modelEffortProfile,
    effortEscalationReason,
    selectedModelProvider,
    selectedModel,
    selectedModelEffort,
    modelSelectionReason,
    retrievalBudget,
    validationProfile,
    phaseReplayPolicy,
    runtimeCapabilityStatus,
    compactStatus,
    resumeBrief,
    readiness,
    completion: {
      state: completionState,
      closeoutStatus,
      blockers: completionBlockers,
    },
    evidenceFiles: {
      dispatch: fs.existsSync(path.join(WORKFLOW_LOG_DIR, 'latest-dispatch.json')) ? path.join(WORKFLOW_LOG_DIR, 'latest-dispatch.json') : null,
      bounded: logFile,
      analysisContext: analysisPath,
      sprintContract: sprintContractPath || null,
      qaReport: qaReportPath || null,
      handoff: handoffPath || null,
    },
  });
  console.log(`Workflow enforcement bounded evidence recorded: ${logFile}`);
}

function verifyEnforcement(argv) {
  const latestDispatch = path.join(WORKFLOW_LOG_DIR, 'latest-dispatch.json');
  const latestBounded = path.join(WORKFLOW_LOG_DIR, 'latest-bounded.json');
  const latestDispatchPayload = readJsonIfExists(latestDispatch);
  const preparedDispatchEvidence = isPreparedDispatchEvidence(latestDispatchPayload);
  const rawFiles = collectCandidateFiles(argv);
  const files = scopeWorkflowArtifactFiles(rawFiles, {
    activeExecutionRoot: activeExecutionRootFromDispatch(latestDispatchPayload),
  });
  const forceTrace = String(process.env.WORKFLOW_ENFORCEMENT_REQUIRE_TRACE || '').toLowerCase() === 'true';
  const normalizedFiles = files.map((item) => item.replace(/\\/g, '/'));
  const analysisFiles = files.filter((filePath, index) => normalizedFiles[index] === '.claude/docs/moonshot-analysis.yaml' || normalizedFiles[index].endsWith('/moonshot-analysis.yaml'));
  const sprintContracts = files.filter((filePath) => filePath.endsWith('/SPRINT_CONTRACT.md') || filePath.endsWith('\\SPRINT_CONTRACT.md'));
  const qaReports = files.filter((filePath) => filePath.endsWith('/QA_REPORT.md') || filePath.endsWith('\\QA_REPORT.md'));
  const handoffs = files.filter((filePath) => filePath.endsWith('/HANDOFF.md') || filePath.endsWith('\\HANDOFF.md'));
  const requiresPhaseTrace = files.some((filePath) => isWorkflowArtifact(filePath));
  const requiresBoundedTrace = analysisFiles.length > 0;
  const requiresTrace = forceTrace || requiresPhaseTrace || requiresBoundedTrace;
  const codeChangeDetected = rawFiles.some((filePath) => isCodeChangingPath(filePath));
  const violations = [];

  if (!requiresTrace) {
    console.log('Workflow enforcement: not applicable');
    return;
  }

  if (requiresPhaseTrace) {
    if (!fs.existsSync(latestDispatch)) {
      violations.push('missing latest dispatch evidence at .claude/logs/workflow-enforcement/latest-dispatch.json');
    } else {
      const payload = latestDispatchPayload || {};
      if (!preparedDispatchEvidence) {
        violations.push(...validateRuntimeReadModels(payload, latestDispatch));
      }
      const requiredDispatchKeys = preparedDispatchEvidence
        ? ['planDir', 'executionRoot']
        : ['planDir', 'executionMode', 'executionRoot', 'runtime'];
      for (const key of requiredDispatchKeys) {
        if (!payload[key]) {
          violations.push(`dispatch evidence missing '${key}'`);
        }
      }
      if (!preparedDispatchEvidence) {
        for (const key of ['selectedBundles', 'requiredSkills', 'stageOrder', 'selectedHarnessComponents']) {
          if (!Array.isArray(payload[key]) || payload[key].length === 0) {
            violations.push(`dispatch evidence missing non-empty '${key}'`);
          }
        }
        for (const key of [
          'selectionReason',
          'runtimeIsolation',
          'modelEffortProfile',
          'effortEscalationReason',
          'selectedModelProvider',
          'selectedModel',
          'selectedModelEffort',
          'modelSelectionReason',
          'retrievalBudget',
          'validationProfile',
          'phaseReplayPolicy',
        ]) {
          if (typeof payload[key] !== 'string' || !payload[key].trim()) {
            violations.push(`dispatch evidence missing '${key}'`);
          }
        }
        if (effortEscalationMissing(payload.modelEffortProfile, payload.effortEscalationReason)) {
          violations.push('dispatch evidence must explain deep/max effort escalation');
        }
        for (const bundle of ['review-bundle', 'verification-bundle', 'finish-bundle']) {
          if (!payload.selectedBundles?.includes(bundle)) {
            violations.push(`dispatch evidence must include '${bundle}' in selectedBundles`);
          }
        }
      }
    }

    if (qaReports.length === 0) {
      violations.push('workflow trace required but no QA_REPORT.md change detected');
    }

    const statusSummary = parsePhaseStatusSummary(STATUS_FILE_DEFAULT);
    const authoritativeCloseout = authoritativePlanCloseoutPassed(statusSummary);
    if (statusSummary) {
      const actionableRemaining = Number.isNaN(statusSummary.activeActionablePhasesRemaining)
        ? -1
        : statusSummary.activeActionablePhasesRemaining;
      if (statusSummary.activeExecutionStatus === 'finished' && actionableRemaining > 0) {
        violations.push(`${STATUS_FILE_DEFAULT}: activeExecutionStatus=finished is invalid while actionable phases remain (${actionableRemaining})`);
      }
      if (actionableRemaining > 0 && PLAN_SUCCESS_STOP_REASON_CODES.has(statusSummary.lastStopReasonCode)) {
        violations.push(`${STATUS_FILE_DEFAULT}: plan-level success stop reason '${statusSummary.lastStopReasonCode}' is invalid while actionable phases remain`);
      }
    }

    const ledgerPath = defaultPhaseEventLedgerPath(STATUS_FILE_DEFAULT);
    const ledger = readPhaseEvents(ledgerPath);
    for (const entry of ledger.errors) {
      violations.push(`${path.relative(process.cwd(), ledgerPath)} line ${entry.line}: invalid phase event ledger entry (${entry.errors.join('; ')})`);
    }

    if (authoritativeCloseout) {
      console.log('Workflow Enforcement Check');
      console.log(`Applicable: ${requiresTrace ? 'yes' : 'no'}`);
      console.log(`Phase dispatch evidence: ${fs.existsSync(latestDispatch) ? latestDispatch : 'missing'}`);
      console.log(`Bounded evidence: ${fs.existsSync(latestBounded) ? latestBounded : 'missing'}`);
      console.log(`Sprint contracts checked: ${sprintContracts.length}`);
      console.log(`QA reports checked: ${qaReports.length}`);
      console.log(`Handoffs checked: ${handoffs.length}`);
      console.log(`Analysis files checked: ${analysisFiles.length}`);
      console.log('Canonical phase closeout: pass');
      console.log('Violations: 0');
      return;
    }

    for (const sprintContract of sprintContracts) {
      if (!fs.existsSync(sprintContract)) {
        violations.push(`missing sprint contract: ${sprintContract}`);
        continue;
      }
      const text = fs.readFileSync(sprintContract, 'utf8');
      for (const heading of ['## Source Plan Requirements Snapshot', '## Spec Deviation Ledger', '## Stage Order', '## Review Cadence', '## Finish Rule']) {
        if (!sectionExists(text, heading)) {
          violations.push(`${sprintContract}: missing '${heading}' section`);
        }
      }
      violations.push(...validateGoalContractForSprint(sprintContract, text));
    }

    for (const qaReport of qaReports) {
      if (!fs.existsSync(qaReport)) {
        violations.push(`missing QA report: ${qaReport}`);
        continue;
      }
      const text = fs.readFileSync(qaReport, 'utf8');
      for (const heading of ['## Review Checkpoint', '## Finish Readiness']) {
        if (!sectionExists(text, heading)) {
          violations.push(`${qaReport}: missing '${heading}' section`);
        }
      }
      if (!sectionExists(text, '## Plan Conformance Review')) {
        violations.push(`${qaReport}: missing '## Plan Conformance Review' section`);
      }
      if (preparedDispatchEvidence) {
        continue;
      }
      const section = extractWorkflowSection(text);
      if (Object.keys(section).length === 0) {
        violations.push(`${qaReport}: missing '## Workflow Execution' section`);
        continue;
      }
      for (const [key, label] of [
        ['selected', 'Selected bundles'],
        ['applied', 'Applied skills'],
        ['skipped', 'Skipped skills'],
        ['selectedHarnessComponents', 'Selected harness components'],
        ['skippedHarnessComponents', 'Skipped harness components'],
        ['selectionReason', 'Selection reason'],
        ['runtimeIsolation', 'Runtime isolation'],
        ['modelEffortProfile', 'Model effort profile'],
        ['effortEscalationReason', 'Effort escalation reason'],
        ['selectedModelProvider', 'Selected model provider'],
        ['selectedModel', 'Selected model'],
        ['selectedModelEffort', 'Selected model effort'],
        ['modelSelectionReason', 'Model selection reason'],
        ['retrievalBudget', 'Retrieval budget'],
        ['validationProfile', 'Validation profile'],
        ['phaseReplayPolicy', 'Phase replay policy'],
      ]) {
        if (!section[key]) {
          violations.push(`${qaReport}: '${label}' must be filled with evidence, not placeholder text`);
        }
      }
      if (effortEscalationMissing(section.modelEffortProfile, section.effortEscalationReason)) {
        violations.push(`${qaReport}: deep/max effort requires a concrete Effort escalation reason`);
      }
      const applied = section.applied || '';
      const skipped = section.skipped || '';
      const selected = section.selected || '';
      const reviewCompleted = extractBulletValue(text, '## Review Checkpoint', 'Review completed').toLowerCase();
      if (!selected.includes('review-bundle')) violations.push(`${qaReport}: workflow execution must mention review-bundle`);
      if (!selected.includes('finish-bundle')) violations.push(`${qaReport}: workflow execution must mention finish-bundle`);
      if (codeChangeDetected && !applied.includes('codex-review-code') && (!skipped.includes('codex-review-code') || skipped.toLowerCase().includes('not evaluated yet'))) {
        violations.push(`${qaReport}: code changes require codex-review-code evidence in applied or skipped skills`);
      }
      if (codeChangeDetected && !applied.includes('code-simplifier') && (!skipped.includes('code-simplifier') || skipped.toLowerCase().includes('not evaluated yet'))) {
        violations.push(`${qaReport}: code changes require code-simplifier evidence in applied or skipped skills`);
      }
      if (codeChangeDetected && !applied.includes('doc-auto-sync') && (!skipped.includes('doc-auto-sync') || skipped.toLowerCase().includes('not evaluated yet'))) {
        violations.push(`${qaReport}: code changes require doc-auto-sync evidence in applied or skipped skills`);
      }

      const scopeStatus = extractBulletValue(text, '## Verdict', 'Scope status');
      const nextPath = canonicalizeNextPath(extractBulletValue(text, '## Verdict', 'Next path'));
      const closeoutReason = canonicalizeCloseoutReason(extractBulletValue(text, '## Verdict', 'Closeout reason'));
      const stopWhy = extractBulletValue(text, '## Finish Readiness', 'Why this round may stop now');
      const remainingScope = extractBulletValue(text, '## Finish Readiness', 'Remaining in-scope work');
      const contractReviewed = extractBulletValue(text, '## Contract Review Evidence', 'Contract reviewed by evaluator').toLowerCase();
      const runtimeEvidenceDepth = extractBulletValue(text, '## Runtime Updates', 'Runtime evidence depth').toLowerCase();
      const validationProfile = String(section.validationProfile || '').trim().toLowerCase();
      const smokeWarnings = extractBulletValue(text, '## Runtime Updates', 'Critical scenario smoke-only warnings').toLowerCase();
      const normalizedRunVerdict = extractBulletValue(text, '## Runtime Updates', 'Normalized run verdict').toLowerCase();
      const environmentBlockers = extractBulletValue(text, '## Runtime Updates', 'Environment blockers').toLowerCase();
      const retryStrategy = extractBulletValue(text, '## Failure Loop', 'Retry strategy');
      const deltaHypothesis = extractBulletValue(text, '## Failure Loop', 'Delta hypothesis');
      const repeatedFailurePolicy = extractBulletValue(text, '## Failure Loop', 'Repeated failure policy');
      const hasCriticalScenario = /\bcritical\b/i.test(text) && /\bSCN-[A-Za-z0-9_.-]+\b/.test(text);
      const hasRepeatedFailure = /same failure class.*\b2\b|\b2\b.*same failure class|repeats twice|반복.*2회/i.test(text);
      const closeoutFieldsPresent = Boolean(scopeStatus || nextPath || closeoutReason || stopWhy || remainingScope);
      if (closeoutFieldsPresent) {
        violations.push(...validateCloseoutSynchronization({
          qaReportPath: qaReport,
          scorecardPath: path.join(path.dirname(qaReport), 'SCORECARD.md'),
          handoffPath: path.join(path.dirname(qaReport), 'HANDOFF.md'),
        }));
        if (!['complete', 'partial'].includes(scopeStatus)) {
          violations.push(`${qaReport}: 'Scope status' must be complete or partial`);
        }
        if (!CANONICAL_NEXT_PATHS.includes(nextPath)) {
          violations.push(`${qaReport}: 'Next path' must be clean_finish, retry_loop, or resume_later_handoff`);
        }
        if (!CANONICAL_CLOSEOUT_REASONS.includes(closeoutReason)) {
          violations.push(`${qaReport}: 'Closeout reason' must use an allowed reason code`);
        }
        if (!stopWhy) violations.push(`${qaReport}: 'Why this round may stop now' must be filled`);
        if (!remainingScope) violations.push(`${qaReport}: 'Remaining in-scope work' must be filled`);
        const lowered = stopWhy.toLowerCase();
        if (lowered.includes('checkpoint') || lowered.includes('milestone')) {
          violations.push(`${qaReport}: milestone-only stop reasons are invalid`);
        }
        if (nextPath === 'clean_finish') {
          if (normalizedRunVerdict === 'complete_with_environment_blocker') {
            violations.push(`${qaReport}: clean_finish is blocked while normalized run verdict is complete_with_environment_blocker`);
          }
          if (environmentBlockers && !['none', '[]', 'n/a'].includes(environmentBlockers)) {
            violations.push(`${qaReport}: clean_finish is blocked while environment blockers are recorded`);
          }
          if (scopeStatus !== 'complete') violations.push(`${qaReport}: clean_finish requires Scope status = complete`);
          if (closeoutReason !== 'scope_complete') violations.push(`${qaReport}: clean_finish requires Closeout reason = scope_complete`);
          if (reviewCompleted !== 'yes') violations.push(`${qaReport}: clean_finish requires Review completed = yes`);
          if (!['yes', 'skipped_simple'].includes(contractReviewed)) {
            violations.push(`${qaReport}: clean_finish requires Contract Review Evidence with Contract reviewed by evaluator = yes or skipped_simple`);
          }
          if (hasCriticalScenario && !['docs_only', 'prompt_only'].includes(validationProfile) && runtimeEvidenceDepth !== 'open-act-mutate-persist-recover') {
            violations.push(`${qaReport}: clean_finish for critical SCN-* requires Runtime evidence depth = open-act-mutate-persist-recover`);
          }
          if (hasCriticalScenario && smokeWarnings && !['none', 'no', 'n/a'].includes(smokeWarnings)) {
            violations.push(`${qaReport}: clean_finish is blocked while critical scenario smoke-only warnings are present`);
          }
          requireTraceabilityArtifacts({ qaReport, violations });
          if (codeChangeDetected && !applied.includes('codex-review-code')) {
            violations.push(`${qaReport}: clean_finish on code-changing work requires codex-review-code in Applied skills`);
          }
          if (!extractBulletValue(text, '## Finish Readiness', 'Remaining blockers before closeout')) {
            violations.push(`${qaReport}: clean_finish requires 'Remaining blockers before closeout' to be filled`);
          }
        } else if (nextPath === 'retry_loop') {
          if (closeoutReason !== 'verification_failed') violations.push(`${qaReport}: retry_loop requires Closeout reason = verification_failed`);
          if (!RETRY_STRATEGIES.has(retryStrategy)) {
            violations.push(`${qaReport}: retry_loop requires Retry strategy = same_direction_refine, partial_redesign, or stop_and_handoff`);
          }
          if (!deltaHypothesis) {
            violations.push(`${qaReport}: retry_loop requires Delta hypothesis to be filled`);
          }
          if (!repeatedFailurePolicy) {
            violations.push(`${qaReport}: retry_loop requires Repeated failure policy to be filled`);
          }
          if (hasRepeatedFailure && retryStrategy === 'same_direction_refine') {
            violations.push(`${qaReport}: repeated failure class requires Retry strategy = partial_redesign or stop_and_handoff`);
          }
        } else if (nextPath === 'resume_later_handoff' && !['blocked', 'interrupted', 'context_limit', 'user_pause', 'deferred_verification'].includes(closeoutReason)) {
          violations.push(`${qaReport}: resume_later_handoff requires a real stop reason, not scope_complete or verification_failed`);
        }
      }

      const phaseExecutionDir = path.dirname(qaReport);
      const scorecardPath = path.join(phaseExecutionDir, 'SCORECARD.md');
      const handoffPath = path.join(phaseExecutionDir, 'HANDOFF.md');
      const conformance = evaluatePlanConformance({
        sprintContractPath: path.join(phaseExecutionDir, 'SPRINT_CONTRACT.md'),
        qaReportPath: qaReport,
        scorecardPath,
        handoffPath,
      });
      const completionClaimed = conformance.completionClaim
        || nextPath === 'clean_finish'
        || scopeStatus === 'complete';
      if (completionClaimed && !conformance.allowed) {
        violations.push(`${qaReport}: source plan conformance failed (${conformance.reason}); completion claims must be retried or user-approved replan`);
        for (const item of conformance.violations) {
          violations.push(`${qaReport}: ${item.code}: ${item.message}`);
        }
      }
    }

    for (const handoff of handoffs) {
      if (!fs.existsSync(handoff)) {
        violations.push(`missing handoff: ${handoff}`);
        continue;
      }
      const text = fs.readFileSync(handoff, 'utf8');
      for (const heading of ['## Resume Trigger', '## Checks To Rerun']) {
        if (!sectionExists(text, heading)) {
          violations.push(`${handoff}: missing '${heading}' section`);
        }
      }
      if (preparedDispatchEvidence) {
        continue;
      }
      const stopReason = canonicalizeHandoffStopReason(extractBulletValue(text, '## Resume Trigger', 'Stop reason'));
      const stopWhy = extractBulletValue(text, '## Resume Trigger', 'Why this cannot continue in the current round');
      const remainingScope = extractBulletValue(text, '## Remaining Scope', 'Remaining in-scope work');
      const handoffFieldsPresent = Boolean(stopReason || stopWhy || remainingScope) || sectionExists(text, '## Remaining Scope');
      if (handoffFieldsPresent) {
        if (!sectionExists(text, '## Remaining Scope')) violations.push(`${handoff}: missing '## Remaining Scope' section`);
        if (stopReason === 'clean_finish') {
          violations.push(`${handoff}: 'Stop reason: clean_finish' is invalid; clean finish must be represented by 'Required: no' without a plan-level stop reason`);
        }
        if (isCleanFinishHandoff(text)) {
          const required = extractBulletValue(text, '## Status', 'Required').toLowerCase();
          const reason = extractBulletValue(text, '## Status', 'Reason');
          if (required !== 'no') violations.push(`${handoff}: clean finish marker requires 'Required: no'`);
          if (!reason) violations.push(`${handoff}: clean finish marker requires a closeout reason`);
          if (!stopWhy) violations.push(`${handoff}: clean finish marker requires 'Why this cannot continue in the current round'`);
          if (!remainingScope) violations.push(`${handoff}: clean finish marker requires 'Remaining in-scope work'`);
          if (containsPlaceholderText(text)) violations.push(`${handoff}: clean finish marker must not retain placeholder text`);
        } else {
          if (!text.includes('session-logger')) {
            violations.push(`${handoff}: incomplete stop evidence must mention session-logger`);
          }
          if (!['blocked', 'interrupted', 'context_limit', 'user_pause', 'deferred_verification'].includes(stopReason)) {
            violations.push(`${handoff}: 'Stop reason' must use an allowed handoff reason code`);
          }
          if (!stopWhy) violations.push(`${handoff}: 'Why this cannot continue in the current round' must be filled`);
          if (!remainingScope) violations.push(`${handoff}: 'Remaining in-scope work' must be filled`);
          const lowered = stopWhy.toLowerCase();
          if (lowered.includes('checkpoint') || lowered.includes('milestone')) {
            violations.push(`${handoff}: milestone-only handoff reasons are invalid`);
          }
        }
      }
    }
  }

  if (requiresBoundedTrace) {
    if (fs.existsSync(latestBounded)) {
      const payload = JSON.parse(fs.readFileSync(latestBounded, 'utf8'));
      violations.push(...validateRuntimeReadModels(payload, latestBounded));
      if (payload.mode !== 'bounded-direct') {
        violations.push('bounded evidence must declare mode=bounded-direct');
      }
      for (const key of ['selectedBundles', 'requiredSkills', 'stageOrder']) {
        if (!Array.isArray(payload[key]) || payload[key].length === 0) {
          violations.push(`bounded evidence missing non-empty '${key}'`);
        }
      }
    }

    for (const analysisFile of analysisFiles) {
      if (!fs.existsSync(analysisFile)) {
        violations.push(`missing analysis file: ${analysisFile}`);
        continue;
      }
      const analysisText = fs.readFileSync(analysisFile, 'utf8');
      const payload = parseSimpleYaml(analysisText);
      const workflow = payload.workflowEvidence && typeof payload.workflowEvidence === 'object' && !Array.isArray(payload.workflowEvidence)
        ? payload.workflowEvidence
        : {};
      if (Object.keys(workflow).length === 0) {
        violations.push(`${analysisFile}: missing workflowEvidence block`);
        continue;
      }
      if (workflow.mode !== 'bounded-direct') {
        violations.push(`${analysisFile}: workflowEvidence.mode must be bounded-direct`);
      }
      const selected = Array.isArray(workflow.selectedBundles) ? workflow.selectedBundles : [];
      const required = Array.isArray(workflow.requiredSkills) ? workflow.requiredSkills : [];
      const stageOrder = Array.isArray(workflow.stageOrder) ? workflow.stageOrder : [];
      const applied = Array.isArray(workflow.appliedSkills) ? workflow.appliedSkills : [];
      const skipped = Array.isArray(workflow.skippedSkills) ? workflow.skippedSkills : [];
      const selectedHarnessComponents = Array.isArray(workflow.selectedHarnessComponents) ? workflow.selectedHarnessComponents : [];
      if (selected.length === 0) violations.push(`${analysisFile}: workflowEvidence.selectedBundles must be non-empty`);
      if (required.length === 0) violations.push(`${analysisFile}: workflowEvidence.requiredSkills must be non-empty`);
      if (stageOrder.length === 0) violations.push(`${analysisFile}: workflowEvidence.stageOrder must be non-empty`);
      if (applied.length === 0) violations.push(`${analysisFile}: workflowEvidence.appliedSkills must be non-empty`);
      if (skipped.length === 0) violations.push(`${analysisFile}: workflowEvidence.skippedSkills must be non-empty`);
      if (selectedHarnessComponents.length === 0) violations.push(`${analysisFile}: workflowEvidence.selectedHarnessComponents must be non-empty`);
      if (!Array.isArray(workflow.skippedHarnessComponents)) violations.push(`${analysisFile}: workflowEvidence.skippedHarnessComponents must be present`);
      for (const key of [
        'selectionReason',
        'runtimeIsolation',
        'modelEffortProfile',
        'effortEscalationReason',
        'selectedModelProvider',
        'selectedModel',
        'selectedModelEffort',
        'modelSelectionReason',
        'retrievalBudget',
        'validationProfile',
        'phaseReplayPolicy',
      ]) {
        if (typeof workflow[key] !== 'string' || !workflow[key].trim()) {
          violations.push(`${analysisFile}: workflowEvidence.${key} must be filled`);
        }
      }
      if (effortEscalationMissing(workflow.modelEffortProfile, workflow.effortEscalationReason)) {
        violations.push(`${analysisFile}: workflowEvidence.deep/max effort requires effortEscalationReason`);
      }
      const analysisContext = payload.analysisContext && typeof payload.analysisContext === 'object' && !Array.isArray(payload.analysisContext)
        ? payload.analysisContext
        : {};
      const validationProfile = String(workflow.validationProfile || DEFAULT_VALIDATION_PROFILE).trim() || DEFAULT_VALIDATION_PROFILE;
      const codeReviewGraph = analysisContext.codeReviewGraph && typeof analysisContext.codeReviewGraph === 'object'
        ? analysisContext.codeReviewGraph
        : (payload.codeReviewGraph && typeof payload.codeReviewGraph === 'object' ? payload.codeReviewGraph : {});
      const hasStructuredCrgEvidence = Boolean(
        codeReviewGraph.stages
        || codeReviewGraph.stageEvidence
        || codeReviewGraph.evidenceArtifactPath
      );
      if (hasStructuredCrgEvidence) {
        const crgDecision = validateCodeReviewGraphEvidence({
          ...analysisContext,
          validationProfile,
          evidenceCarrier: 'bounded',
          workflowEvidence: workflow,
          changedFiles: {
            files,
            source: 'workflow_enforcement_args',
            baseRef: process.env.WORKFLOW_ENFORCEMENT_BASE_REF || 'workflow-enforcement-file-list',
            baseRefSource: process.env.WORKFLOW_ENFORCEMENT_BASE_REF ? 'env' : 'bounded_file_list',
            fallbackUsed: !process.env.WORKFLOW_ENFORCEMENT_BASE_REF,
          },
          codeReviewGraph,
        }, { repoRoot: process.cwd() });
        if (crgDecision.blocking) {
          violations.push(`${analysisFile}: codeReviewGraph validation blocked (${crgDecision.blockerCode || crgDecision.reason})`);
        }
      }
      const appliedText = applied.join(' | ');
      const skippedText = skipped.join(' | ');
      if (codeChangeDetected && !selected.includes('review-bundle')) violations.push(`${analysisFile}: bounded direct code changes must select review-bundle`);
      if (codeChangeDetected && !selected.includes('finish-bundle')) violations.push(`${analysisFile}: bounded direct code changes must select finish-bundle`);
      if (codeChangeDetected && !appliedText.includes('codex-review-code') && (!skippedText.includes('codex-review-code') || skippedText.toLowerCase().includes('not evaluated yet'))) {
        violations.push(`${analysisFile}: bounded direct code changes require codex-review-code evidence`);
      }
      if (codeChangeDetected && !appliedText.includes('code-simplifier') && (!skippedText.includes('code-simplifier') || skippedText.toLowerCase().includes('not evaluated yet'))) {
        violations.push(`${analysisFile}: bounded direct code changes require code-simplifier evidence`);
      }
      if (codeChangeDetected && !appliedText.includes('doc-auto-sync') && (!skippedText.includes('doc-auto-sync') || skippedText.toLowerCase().includes('not evaluated yet'))) {
        violations.push(`${analysisFile}: bounded direct code changes require doc-auto-sync evidence`);
      }
      const signals = payload.signals && typeof payload.signals === 'object' && !Array.isArray(payload.signals) ? payload.signals : {};
      if (signals.handoffRequired === true && !appliedText.includes('session-logger') && !skippedText.includes('session-logger')) {
        violations.push(`${analysisFile}: handoffRequired=true requires session-logger evidence`);
      }
    }
  }

  console.log('Workflow Enforcement Check');
  console.log(`Applicable: ${requiresTrace ? 'yes' : 'no'}`);
  console.log(`Phase dispatch evidence: ${fs.existsSync(latestDispatch) ? latestDispatch : 'missing'}`);
  console.log(`Bounded evidence: ${fs.existsSync(latestBounded) ? latestBounded : 'missing'}`);
  console.log(`Sprint contracts checked: ${sprintContracts.length}`);
  console.log(`QA reports checked: ${qaReports.length}`);
  console.log(`Handoffs checked: ${handoffs.length}`);
  console.log(`Analysis files checked: ${analysisFiles.length}`);
  if (violations.length > 0) {
    console.log(`Violations: ${violations.length}`);
    for (const violation of violations) {
      console.log(`- ${violation}`);
    }
    process.exit(1);
  }
  console.log('Violations: 0');
}

function main() {
  const [commandName, ...args] = process.argv.slice(2);
  if (!commandName) {
    usage();
    process.exit(1);
  }
  try {
    switch (commandName) {
      case 'record-dispatch':
        recordDispatch(args);
        break;
      case 'record-bounded':
        recordBounded(args);
        break;
      case 'verify':
        verifyEnforcement(args);
        break;
      case '--help':
      case '-h':
      case 'help':
        usage();
        break;
      default:
        throw new Error(`Unknown subcommand: ${commandName}`);
    }
  } catch (error) {
    logError(error.message);
    usage();
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
