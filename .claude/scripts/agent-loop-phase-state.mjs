#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

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

  for (const rawLine of lines) {
    if (/^\s*-\s+number:\s*/.test(rawLine)) {
      if (current) {
        blocks.push(current);
      }
      const match = rawLine.match(/number:\s*([0-9]+)/);
      current = {
        number: match ? match[1] : null,
        status: null,
        planConfirmed: null,
        lastOutcome: null,
        lastUpdatedAt: null,
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
    } else if (stripped.startsWith('lastOutcome:')) {
      current.lastOutcome = stripped.split(':', 2)[1].trim();
    } else if (stripped.startsWith('lastUpdatedAt:')) {
      current.lastUpdatedAt = stripped.split(':', 2)[1].trim();
    }
  }

  if (current) {
    blocks.push(current);
  }

  return blocks;
}

function listStaleInProgressPhases(statusFile, staleSeconds) {
  const now = Date.now();
  const results = [];

  for (const block of readStatusBlocks(statusFile)) {
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

function shellQuote(value) {
  if (value === undefined || value === null) {
    return "''";
  }
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
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

function evaluatePhaseCompletionGate(config) {
  const startEpoch = Number.parseFloat(config.phaseStartEpoch);
  const qaReportPath = config.qaReportPath || '';
  const scorecardPath = config.scorecardPath || '';
  const phaseExecutionDir = config.phaseExecutionDir || '';
  const scorecardRequired = (config.scorecardRequired || 'true').toLowerCase() === 'true';
  const targetScoreDefault = Number.parseInt(config.targetCompletionScore || '100', 10);
  const qaReportDir = qaReportPath ? path.dirname(qaReportPath) : '';

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

  if (qaReportPath && fs.existsSync(qaReportPath)) {
    const qaLines = fs.readFileSync(qaReportPath, 'utf8').split(/\r?\n/);
    let inWorkflow = false;
    let currentHeading = '';
    for (const line of qaLines) {
      const stripped = line.trim();
      if (stripped.startsWith('## ')) {
        currentHeading = stripped;
      }
      if (stripped === '## Workflow Execution') {
        inWorkflow = true;
        continue;
      }
      if (inWorkflow && line.startsWith('## ')) {
        break;
      }
      if (!inWorkflow) {
        continue;
      }
      if (stripped.startsWith('- Selected bundles:')) {
        workflowSection.selected = stripped.split(':', 2)[1]?.trim() || '';
      } else if (stripped.startsWith('- Applied skills:')) {
        workflowSection.applied = stripped.split(':', 2)[1]?.trim() || '';
      } else if (stripped.startsWith('- Skipped skills:')) {
        workflowSection.skipped = stripped.split(':', 2)[1]?.trim() || '';
      }
    }

    currentHeading = '';
    let inVerificationEvidence = false;
    for (const line of qaLines) {
      const stripped = line.trim();
      if (stripped.startsWith('## ')) {
        currentHeading = stripped;
      }
      if (currentHeading === '## Verdict' && stripped.startsWith('- Status:')) {
        qaVerdictPassed = stripped.split(':', 2)[1]?.trim().toLowerCase() === 'passed';
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
    } else if (
      codeChangeDetected &&
      !workflowSection.applied.includes('code-simplifier') &&
      (!workflowSection.skipped.includes('code-simplifier') || workflowSection.skipped.toLowerCase().includes('not evaluated yet'))
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

  if (latestScorePayload) {
    currentScore = Number.parseInt(latestScorePayload.current ?? 0, 10);
    targetScore = Number.parseInt(latestScorePayload.target ?? targetScoreDefault, 10);
    unmetItems = Number.parseInt(latestScorePayload.unmetChecklistItems ?? 0, 10);
    blockingDefects = Number.parseInt(latestScorePayload.blockingDefects ?? 0, 10);
    scoreVerdict = String(latestScorePayload.verdict ?? 'missing').trim().toLowerCase().replace(/ /g, '_');
    scoreSource = 'verifier-artifact';
  } else if (scorecardRequired) {
    if (!scorecardPath || !fs.existsSync(scorecardPath)) {
      scoreReason = 'scorecard-missing';
    } else {
      const scoreLines = fs.readFileSync(scorecardPath, 'utf8').split(/\r?\n/);
      for (const line of scoreLines) {
        const stripped = line.trim();
        let match = stripped.match(/^- Current score:\s*([0-9]+)\s*$/);
        if (match) {
          currentScore = Number.parseInt(match[1], 10);
          continue;
        }
        match = stripped.match(/^- Target score:\s*([0-9]+)\s*$/);
        if (match) {
          targetScore = Number.parseInt(match[1], 10);
          continue;
        }
        match = stripped.match(/^- Unmet checklist items:\s*([0-9]+)\s*$/);
        if (match) {
          unmetItems = Number.parseInt(match[1], 10);
          continue;
        }
        match = stripped.match(/^- Blocking defects:\s*([0-9]+)\s*$/);
        if (match) {
          blockingDefects = Number.parseInt(match[1], 10);
          continue;
        }
        match = stripped.match(/^- Verdict:\s*([A-Za-z_ -]+)\s*$/);
        if (match) {
          scoreVerdict = match[1].trim().toLowerCase().replace(/ /g, '_');
        }
      }
      scoreSource = 'scorecard-markdown';
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
    }
  }

  if (passedPaths.length === 0 && failures.length === 0 && qaFreshEvidence && (qaVerificationLines.length > 0 || qaVerdictPassed)) {
    passedPaths.push(qaReportPath || 'qa-report-fallback');
  }

  const allowed = passedPaths.length > 0 && failures.length === 0 && workflowReason === 'ok' && scoreReason === 'ok';
  const reason = allowed
    ? 'ok'
    : failures[0] || (workflowReason !== 'ok' ? workflowReason : (scoreReason !== 'ok' ? scoreReason : 'no-fresh-verification-artifact'));

  return {
    PHASE_COMPLETION_ALLOWED: allowed ? 'true' : 'false',
    PHASE_COMPLETION_REASON: reason,
    PHASE_COMPLETION_ARTIFACTS: passedPaths.join('\n'),
    PHASE_COMPLETION_SCORE: String(currentScore),
    PHASE_COMPLETION_TARGET: String(targetScore),
    PHASE_COMPLETION_UNMET: String(unmetItems),
    PHASE_COMPLETION_BLOCKERS: String(blockingDefects),
    PHASE_COMPLETION_SCORE_VERDICT: scoreVerdict,
    PHASE_COMPLETION_SCORE_SOURCE: scoreSource,
  };
}

function updatePhaseState(config) {
  const statusFile = config.statusFile;
  if (!fs.existsSync(statusFile)) {
    return;
  }

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
  const itemIndent = block[0].length - block[0].trimStart().length;
  const topIndent = ' '.repeat(itemIndent + 2);
  const attemptIndent = ' '.repeat(itemIndent + 4);

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

  function getAttemptValue(name, defaultValue) {
    const [startIdx, endIdx] = ensureAttemptsBlock();
    const prefix = `${attemptIndent}${name}:`;
    for (let index = startIdx + 1; index < endIdx; index += 1) {
      if (block[index].startsWith(prefix)) {
        return [index, block[index].split(':', 2)[1].trim().replace(/^"|"$/g, '')];
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

  lines.splice(start, end - start, ...block);

  if (config.newStatus === 'in_progress' && config.activePhaseDoc) {
    setRootMappingValue('signals', 'phaseAttemptMode', 'true');
    setRootMappingValue('artifacts', 'activePhaseDocPath', `"${config.activePhaseDoc}"`);
  } else {
    removeRootKey('signals');
    removeRootKey('artifacts');
  }

  fs.writeFileSync(statusFile, `${lines.join('\n')}\n`, 'utf8');
}

function printUsage() {
  console.error([
    'Usage:',
    '  agent-loop-phase-state.mjs list-stale-in-progress-phases <status-file> [stale-seconds]',
    '  agent-loop-phase-state.mjs evaluate-phase-completion-gate <phase-start-epoch> <qa-report-path> <scorecard-path> <phase-execution-dir> <scorecard-required> <target-completion-score>',
    '  agent-loop-phase-state.mjs update-phase-state <status-file> <phase-num> <new-status> <timestamp> <last-outcome> <increment-attempt> <active-phase-doc> <sprint-contract> <qa-report> <handoff> <scorecard>',
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
      console.log(phase);
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
    });
    for (const [key, value] of Object.entries(result)) {
      console.log(`${key}=${shellQuote(value)}`);
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
  default:
    printUsage();
    process.exit(64);
}
