import fs from 'node:fs';
import path from 'node:path';

import { readCurrentArtifacts } from './current-artifacts-state.mjs';
import {
  isRelevantVerificationVerdict,
  resolveGitTreeFingerprint,
} from '../verification-verdict-state.mjs';

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
