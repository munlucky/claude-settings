#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const VALID_SCOPES = new Set(['runtime', 'phase_verification', 'phase_closeout']);
const VALID_BLOCKER_CLASSES = new Set([
  'runtime_unavailable',
  'verifier_unavailable',
  'verification_failed',
  'content_precondition',
  'contract_violation',
]);

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function stableFingerprint(value) {
  return crypto.createHash('sha256').update(stableJson(value)).digest('hex').slice(0, 16);
}

function normalizeLower(value) {
  return String(value || '').trim().toLowerCase();
}

const REQUIRED_CHECK_PLACEHOLDERS = new Set(['none', '없음', 'n/a', 'na', 'null', '']);
const VERDICT_IDENTITY_KEYS = [
  'runLeaseId',
  'activePhaseDocPath',
  'masterPlan',
  'planDir',
  'statusFile',
  'gitTreeFingerprint',
];
const FUTURE_VERDICT_TOLERANCE_MS = 5000;

function normalizeIdentityText(value) {
  return String(value || '').trim();
}

function normalizeIdentityPath(value) {
  const text = normalizeIdentityText(value);
  return text ? path.resolve(text) : '';
}

export function resolveGitTreeFingerprint(root = '') {
  const candidate = normalizeIdentityText(root) || process.cwd();
  const result = spawnSync('git', ['-c', `safe.directory=${candidate}`, '-c', 'core.editor=true', '-C', candidate, 'rev-parse', 'HEAD^{tree}'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    env: {
      ...process.env,
      GIT_EDITOR: 'true',
    },
  });
  if (result.error || (result.status ?? 0) !== 0) {
    return '';
  }

  return String(result.stdout || '').trim();
}

function parsePhaseNumber(value) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function pathIsWithinDirectory(candidatePath, directoryPath) {
  const normalizedCandidate = String(candidatePath || '').trim();
  const normalizedDirectory = String(directoryPath || '').trim();
  if (!normalizedCandidate || !normalizedDirectory) {
    return false;
  }

  const resolvedCandidate = path.resolve(normalizedCandidate);
  const resolvedDirectory = path.resolve(normalizedDirectory);
  return resolvedCandidate === resolvedDirectory || resolvedCandidate.startsWith(`${resolvedDirectory}${path.sep}`);
}

function phaseNumberFromPayload(payload = {}) {
  return parsePhaseNumber(
    payload.phase?.number
    ?? payload.phaseNumber
    ?? payload.phase?.phaseNumber
    ?? payload.phase?.id
    ?? '',
  );
}

function payloadMatchesActivePhase(payload = {}, activePhaseNumber = null) {
  if (!Number.isInteger(activePhaseNumber)) {
    return null;
  }

  const payloadPhaseNumber = phaseNumberFromPayload(payload);
  if (!Number.isInteger(payloadPhaseNumber)) {
    return null;
  }

  return payloadPhaseNumber === activePhaseNumber;
}

