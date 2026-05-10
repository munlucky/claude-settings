import fs from 'node:fs';
import path from 'node:path';

import {
  scenarioEvidencePassed as normalizeScenarioEvidencePassed,
} from '../artifact-normalizer.mjs';
import {
  normalize,
  parseWorksetsYaml,
  readText,
  resolvePath,
  sectionText,
} from './phase-closeout-parsers.mjs';

const PASS_WORDS = /\b(pass|passed|done|verified)\b/i;
const FAIL_WORDS = /\b(fail|failed|blocked|missing|todo|pending|retry)\b/i;
const EXTERNAL_BLOCKER_WORDS = /\b(external|account|credential|credentials|launch|domain|cloudflare|search console|adsense|manual|no-go)\b/i;

function extractPathTokens(text) {
  const result = new Set();
  const regex = /(?:^|[\s`"'(])([A-Za-z0-9_@./\\-]+\.(?:tsx|jsx|ts|js|mjs|cjs|json|yaml|yml|md|sh|py))(?:$|[\s`"',):;])/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const token = match[1].replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
    if (!token.includes('..')) {
      result.add(token);
    }
  }
  return [...result];
}

export function hasConcreteSourceTargets(phaseText) {
  return extractPathTokens(sectionText(phaseText, 'Exact Execution Targets'))
    .some((token) => !token.endsWith('.md') && !token.endsWith('package.json'));
}

export function scenarioEvidencePassed(scenarioId, evidenceText) {
  return normalizeScenarioEvidencePassed(scenarioId, evidenceText) || normalize(evidenceText).split('\n').some((line) => {
    const lowered = line.toLowerCase();
    return lowered.includes(scenarioId.toLowerCase()) && PASS_WORDS.test(line) && !FAIL_WORDS.test(line);
  });
}

export function scorecardDone(scorecardText) {
  return /(?:Verdict|Score verdict):\s*done/i.test(scorecardText)
    || /Current task status:\s*FULL/i.test(scorecardText);
}

export function unresolvedLocalBlocker(text) {
  return normalize(text).split('\n').some((line) => {
    const relevant =
      /Remaining blockers before closeout:/i.test(line)
      || /Stop reason:\s*(blocked|deferred_verification)/i.test(line)
      || /blocking defects\s*=\s*[1-9]/i.test(line);

    if (!relevant || /\bnone\b/i.test(line)) {
      return false;
    }

    if (/\b(no blocking|blocking defects\s*=\s*0|blocking:\s*false)\b/i.test(line)) {
      return false;
    }

    return !EXTERNAL_BLOCKER_WORDS.test(line);
  });
}

export function executionRootFromPhaseArtifact(phase) {
  const candidate = phase.qaReport || phase.sprintContract || phase.handoff || phase.scorecard || '';
  if (!candidate) {
    return '';
  }
  return path.dirname(path.dirname(resolvePath(candidate)));
}

export function traceabilityArtifactValid(filePath, idPattern) {
  if (!filePath || !fs.existsSync(filePath)) {
    return false;
  }
  const text = readText(filePath);
  return idPattern.test(text) && /\b(implemented|verified|pass|passed|done)\b/i.test(text);
}

export function evaluateCompletedWorksets(phaseExecutionDir) {
  const worksetsPath = phaseExecutionDir ? path.join(phaseExecutionDir, 'WORKSETS.yaml') : '';
  const ledger = parseWorksetsYaml(worksetsPath);
  if (!ledger.exists) {
    return { ok: true, reason: 'missing-ledger-allowed', detail: '' };
  }
  if (ledger.tasks.length === 0) {
    return { ok: false, reason: 'atomic-ledger-empty', detail: `${path.relative(process.cwd(), worksetsPath)} has no atomicTasks.` };
  }
  for (const task of ledger.tasks) {
    const taskStatus = task.taskStatus || task.status;
    if (taskStatus !== 'completed') {
      return { ok: false, reason: 'atomic-tasks-incomplete', detail: `${task.id || 'atomic task'} taskStatus is ${taskStatus || 'missing'}.` };
    }
    if (task.ownedPaths.length === 0 || task.verificationCommands.length === 0 || task.evidence.length === 0) {
      return { ok: false, reason: 'atomic-task-evidence-missing', detail: `${task.id || 'atomic task'} lacks ownedPaths, verificationCommands, or evidence.` };
    }
    const acVerdict = String(task.acVerdict || '').trim().toLowerCase();
    if (task.acceptanceCriterionId && ['fail', 'failed', 'blocked', 'rejected'].includes(acVerdict)) {
      return { ok: false, reason: 'atomic-task-ac-verdict-failed', detail: `${task.id || 'atomic task'} AC verdict is ${task.acVerdict || 'missing'}.` };
    }
    if (task.acceptanceCriterionId && !['pass', 'passed', 'verified', 'done', 'not_applicable'].includes(acVerdict)) {
      return { ok: false, reason: 'atomic-task-ac-verdict-incomplete', detail: `${task.id || 'atomic task'} AC verdict is ${task.acVerdict || 'missing'}.` };
    }
    if (task.acceptanceCriterionId && acVerdict !== 'not_applicable' && task.verificationEvidence.length === 0) {
      return { ok: false, reason: 'atomic-task-ac-evidence-missing', detail: `${task.id || 'atomic task'} lacks AC verificationEvidence.` };
    }
  }
  return { ok: true, reason: 'ok', detail: '' };
}
