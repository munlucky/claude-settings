import fs from 'node:fs';
import path from 'node:path';

import { readCurrentArtifacts } from './current-artifacts-state.mjs';
import { validateAttemptManifest } from './phase-attempt-manifest.mjs';
import {
  isRelevantVerificationVerdict,
  resolveGitTreeFingerprint,
} from '../verification-verdict-state.mjs';

function toPosixPath(value) {
  return String(value || '').replace(/\\/g, '/');
}

function resolveCandidatePath(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  return path.isAbsolute(text) ? text : path.resolve(process.cwd(), text);
}

function listAttemptManifestPaths(start) {
  if (!start || !fs.existsSync(start)) {
    return [];
  }
  const matches = [];
  const stack = [start];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const candidate = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(candidate);
      } else if (entry.isFile() && entry.name === 'attempt-manifest.json') {
        matches.push(candidate);
      }
    }
  }
  return matches.sort();
}

function manifestTimestampMs(manifest = {}) {
  for (const key of ['runnerFinishedAt', 'runnerStartedAt']) {
    const time = Date.parse(manifest?.[key] || '');
    if (Number.isFinite(time)) {
      return time;
    }
  }
  return 0;
}

function readManifestSummary(manifestPath) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const number = Number(manifest?.phaseNumber);
    return {
      path: manifestPath,
      phaseNumber: Number.isFinite(number) ? number : null,
      timestampMs: manifestTimestampMs(manifest),
      attemptId: String(manifest?.attemptId || ''),
    };
  } catch {
    return {
      path: manifestPath,
      phaseNumber: null,
      timestampMs: 0,
      attemptId: '',
    };
  }
}

function bestManifestForPhase(manifestPaths, phaseNumber) {
  const expected = Number(phaseNumber);
  if (!Number.isFinite(expected)) {
    return '';
  }
  return manifestPaths
    .map(readManifestSummary)
    .filter((entry) => entry.phaseNumber === expected)
    .sort((a, b) => b.timestampMs - a.timestampMs || b.attemptId.localeCompare(a.attemptId) || b.path.localeCompare(a.path))[0]?.path || '';
}

function findAttemptManifestPath(phase = {}, phaseExecutionDir = '', phaseNumber = null) {
  const explicit = resolveCandidatePath(
    phase.attemptManifestPath
      || phase.attemptManifest
      || phase.canonicalAttemptManifest
      || phase.manifestPath
      || '',
  );
  if (explicit) {
    return explicit;
  }
  const root = resolveCandidatePath(phaseExecutionDir);
  if (!root || !fs.existsSync(root)) {
    return '';
  }
  const manifests = listAttemptManifestPaths(root);
  return bestManifestForPhase(manifests, phaseNumber) || manifests[0] || '';
}

function phaseRequiresCanonicalAttempt(phaseNumber, phase = {}, manifestPath = '') {
  if (manifestPath) {
    return true;
  }
  if (phase.manifestRequired === true || Number(phase.schemaVersion) >= 1) {
    return true;
  }
  const explicitMode = String(
    phase.completionGateMode
      || phase.completionMode
      || phase.closeoutMode
      || '',
  ).toLowerCase();
  return explicitMode === 'attemptmanifestrequired'
    || explicitMode === 'attempt_manifest_required'
    || Number(phaseNumber) >= 2;
}

function verifierFailureReason(verdict) {
  if (!verdict.exists || verdict.parseError || verdict.relevant === false) {
    return '';
  }
  return verdictPassed(verdict) ? '' : 'attempt_manifest_verifier_failed';
}