function pathMatchesActivePhase(candidatePath, activePhaseNumber = null) {
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

function normalizeVerdictIdentitySource(source = {}) {
  const identity = {};
  for (const key of VERDICT_IDENTITY_KEYS) {
    const value = ['activePhaseDocPath', 'masterPlan', 'planDir', 'statusFile'].includes(key)
      ? normalizeIdentityPath(source[key])
      : normalizeIdentityText(source[key]);
    if (value) {
      identity[key] = value;
    }
  }
  return identity;
}

function normalizePayloadIdentity(payload = {}) {
  const source = payload.identity && typeof payload.identity === 'object' ? payload.identity : payload;
  return normalizeVerdictIdentitySource(source);
}

function hasCompleteVerdictIdentity(identity = {}) {
  return VERDICT_IDENTITY_KEYS.every((key) => normalizeIdentityText(identity[key]));
}

function resolveIdentityOptions(options = {}) {
  const source = options.identity && typeof options.identity === 'object' ? options.identity : options;
  const identity = {};
  for (const key of VERDICT_IDENTITY_KEYS) {
    let value = source[key];
    if (value === undefined || value === null || value === '') {
      if (key === 'runLeaseId') value = process.env.PHASE_RUN_LEASE_ID;
      if (key === 'activePhaseDocPath') value = process.env.PHASE_ACTIVE_PHASE_DOC_PATH || options.activePhaseDocPath;
      if (key === 'masterPlan') value = process.env.PHASE_MASTER_PLAN || options.masterPlan;
      if (key === 'planDir') value = process.env.PHASE_PLAN_DIR || options.planDir;
      if (key === 'statusFile') value = process.env.PHASE_STATUS_FILE || options.statusFile;
      if (key === 'gitTreeFingerprint') value = process.env.PHASE_GIT_TREE_FINGERPRINT || resolveGitTreeFingerprint(options.gitTreeRoot || process.env.PHASE_GIT_TREE_ROOT || options.planDir || process.env.PHASE_PLAN_DIR || '');
    }

    const normalized = ['activePhaseDocPath', 'masterPlan', 'planDir', 'statusFile'].includes(key)
      ? normalizeIdentityPath(value)
      : normalizeIdentityText(value);
    if (normalized) {
      identity[key] = normalized;
    }
  }
  return identity;
}

function compareVerificationIdentity(payloadIdentity = {}, activeIdentity = {}) {
  const activeKeys = VERDICT_IDENTITY_KEYS.filter((key) => activeIdentity[key]);
  if (activeKeys.length === 0) {
    return { matched: true, staleReason: '' };
  }

  const payloadKeys = VERDICT_IDENTITY_KEYS.filter((key) => payloadIdentity[key]);
  if (payloadKeys.length === 0) {
    return { matched: true, staleReason: '' };
  }

  for (const key of VERDICT_IDENTITY_KEYS) {
    const activeValue = activeIdentity[key];
    if (!activeValue) {
      continue;
    }
    const payloadValue = payloadIdentity[key];
    if (!payloadValue) {
      return { matched: false, staleReason: `identity-mismatch:${key}` };
    }
    if (payloadValue !== activeValue) {
      return { matched: false, staleReason: `identity-mismatch:${key}` };
    }
  }

  return { matched: true, staleReason: '' };
}

function resolveVerdictStaleReason(entry = {}, options = {}) {
  const payload = entry.payload || {};
  const normalized = entry.scope || entry.blockerClass || entry.stale !== undefined || entry.superseded !== undefined
    ? entry
    : normalizeVerdictPayload(payload, entry.filePath || entry.path || '');
  const activeIdentity = resolveIdentityOptions(options);
  const identityCheck = compareVerificationIdentity(normalized.identity || normalizePayloadIdentity(payload), activeIdentity);

  if (!identityCheck.matched) {
    return identityCheck.staleReason;
  }
  if (hasCompleteVerdictIdentity(activeIdentity)) {
    if (normalizeLower(payload.identityStatus) === 'legacy') {
      return 'identity-legacy';
    }
    if (!hasCompleteVerdictIdentity(normalized.identity || normalizePayloadIdentity(payload))) {
      return 'identity-incomplete';
    }
  }
  if (normalized.superseded || payload.superseded === true || payload.supersededBy) {
    return normalized.staleReason || 'superseded';
  }
  if (normalized.stale) {
    return normalized.staleReason || 'payload-stale';
  }
  if (options.now && payload.generatedAt) {
    const generatedAt = Date.parse(String(payload.generatedAt));
    const nowAt = Date.parse(String(options.now));
    if (Number.isFinite(generatedAt) && Number.isFinite(nowAt) && generatedAt > nowAt + FUTURE_VERDICT_TOLERANCE_MS) {
      return 'generatedAt-in-future';
    }
  }

  return '';
}

export function isRelevantVerificationVerdict(entry = {}, options = {}) {
  const payload = entry.payload || {};
  const candidatePath = String(options.candidatePath || entry.filePath || entry.path || '');
  const explicitVerdictPaths = options.explicitVerdictPaths;
  const activePhaseNumber = Number.isInteger(options.activePhaseNumber)
    ? options.activePhaseNumber
    : parsePhaseNumber(options.activePhaseNumber);
  const normalized = entry.scope || entry.blockerClass || entry.stale !== undefined || entry.superseded !== undefined
    ? entry
    : normalizeVerdictPayload(payload, candidatePath);
  const staleReason = resolveVerdictStaleReason(normalized, options);

  if (staleReason) {
    return false;
  }

  const resolvedCandidatePath = candidatePath ? path.resolve(candidatePath) : '';
  if (resolvedCandidatePath && pathIsWithinDirectory(resolvedCandidatePath, options.phaseExecutionDir)) {
    return true;
  }

  if (resolvedCandidatePath && explicitVerdictPaths && typeof explicitVerdictPaths.has === 'function' && explicitVerdictPaths.has(resolvedCandidatePath)) {
    return true;
  }

  const payloadPhaseMatch = payloadMatchesActivePhase(payload, activePhaseNumber);
  if (payloadPhaseMatch !== null) {
    return payloadPhaseMatch;
  }

  const pathPhaseMatch = pathMatchesActivePhase(candidatePath, activePhaseNumber);
  if (pathPhaseMatch !== null) {
    return pathPhaseMatch;
  }

  if (options.qaReportPath || options.phaseExecutionDir) {
    const verificationMode = String(payload?.verificationMode || payload?.contract?.verificationMode || '').trim().toLowerCase();
    const contractApplicable = payload?.contractApplicable === true || payload?.contract?.applicable === true;
    const script = String(payload?.script || '').trim();

    if (script === 'verify-changes.sh' && verificationMode === 'workspace' && !contractApplicable) {
      return false;
    }
  }

  if (Number.isInteger(activePhaseNumber)) {
    return false;
  }

  return true;
}

function asStringList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap((item) => asStringList(item));
  }
  const text = String(value || '').trim();
  return text ? [text] : [];
}

