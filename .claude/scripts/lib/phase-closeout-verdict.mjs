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

function findAttemptManifestPath(phase = {}, phaseExecutionDir = '') {
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
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const candidate = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(candidate);
      } else if (entry.isFile() && entry.name === 'attempt-manifest.json') {
        return candidate;
      }
    }
  }
  return '';
}

function phaseRequiresCanonicalAttempt(phaseNumber, phase = {}, manifestPath = '') {
  if (manifestPath) {
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
  const manifestPath = findAttemptManifestPath(phase, phaseExecutionDir);
  const manifestRequired = phaseRequiresCanonicalAttempt(phaseNumber, phase, manifestPath);
  if (!manifestRequired) {
    return {
      ok: true,
      reason: 'legacy_projection_not_evaluated',
      mode: 'legacy',
      manifestPath: '',
      evidence: [],
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
  return true;
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
  return (normalizedVerdict === 'passed' || normalizedVerdict === 'expected_blocker_passed')
    && parsed.evidenceFresh === true
    && parsed.blocking === false
    && (!scoreVerdict || scoreVerdict === 'done');
}