export function evaluateCompletionGateVerdict({
  phaseNumber,
  phase = {},
  verdict = {},
  phaseExecutionDir = '',
} = {}) {
  const manifestPath = findAttemptManifestPath(phase, phaseExecutionDir, phaseNumber);
  const manifestRequired = phaseRequiresCanonicalAttempt(phaseNumber, phase, manifestPath);
  if (!manifestRequired) {
    return {
      ok: true,
      reason: 'legacy_grandfathered_by_cutoff',
      mode: 'legacy',
      manifestPath: '',
      evidence: ['pre-enforcement legacy projection has no schemaVersion or manifestRequired signal'],
    };
  }
  if (!manifestPath || !fs.existsSync(manifestPath)) {
    return {
      ok: false,
      reason: 'orphan_projection_completion',
      mode: 'legacyProjectionOnly',
      manifestPath: manifestPath ? toPosixPath(path.relative(process.cwd(), manifestPath)) : '',
      evidence: ['completed phase projection has no enforced attempt manifest'],
    };
  }
  const manifestValidation = validateAttemptManifest(manifestPath, { requireFinalizerSeal: true });
  if (!manifestValidation.ok) {
    return {
      ok: false,
      reason: manifestValidation.reason === 'worker_liveness_unknown'
        ? 'incomplete_attempt_manifest'
        : manifestValidation.reason,
      mode: 'attemptManifestRequired',
      manifestPath: toPosixPath(path.relative(process.cwd(), manifestPath)),
      evidence: ['attempt manifest exists but is missing child identity, exit patch, or finalizer seal'],
      manifest: manifestValidation.manifest,
    };
  }
  const verifierReason = verifierFailureReason(verdict);
  if (verifierReason) {
    return {
      ok: false,
      reason: verifierReason,
      mode: 'attemptManifestRequired',
      manifestPath: toPosixPath(path.relative(process.cwd(), manifestPath)),
      evidence: ['attempt manifest is sealed but verifier verdict is not a fresh pass'],
      manifest: manifestValidation.manifest,
    };
  }
  return {
    ok: true,
    reason: 'ok',
    mode: 'attemptManifestRequired',
    manifestPath: toPosixPath(path.relative(process.cwd(), manifestPath)),
    evidence: [
      'manifest intent present',
      'child identity present',
      'exit patch present',
      'finalizer seal present',
      'verifier verdict passed',
    ],
    manifest: manifestValidation.manifest,
  };
}

function buildVerdictIdentity({ phase = {}, statusRoot = {}, statusPath = '', planDir = '', masterPlan = '', currentArtifactsMode = 'current', verdictPayload = {} } = {}) {
  const legacyMode = ['legacy', 'history'].includes(String(currentArtifactsMode || '').trim().toLowerCase());
  const verdictIdentity = verdictPayload.identity && typeof verdictPayload.identity === 'object'
    ? verdictPayload.identity
    : {};
  const archivedPhaseDoc = phase.archivedPhaseDoc || '';
  const activePhaseDoc = phase.activePhaseDoc || phase.plan || phase.phaseDocPath || phase.docPath || '';
  const verdictPhaseDoc = verdictIdentity.activePhaseDocPath || '';
  const expectedPhaseDoc = activePhaseDoc
    && verdictPhaseDoc
    && path.resolve(verdictPhaseDoc) === path.resolve(activePhaseDoc)
    ? activePhaseDoc
    : (archivedPhaseDoc || activePhaseDoc);
  return {
    runLeaseId: phase.runLeaseId || phase.lastRunLeaseId || verdictIdentity.runLeaseId || statusRoot.activeRunLeaseId || statusRoot.lastRunLeaseId || '',
    activePhaseDocPath: expectedPhaseDoc,
    masterPlan: masterPlan ? path.resolve(masterPlan) : '',
    planDir: planDir ? path.resolve(planDir) : '',
    statusFile: statusPath ? path.resolve(statusPath) : '',
    gitTreeFingerprint: legacyMode ? '' : (verdictIdentity.gitTreeFingerprint || resolveGitTreeFingerprint(process.cwd())),
  };
}