export function normalizeRequiredChecksMissing(value = []) {
  const normalized = [];
  for (const entry of asStringList(value)) {
    const text = String(entry || '').trim();
    if (!text || REQUIRED_CHECK_PLACEHOLDERS.has(normalizeLower(text))) {
      continue;
    }
    if (!normalized.includes(text)) {
      normalized.push(text);
    }
  }
  return normalized;
}

export function inferBlockerClass(payload = {}) {
  const explicit = normalizeLower(payload.blockerClass);
  if (VALID_BLOCKER_CLASSES.has(explicit)) {
    return explicit;
  }

  const reason = normalizeLower(payload.blockingReasonCode);
  const failureClass = normalizeLower(payload.failureClass);
  if (/runtime_verifier|verifier_unavailable|verification_runtime/.test(reason)) {
    return 'verifier_unavailable';
  }
  if (/auth|login|credential|worker_spawn|spawn|codex_exec|runtime_health|runtime_cli/.test(reason)) {
    return 'runtime_unavailable';
  }
  if (failureClass === 'contract') {
    return 'contract_violation';
  }
  if (failureClass === 'environment') {
    return 'verifier_unavailable';
  }
  if (payload.blocking === true || normalizeLower(payload.verdict) === 'failed') {
    return 'verification_failed';
  }
  return '';
}

export function inferVerdictScope(payload = {}) {
  const explicit = normalizeLower(payload.verdictScope);
  if (VALID_SCOPES.has(explicit)) {
    return explicit;
  }

  const blockerClass = inferBlockerClass(payload);
  const reason = normalizeLower(payload.blockingReasonCode);
  if (blockerClass === 'runtime_unavailable' && !/runtime_verifier|verifier_unavailable/.test(reason)) {
    return 'runtime';
  }
  return 'phase_verification';
}

export function verdictTargetsRuntime(payload = {}, runtime = '') {
  const normalizedRuntime = normalizeLower(runtime);
  const runtimeContext = payload.runtimeContext && typeof payload.runtimeContext === 'object'
    ? payload.runtimeContext
    : {};
  const targets = new Set();

  for (const value of [
    runtimeContext.requestedRuntime,
    runtimeContext.effectiveRuntime,
  ]) {
    const normalized = normalizeLower(value);
    if (normalized) {
      targets.add(normalized);
    }
  }

  for (const part of String(runtimeContext.verificationRuntimeTargets || '').split(/[,\s]+/)) {
    const normalized = normalizeLower(part);
    if (normalized) {
      targets.add(normalized);
    }
  }

  if (targets.size === 0) {
    return true;
  }

  return targets.has(normalizedRuntime) || targets.has('both') || targets.has('auto') || targets.has('current');
}

