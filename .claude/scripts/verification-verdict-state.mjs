#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const VALID_SCOPES = new Set(['runtime', 'phase_verification', 'phase_closeout']);
const VALID_BLOCKER_CLASSES = new Set([
  'runtime_unavailable',
  'verifier_unavailable',
  'verification_failed',
  'content_precondition',
  'missing_evidence',
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

  if (normalized.stale || normalized.superseded) {
    return false;
  }

  const resolvedCandidatePath = candidatePath ? path.resolve(candidatePath) : '';
  if (resolvedCandidatePath && explicitVerdictPaths && typeof explicitVerdictPaths.has === 'function' && explicitVerdictPaths.has(resolvedCandidatePath)) {
    return true;
  }

  if (resolvedCandidatePath && pathIsWithinDirectory(resolvedCandidatePath, options.phaseExecutionDir)) {
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

export function inferBlockerClass(payload = {}) {
  const explicit = normalizeLower(payload.blockerClass);
  if (VALID_BLOCKER_CLASSES.has(explicit)) {
    return explicit;
  }

  const reason = normalizeLower(payload.blockingReasonCode);
  const failureClass = normalizeLower(payload.failureClass);
  const missingChecks = Array.isArray(payload.requiredChecks?.missing) ? payload.requiredChecks.missing : [];
  if (/missing[_-]?verification[_-]?evidence|missing[_-]?evidence/.test(reason) || (missingChecks.length > 0 && (payload.blocking === true || normalizeLower(payload.verdict) === 'failed' || /contract|content_precondition/.test(failureClass)))) {
    return 'missing_evidence';
  }
  if (/content[_-]?precondition|precondition/.test(reason) || failureClass === 'contract') {
    return 'content_precondition';
  }
  if (/runtime_verifier|verifier_unavailable|verification_runtime/.test(reason)) {
    return 'verifier_unavailable';
  }
  if (/auth|login|credential|worker_spawn|spawn|codex_exec|runtime_health|runtime_cli/.test(reason)) {
    return 'runtime_unavailable';
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

function buildVerdictSelectionKey(entry = {}) {
  const payload = entry.payload || {};
  const runtimeContext = payload.runtimeContext && typeof payload.runtimeContext === 'object'
    ? payload.runtimeContext
    : {};
  const phaseNumber = payload.phase?.number || '';
  const runtimeTarget = normalizeLower(runtimeContext.requestedRuntime || runtimeContext.effectiveRuntime || payload.runtime || '');
  const scope = normalizeLower(entry.scope || payload.verdictScope || inferVerdictScope(payload));
  const blockerClass = normalizeLower(entry.blockerClass || inferBlockerClass(payload));
  const reason = normalizeLower(payload.blockingReasonCode || payload.failureClass || payload.verdict || '');
  return [scope, phaseNumber, runtimeTarget, blockerClass || reason].join('|');
}

function extractSupersession(payload = {}) {
  return {
    supersededBy: asStringList(payload.supersededBy || payload.supersededByRunId || payload.supersededByPath),
    importedFrom: asStringList(
      payload.importedFrom
      || payload.reusedVerificationResult
      || payload.reusedVerificationResultFrom
      || payload.reusedResultPath,
    ),
  };
}

export function normalizeVerdictPayload(payload = {}, filePath = '') {
  const scope = inferVerdictScope(payload);
  const blockerClass = inferBlockerClass(payload);
  const scoreVerdict = normalizeLower(payload.score?.verdict);
  const commands = commandStatusSummary(payload);
  const blocking = payload.blocking === true
    || (normalizeLower(payload.verdict) === 'failed' && ['environment', 'contract'].includes(normalizeLower(payload.failureClass)));
  const supersession = extractSupersession(payload);
  const superseded = payload.superseded === true || supersession.supersededBy.length > 0 || supersession.importedFrom.length > 0;
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
    superseded,
    active: blocking && !stale && !superseded,
    reason: normalizeLower(payload.blockingReasonCode) || normalizeLower(payload.failureClass) || normalizeLower(payload.verdict),
    supersededBy: supersession.supersededBy,
    importedFrom: supersession.importedFrom,
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
    .filter((entry) => verdictTargetsRuntime(entry.payload, runtime) && isRelevantVerificationVerdict(entry));

  if (verdicts.length === 0) {
    return null;
  }

  const newestRuntimePassIndex = verdicts.findIndex((entry) => entry.scope === 'runtime' || entry.blockerClass === 'runtime_unavailable'
    ? normalizeLower(entry.payload.verdict) === 'passed' && entry.payload.blocking !== true
    : false);
  const newestRuntimeBlockIndex = verdicts.findIndex((entry) => (entry.scope === 'runtime' || entry.blockerClass === 'runtime_unavailable') && entry.active);
  if (newestRuntimePassIndex !== -1 && (newestRuntimeBlockIndex === -1 || newestRuntimePassIndex < newestRuntimeBlockIndex)) {
    const entry = verdicts[newestRuntimePassIndex];
    return {
      HEALTHY: 'true',
      RUNTIME: runtime,
      REASON: 'runtime-structured-verdict-passed',
      DETAIL: `Runtime verdict ${entry.fileName} marked the runtime non-blocking`,
      VERDICT_PATH: entry.filePath,
      VERDICT_SCOPE: entry.scope,
      BLOCKER_CLASS: entry.blockerClass,
      BLOCKER_STATE: entry.superseded ? 'superseded' : 'clear',
      VERDICT_SUPERSEDED_BY: entry.supersededBy.join(','),
      VERDICT_IMPORTED_FROM: entry.importedFrom.join(','),
    };
  }
  if (newestRuntimeBlockIndex !== -1) {
    const entry = verdicts[newestRuntimeBlockIndex];
    return {
      HEALTHY: 'false',
      RUNTIME: runtime,
      REASON: 'runtime-structured-verdict-blocked',
      DETAIL: `Runtime verdict ${entry.fileName} is active (${entry.blockerClass || entry.reason || 'blocking'})`,
      VERDICT_PATH: entry.filePath,
      VERDICT_SCOPE: entry.scope,
      BLOCKER_CLASS: entry.blockerClass,
      BLOCKER_STATE: entry.superseded ? 'superseded' : 'active',
      VERDICT_SUPERSEDED_BY: entry.supersededBy.join(','),
      VERDICT_IMPORTED_FROM: entry.importedFrom.join(','),
    };
  }

  const newestPhasePassIndex = verdicts.findIndex((entry) => normalizeLower(entry.payload.verdict) === 'passed' && entry.payload.blocking !== true);
  const newestPhaseBlockIndex = verdicts.findIndex((entry) => entry.blocking && entry.active);
  if (newestPhasePassIndex !== -1 && (newestPhaseBlockIndex === -1 || newestPhasePassIndex < newestPhaseBlockIndex)) {
    const entry = verdicts[newestPhasePassIndex];
    return {
      HEALTHY: 'true',
      RUNTIME: runtime,
      REASON: 'phase-verification-passed',
      DETAIL: `Phase verification verdict ${entry.fileName} marked the target non-blocking`,
      VERDICT_PATH: entry.filePath,
      VERDICT_SCOPE: entry.scope,
      BLOCKER_CLASS: entry.blockerClass,
      BLOCKER_STATE: entry.superseded ? 'superseded' : 'clear',
      VERDICT_SUPERSEDED_BY: entry.supersededBy.join(','),
      VERDICT_IMPORTED_FROM: entry.importedFrom.join(','),
    };
  }
  if (newestPhaseBlockIndex !== -1) {
    const entry = verdicts[newestPhaseBlockIndex];
    return {
      HEALTHY: 'true',
      RUNTIME: runtime,
      REASON: entry.stale ? 'phase-verification-blocker-stale' : 'phase-verification-blocked-not-runtime',
      DETAIL: `Phase verification verdict ${entry.fileName} is ${entry.stale ? 'stale' : 'non-runtime'} (${entry.blockerClass || entry.reason || 'blocking'})`,
      VERDICT_PATH: entry.filePath,
      VERDICT_SCOPE: entry.scope,
      BLOCKER_CLASS: entry.blockerClass,
      BLOCKER_STATE: entry.stale ? 'stale' : 'active',
      VERDICT_SUPERSEDED_BY: entry.supersededBy.join(','),
      VERDICT_IMPORTED_FROM: entry.importedFrom.join(','),
    };
  }

  return null;
}

function printAssignments(result) {
  for (const [key, value] of Object.entries(result)) {
    process.stdout.write(`${key}=${String(value)}\n`);
  }
}

function selfTest() {
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
    runtimeContext: {
      requestedRuntime: 'codex',
      effectiveRuntime: 'claude',
      fallbackReason: 'runtime fallback exercised',
    },
  };
  const supersededPayload = {
    verdict: 'failed',
    blocking: true,
    blockingReasonCode: 'runtime_verifier_unavailable',
    supersededBy: ['verification-verdict-phase05-final.json'],
    reusedVerificationResult: ['verification-verdict-phase05-import.json'],
  };
  const missingEvidencePayload = {
    verdict: 'failed',
    blocking: true,
    failureClass: 'contract',
    blockingReasonCode: 'missing-verification-evidence',
    requiredChecks: { missing: ['verification-verdict-path'] },
  };

  assert.equal(inferVerdictScope(stalePhasePayload), 'phase_verification');
  assert.equal(inferBlockerClass(stalePhasePayload), 'verifier_unavailable');
  assert.equal(normalizeVerdictPayload(stalePhasePayload).stale, true);
  assert.equal(inferVerdictScope(runtimePayload), 'runtime');
  assert.equal(inferBlockerClass(runtimePayload), 'runtime_unavailable');
  assert.equal(verdictTargetsRuntime(runtimePayload, 'claude'), true);
  assert.equal(normalizeVerdictPayload(supersededPayload).superseded, true);
  assert.equal(normalizeVerdictPayload(supersededPayload).active, false);
  assert.equal(inferBlockerClass(missingEvidencePayload), 'missing_evidence');
  assert.equal(isRelevantVerificationVerdict({ payload: stalePhasePayload, filePath: '/tmp/verification-verdict-phase02-final.json' }, { activePhaseNumber: 2 }), false);
  assert.equal(isRelevantVerificationVerdict({ payload: supersededPayload, filePath: '/tmp/verification-verdict-phase05-final.json' }, { activePhaseNumber: 5 }), false);
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