export function readVerdictForPhase(phaseNumber, context = {}) {
  const phaseId = String(phaseNumber).padStart(2, '0');
  const canonicalVerdictPath = path.resolve(process.cwd(), `.claude/verification-verdict-phase${phaseId}-final.json`);
  const current = readCurrentArtifacts({
    root: process.cwd(),
    mode: context.currentArtifactsMode || 'current',
    indexPath: context.currentArtifactsPath || '',
  });
  const currentVerdictArtifact = current.ok
    ? current.artifacts.find((entry) => path.resolve(entry.path) === canonicalVerdictPath)
    : null;
  const verdictPath = currentVerdictArtifact?.path || canonicalVerdictPath;

  if (!current.ok) {
    return {
      path: verdictPath,
      exists: fs.existsSync(verdictPath),
      relevant: false,
      staleReason: current.reason || 'current-artifacts-unavailable',
      currentArtifacts: current,
    };
  }
  if (!currentVerdictArtifact) {
    return {
      path: verdictPath,
      exists: fs.existsSync(verdictPath),
      relevant: false,
      staleReason: 'canonical-verdict-not-current',
      currentArtifacts: current,
    };
  }
  if (!fs.existsSync(verdictPath)) {
    return { path: verdictPath, exists: false, currentArtifacts: current };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(verdictPath, 'utf8'));
    const relevant = isRelevantVerificationVerdict(
      { payload: parsed, filePath: verdictPath },
      {
        activePhaseNumber: Number.parseInt(String(phaseNumber), 10),
        candidatePath: verdictPath,
        identity: buildVerdictIdentity({ ...context, verdictPayload: parsed }),
        now: context.now || '',
      },
    );
    return {
      path: verdictPath,
      exists: true,
      parsed,
      relevant,
      staleReason: relevant ? '' : 'stale-or-mismatched-verdict',
      currentArtifacts: current,
    };
  } catch (error) {
    return { path: verdictPath, exists: true, parseError: error.message, currentArtifacts: current };
  }
}

export function verdictInternallyConsistent(parsed = {}) {
  const verdict = String(parsed.verdict || '').trim().toLowerCase();
  const scoreVerdict = String(parsed.score?.verdict || '').trim().toLowerCase();
  const commands = Array.isArray(parsed.commands) ? parsed.commands : [];
  const environmentBlockers = Array.isArray(parsed.environmentBlockers) ? parsed.environmentBlockers : [];
  const allCommandsPassed = commands.length > 0
    && commands.every((command) => String(command.status || '').trim().toLowerCase() === 'passed');
  const alternatePolicy = evaluateDeclaredAlternateVerifierPolicy(parsed);

  if (parsed.blocking === true && verdict === 'passed') {
    return false;
  }
  if (parsed.blocking === true && allCommandsPassed && scoreVerdict === 'done') {
    return false;
  }
  if (verdict === 'passed' && ['blocked', 'retry', 'failed'].includes(scoreVerdict)) {
    return false;
  }
  if (verdict === 'expected_blocker_passed' && ['blocked', 'retry', 'failed'].includes(scoreVerdict)) {
    return false;
  }
  if (environmentBlockers.length > 0 && verdict === 'passed' && scoreVerdict === 'done') {
    return false;
  }
  if (alternatePolicy.applies && !alternatePolicy.allowed) {
    return false;
  }
  return true;
}

function normalizeVerifierStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeVerifierPolicy(parsed = {}) {
  const policy = parsed.verifierPolicy && typeof parsed.verifierPolicy === 'object'
    ? parsed.verifierPolicy
    : {};
  const required = policy.requiredVerifier && typeof policy.requiredVerifier === 'object'
    ? policy.requiredVerifier
    : {};
  const alternate = policy.alternateVerifier && typeof policy.alternateVerifier === 'object'
    ? policy.alternateVerifier
    : {};

  return {
    requiredVerifier: {
      id: String(required.id || required.verifierId || '').trim(),
      command: String(required.command || '').trim(),
      errorCode: String(required.errorCode || required.code || '').trim().toUpperCase(),
      failureClass: String(required.failureClass || required.blockerClass || '').trim().toLowerCase(),
      detail: String(required.detail || required.error || required.stderr || '').trim(),
    },
    alternateVerifier: {
      id: String(alternate.id || alternate.verifierId || '').trim(),
      requiredVerifierId: String(alternate.requiredVerifierId || alternate.requiredVerifier || '').trim(),
      command: String(alternate.command || '').trim(),
      status: normalizeVerifierStatus(alternate.status || alternate.verdict),
      declared: alternate.declared === true,
      evidencePath: String(alternate.evidencePath || '').trim(),
    },
  };
}