function commandStatusSummary(payload = {}) {
  const commands = Array.isArray(payload.commands) ? payload.commands : [];
  const passed = commands.filter((command) => normalizeLower(command.status) === 'passed').length;
  const failed = commands.filter((command) => normalizeLower(command.status) === 'failed').length;
  return { total: commands.length, passed, failed };
}

export function normalizeVerdictPayload(payload = {}, filePath = '') {
  const scope = inferVerdictScope(payload);
  const blockerClass = inferBlockerClass(payload);
  const scoreVerdict = normalizeLower(payload.score?.verdict);
  const commands = commandStatusSummary(payload);
  const blocking = payload.blocking === true
    || (normalizeLower(payload.verdict) === 'failed' && ['environment', 'contract'].includes(normalizeLower(payload.failureClass)));
  const stale = payload.stale === true
    || (
      scope !== 'runtime'
      && blocking
      && commands.total > 0
      && commands.failed === 0
      && commands.passed === commands.total
      && scoreVerdict === 'blocked'
    );

  return {
    payload,
    filePath,
    fileName: filePath ? path.basename(filePath) : '',
    scope,
    blockerClass,
    blocking,
    stale,
    active: blocking && !stale && !payload.supersededBy,
    reason: normalizeLower(payload.blockingReasonCode) || normalizeLower(payload.failureClass) || normalizeLower(payload.verdict),
    fingerprint: payload.blockerFingerprint || stableFingerprint({
      phase: payload.phase?.number || '',
      scope,
      blockerClass,
      reason: payload.blockingReasonCode || '',
      missing: payload.requiredChecks?.missing || [],
    }),
  };
}

export function listVerificationVerdicts(workspaceRoot, recentWindowMs, maxFiles) {
  const verdictDir = path.join(workspaceRoot, '.claude');
  if (!fs.existsSync(verdictDir)) {
    return [];
  }

  const now = Date.now();
  return fs.readdirSync(verdictDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^verification-verdict-.*\.json$/.test(entry.name))
    .map((entry) => {
      const filePath = path.join(verdictDir, entry.name);
      const stats = fs.statSync(filePath);
      return { path: filePath, mtimeMs: stats.mtimeMs };
    })
    .filter((entry) => !recentWindowMs || now - entry.mtimeMs <= recentWindowMs)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, maxFiles || Number.MAX_SAFE_INTEGER)
    .flatMap((entry) => {
      try {
        return [{ ...entry, ...normalizeVerdictPayload(JSON.parse(fs.readFileSync(entry.path, 'utf8')), entry.path) }];
      } catch {
        return [];
      }
    });
}

export function assessRuntimeHealthFromVerdictFiles(runtime, workspaceRoot, recentWindowMs, maxFiles) {
  const verdicts = listVerificationVerdicts(workspaceRoot, recentWindowMs, maxFiles)
    .filter((entry) => verdictTargetsRuntime(entry.payload, runtime));

  if (verdicts.length === 0) {
    return null;
  }

  for (const entry of verdicts) {
    if (entry.scope === 'runtime' || entry.blockerClass === 'runtime_unavailable') {
      if (entry.active) {
        return {
          HEALTHY: 'false',
          RUNTIME: runtime,
          REASON: 'runtime-structured-verdict-blocked',
          DETAIL: `Runtime verdict ${entry.fileName} is active (${entry.blockerClass || entry.reason || 'blocking'})`,
          VERDICT_PATH: entry.filePath,
          VERDICT_SCOPE: entry.scope,
          BLOCKER_CLASS: entry.blockerClass,
          BLOCKER_STATE: 'active',
        };
      }
      if (normalizeLower(entry.payload.verdict) === 'passed' && entry.payload.blocking !== true) {
        return {
          HEALTHY: 'true',
          RUNTIME: runtime,
          REASON: 'runtime-structured-verdict-passed',
          DETAIL: `Runtime verdict ${entry.fileName} marked the runtime non-blocking`,
          VERDICT_PATH: entry.filePath,
          VERDICT_SCOPE: entry.scope,
          BLOCKER_CLASS: entry.blockerClass,
          BLOCKER_STATE: 'clear',
        };
      }
    }

    if (entry.blocking) {
      return {
        HEALTHY: 'true',
        RUNTIME: runtime,
        REASON: entry.stale ? 'phase-verification-blocker-stale' : 'phase-verification-blocked-not-runtime',
        DETAIL: `Phase verification verdict ${entry.fileName} is ${entry.stale ? 'stale' : 'non-runtime'} (${entry.blockerClass || entry.reason || 'blocking'})`,
        VERDICT_PATH: entry.filePath,
        VERDICT_SCOPE: entry.scope,
        BLOCKER_CLASS: entry.blockerClass,
        BLOCKER_STATE: entry.stale ? 'stale' : 'active',
      };
    }
  }

  return null;
}

