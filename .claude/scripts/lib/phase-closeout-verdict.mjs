import fs from 'node:fs';
import path from 'node:path';

import {
  isRelevantVerificationVerdict,
  resolveGitTreeFingerprint,
} from '../verification-verdict-state.mjs';

function buildVerdictIdentity({ phase = {}, statusRoot = {}, statusPath = '', planDir = '', masterPlan = '' } = {}) {
  return {
    runLeaseId: statusRoot.activeRunLeaseId || statusRoot.lastRunLeaseId || '',
    activePhaseDocPath: phase.archivedPhaseDoc || phase.plan || phase.phaseDocPath || phase.docPath || '',
    masterPlan: masterPlan ? path.resolve(masterPlan) : '',
    planDir: planDir ? path.resolve(planDir) : '',
    statusFile: statusPath ? path.resolve(statusPath) : '',
    gitTreeFingerprint: resolveGitTreeFingerprint(process.cwd()),
  };
}

export function readVerdictForPhase(phaseNumber, context = {}) {
  const phaseId = String(phaseNumber).padStart(2, '0');
  const verdictPath = path.resolve(process.cwd(), `.claude/verification-verdict-phase${phaseId}-final.json`);
  if (!fs.existsSync(verdictPath)) {
    return { path: verdictPath, exists: false };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(verdictPath, 'utf8'));
    const relevant = isRelevantVerificationVerdict(
      { payload: parsed, filePath: verdictPath },
      {
        activePhaseNumber: Number.parseInt(String(phaseNumber), 10),
        candidatePath: verdictPath,
        identity: buildVerdictIdentity(context),
        now: context.now || '',
      },
    );
    return {
      path: verdictPath,
      exists: true,
      parsed,
      relevant,
      staleReason: relevant ? '' : 'stale-or-mismatched-verdict',
    };
  } catch (error) {
    return { path: verdictPath, exists: true, parseError: error.message };
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
  return parsed.verdict === 'passed'
    && parsed.evidenceFresh === true
    && parsed.blocking === false
    && (!scoreVerdict || scoreVerdict === 'done');
}