export function evaluateDeclaredAlternateVerifierPolicy(parsed = {}) {
  const policy = parsed.verifierPolicy && typeof parsed.verifierPolicy === 'object'
    ? parsed.verifierPolicy
    : null;
  if (!policy) {
    return { applies: false, allowed: true, reason: 'no_alternate_verifier_policy', evidence: [] };
  }

  const { requiredVerifier, alternateVerifier } = normalizeVerifierPolicy(parsed);
  const requiredId = requiredVerifier.id;
  const alternateRequiredId = alternateVerifier.requiredVerifierId || requiredId;
  const requiredDetail = `${requiredVerifier.errorCode} ${requiredVerifier.failureClass} ${requiredVerifier.detail}`.trim();
  const requiredEperm = /(?:EPERM|EACCES|permission denied|access is denied|operation not permitted|spawn blocked)/i.test(requiredDetail)
    && /(?:verification_environment_unavailable|verifier_unavailable|node_spawn_eperm|spawn_blocked|environment)/i.test(requiredDetail);
  const alternatePassed = ['pass', 'passed', 'done', 'verified', 'expected_blocker_passed'].includes(alternateVerifier.status);
  const verdict = String(parsed.verdict || '').trim().toLowerCase();

  if (verdict === 'passed') {
    return {
      applies: true,
      allowed: false,
      reason: 'alternate_verifier_requires_warning_completion',
      evidence: ['declared alternate verifier evidence cannot become clean success'],
    };
  }
  if (!requiredId || !alternateVerifier.id || alternateRequiredId !== requiredId) {
    return {
      applies: true,
      allowed: false,
      reason: 'alternate_verifier_required_link_missing',
      evidence: ['alternate verifier evidence is not linked to the required verifier'],
    };
  }
  if (!requiredEperm) {
    return {
      applies: true,
      allowed: false,
      reason: 'required_verifier_eperm_missing',
      evidence: ['required verifier failure is not preserved as EPERM/EACCES verifier unavailability'],
    };
  }
  if (!alternateVerifier.declared) {
    return {
      applies: true,
      allowed: false,
      reason: 'alternate_verifier_undeclared',
      evidence: ['undeclared alternate verifier evidence is supporting-only'],
    };
  }
  if (!alternatePassed) {
    return {
      applies: true,
      allowed: false,
      reason: 'declared_alternate_verifier_not_passed',
      evidence: ['declared alternate verifier did not pass'],
    };
  }
  return {
    applies: true,
    allowed: true,
    reason: 'declared_alternate_verifier_warning_completion',
    evidence: [
      'required verifier EPERM detail preserved',
      'declared alternate verifier passed',
      'completion remains warning-only',
    ],
  };
}

export function verdictPassed(verdict) {
  if (!verdict.exists || verdict.parseError) {
    return false;
  }
  if (verdict.relevant === false) {
    return false;
  }
  const parsed = verdict.parsed || {};
  if (!verdictInternallyConsistent(parsed)) {
    return false;
  }
  const scoreVerdict = parsed.score?.verdict;
  const normalizedVerdict = String(parsed.verdict || '').trim().toLowerCase();
  const alternatePolicy = evaluateDeclaredAlternateVerifierPolicy(parsed);
  if (alternatePolicy.applies && !alternatePolicy.allowed) {
    return false;
  }
  return (normalizedVerdict === 'passed' || normalizedVerdict === 'expected_blocker_passed')
    && parsed.evidenceFresh === true
    && parsed.blocking === false
    && (!scoreVerdict || scoreVerdict === 'done');
}