function printAssignments(result) {
  for (const [key, value] of Object.entries(result)) {
    process.stdout.write(`${key}=${String(value)}\n`);
  }
}

function selfTest() {
  const activeIdentity = {
    runLeaseId: 'lease-a',
    activePhaseDocPath: '/workspace/plans/phase-02.md',
    masterPlan: '/workspace/plans/master.md',
    planDir: '/workspace/plans',
    statusFile: '/workspace/.claude/docs/phase-status.yaml',
    gitTreeFingerprint: 'tree-a',
  };
  const stalePhasePayload = {
    verdict: 'failed',
    blocking: true,
    failureClass: 'environment',
    blockingReasonCode: 'runtime_verifier_unavailable',
    commands: [{ status: 'passed' }],
    score: { verdict: 'blocked' },
  };
  const runtimePayload = {
    verdict: 'failed',
    blocking: true,
    blockingReasonCode: 'worker_spawn_failed',
  };
  const completePhasePayload = {
    verdict: 'passed',
    evidenceFresh: true,
    blocking: false,
    phase: { number: 2 },
    identity: activeIdentity,
  };
  const mismatchedPhasePayload = {
    ...completePhasePayload,
    identity: {
      ...activeIdentity,
      runLeaseId: 'lease-b',
    },
  };

  assert.equal(inferVerdictScope(stalePhasePayload), 'phase_verification');
  assert.equal(inferBlockerClass(stalePhasePayload), 'verifier_unavailable');
  assert.equal(normalizeVerdictPayload(stalePhasePayload).stale, true);
  assert.equal(inferVerdictScope(runtimePayload), 'runtime');
  assert.equal(inferBlockerClass(runtimePayload), 'runtime_unavailable');
  assert.deepEqual(normalizeRequiredChecksMissing(['none', 'n/a', 'verification-verdict-path']), ['verification-verdict-path']);
  assert.deepEqual(normalizeRequiredChecksMissing(['없음']), []);
  assert.equal(isRelevantVerificationVerdict({ payload: completePhasePayload, filePath: '/tmp/verification-verdict-phase02-final.json' }, { activePhaseNumber: 2, identity: activeIdentity }), true);
  assert.equal(isRelevantVerificationVerdict({ payload: mismatchedPhasePayload, filePath: '/tmp/verification-verdict-phase02-final.json' }, { activePhaseNumber: 2, identity: activeIdentity }), false);
  assert.equal(typeof resolveGitTreeFingerprint(process.cwd()), 'string');
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case 'assess-runtime-health': {
      const [runtime, workspaceRoot = process.cwd(), windowMs = String(2 * 60 * 60 * 1000), maxFiles = '5'] = args;
      const result = assessRuntimeHealthFromVerdictFiles(
        runtime,
        workspaceRoot,
        Number.parseInt(windowMs, 10) || 0,
        Number.parseInt(maxFiles, 10) || 5,
      );
      if (result) {
        printAssignments(result);
      }
      break;
    }
    case 'self-test':
      selfTest();
      process.stdout.write('verification-verdict-state self-test passed\n');
      break;
    default:
      process.stderr.write('Usage: verification-verdict-state.mjs assess-runtime-health <runtime> [workspace-root] [window-ms] [max-files]\n');
      process.stderr.write('       verification-verdict-state.mjs self-test\n');
      process.exit(64);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
