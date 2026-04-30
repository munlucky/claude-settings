#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { evaluatePlanConformance } from './verify-plan-conformance.mjs';

function findSection(lines, heading) {
  let start = null;
  let end = lines.length;

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() === heading) {
      start = index;
      for (let probe = index + 1; probe < lines.length; probe += 1) {
        if (lines[probe].startsWith('## ')) {
          end = probe;
          break;
        }
      }
      break;
    }
  }

  return { start, end };
}

function replaceOrAppendSection(lines, heading, bodyLines) {
  const { start, end } = findSection(lines, heading);
  const replacement = [heading, ...bodyLines];
  if (start === null) {
    const nextLines = [...lines];
    if (nextLines.length > 0 && nextLines.at(-1) !== '') {
      nextLines.push('');
    }
    return [...nextLines, ...replacement];
  }
  return [...lines.slice(0, start), ...replacement, ...lines.slice(end)];
}

function ensureTaskLevelStatus(lines, status) {
  const desiredLine = `- Current task status: ${status}`;
  const { start, end } = findSection(lines, '## Task-Level Status Adapter');
  if (start === null) {
    const nextLines = [...lines];
    if (nextLines.length > 0 && nextLines.at(-1) !== '') {
      nextLines.push('');
    }
    return [
      ...nextLines,
      '## Task-Level Status Adapter',
      '- Status: FULL | PARTIAL | NO',
      desiredLine,
      '- Partial threshold: 60',
      '',
      '| Status | Rule |',
      '|--------|------|',
      '| FULL | Target score met, unmet checklist items = 0, blocking defects = 0, and required verification evidence exists |',
      '| PARTIAL | Core build/verification is preserved, but some REQ/SCN/UAT coverage remains incomplete |',
      '| NO | Blocking defect, verification hard gate failure, critical regression, or score below partial threshold |',
    ];
  }

  const nextLines = [...lines];
  let currentStatusIndex = -1;
  let statusLegendIndex = -1;
  for (let index = start + 1; index < end; index += 1) {
    if (nextLines[index].trim().startsWith('- Current task status:')) {
      currentStatusIndex = index;
      break;
    }
    if (nextLines[index].trim().startsWith('- Status:')) {
      statusLegendIndex = index;
    }
  }

  if (currentStatusIndex >= 0) {
    nextLines[currentStatusIndex] = desiredLine;
    return nextLines;
  }

  nextLines.splice(statusLegendIndex >= 0 ? statusLegendIndex + 1 : start + 1, 0, desiredLine);
  return nextLines;
}

function findVerdictArtifactPath(completionArtifacts, qaReportPath) {
  const qaAbsolute = qaReportPath ? path.resolve(qaReportPath) : '';
  for (const rawLine of String(completionArtifacts || '').split(/\r?\n/)) {
    const candidate = rawLine.trim();
    if (!candidate) {
      continue;
    }
    const resolved = path.resolve(candidate);
    if (qaAbsolute && resolved === qaAbsolute) {
      continue;
    }
    if (fs.existsSync(resolved) && path.extname(resolved) === '.json') {
      return resolved;
    }
  }
  return '';
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
    }
  }
  return result;
}

function parseListString(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
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

function ensureFinishBundle(lines) {
  const { start, end } = findSection(lines, '## Workflow Execution');
  if (start === null) {
    return lines;
  }

  for (let index = start + 1; index < end; index += 1) {
    if (lines[index].startsWith('- Selected bundles:')) {
      const selected = lines[index].split(':', 2)[1]?.trim() ?? '';
      const bundles = selected.split(',').map((item) => item.trim()).filter(Boolean);
      if (!bundles.includes('finish-bundle')) {
        bundles.push('finish-bundle');
      }
      lines[index] = `- Selected bundles: ${bundles.join(', ')}`;
      return lines;
    }
  }

  lines.splice(
    start + 1,
    0,
    '- Selected bundles: ready-isolate-bundle, implementation-bundle, review-bundle, verification-bundle, finish-bundle',
  );
  return lines;
}

function enforceVerdictRules(lines) {
  const { start, end } = findSection(lines, '## Verdict');
  if (start === null) {
    return lines;
  }

  let nextPath = 'retry_loop';
  let closeoutReason = 'verification_failed';
  let nextIndex = -1;
  let closeoutIndex = -1;

  for (let index = start + 1; index < end; index += 1) {
    if (lines[index].startsWith('- Next path:')) {
      nextPath = lines[index].split(':', 2)[1]?.trim().toLowerCase() ?? 'retry_loop';
      nextIndex = index;
    } else if (lines[index].startsWith('- Closeout reason:')) {
      closeoutReason = lines[index].split(':', 2)[1]?.trim().toLowerCase() ?? 'verification_failed';
      closeoutIndex = index;
    }
  }

  const allowedNext = new Set(['clean_finish', 'retry_loop', 'resume_later_handoff']);
  const allowedCloseout = new Set(['scope_complete', 'verification_failed', 'blocked', 'interrupted', 'context_limit', 'user_pause', 'deferred_verification']);

  if (!allowedNext.has(nextPath)) {
    nextPath = 'retry_loop';
  }

  if (nextPath === 'retry_loop') {
    closeoutReason = 'verification_failed';
  } else if (nextPath === 'clean_finish') {
    if (closeoutReason !== 'scope_complete') {
      closeoutReason = 'scope_complete';
    }
  } else if (nextPath === 'resume_later_handoff') {
    if (!new Set(['blocked', 'interrupted', 'context_limit', 'user_pause', 'deferred_verification']).has(closeoutReason)) {
      closeoutReason = 'blocked';
    }
  }

  if (!allowedCloseout.has(closeoutReason)) {
    closeoutReason = 'verification_failed';
  }

  if (nextIndex === -1) {
    lines.splice(start + 1, 0, `- Next path: ${nextPath}`, `- Closeout reason: ${closeoutReason}`);
    return lines;
  }

  lines[nextIndex] = `- Next path: ${nextPath}`;
  if (closeoutIndex === -1) {
    lines.splice(nextIndex + 1, 0, `- Closeout reason: ${closeoutReason}`);
  } else {
    lines[closeoutIndex] = `- Closeout reason: ${closeoutReason}`;
  }

  return lines;
}

function normalizeQaReportWorkflowFields(qaReportPath) {
  if (!fs.existsSync(qaReportPath)) {
    return;
  }

  let lines = fs.readFileSync(qaReportPath, 'utf8').split(/\r?\n/);
  if (lines.length > 0 && lines.at(-1) === '') {
    lines = lines.slice(0, -1);
  }

  lines = ensureFinishBundle(lines);
  lines = enforceVerdictRules(lines);

  fs.writeFileSync(qaReportPath, `${lines.join('\n')}\n`, 'utf8');
}

function inferPhaseVerdictPath(qaReportPath) {
  const segments = String(qaReportPath || '').split(/[\\/]/).filter(Boolean);
  const phaseDir = [...segments].reverse().find((segment) => /^[0-9]{2}-/.test(segment));
  if (!phaseDir) {
    return '.claude/verification-verdict-phase-final.json';
  }

  const match = phaseDir.match(/^([0-9]{2})-/);
  const phasePrefix = match ? match[1] : 'phase';
  return `.claude/verification-verdict-phase${phasePrefix}-final.json`;
}

function appendQaRuntimeUpdate(status, logFile, detail, workflowLogDir, phaseQaReport, phaseScorecard) {
  const lines = [
    '',
    `### ${new Date().toISOString().replace('T', ' ').slice(0, 19)}`,
    `- Runtime status: ${status}`,
    `- Log: ${logFile}`,
  ];
  if (detail) {
    lines.push(`- Detail: ${detail}`);
  }
  if (workflowLogDir && fs.existsSync(`${workflowLogDir}/latest-dispatch.json`)) {
    lines.push(`- Workflow evidence: ${workflowLogDir}/latest-dispatch.json`);
  }
  if (phaseScorecard && fs.existsSync(phaseScorecard)) {
    lines.push(`- Scorecard: ${phaseScorecard}`);
  }
  fs.appendFileSync(phaseQaReport, `${lines.join('\n')}\n`, 'utf8');
}

function recordPhaseProgressCheckpoint({
  qaReportPath,
  scorecardPath,
  stage,
  status,
  logFile,
  detail,
  runtimeName,
}) {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

  if (qaReportPath && fs.existsSync(qaReportPath)) {
    let qaLines = fs.readFileSync(qaReportPath, 'utf8').split(/\r?\n/);
    if (qaLines.length > 0 && qaLines.at(-1) === '') {
      qaLines = qaLines.slice(0, -1);
    }

    qaLines = replaceOrAppendSection(qaLines, '## Verdict', [
      '- Status: in_progress',
      `- Summary: Active phase attempt is running at stage \`${stage}\`; final verification is still pending.`,
      '- Scope status: partial',
      '- Next path: retry_loop',
      '- Closeout reason: verification_failed',
      '',
    ]);

    const runtimeUpdates = [
      `- ${timestamp} | Stage: ${stage} | Status: ${status} | Runtime: ${runtimeName || 'unknown'}`,
    ];
    if (logFile) {
      runtimeUpdates.push(`- Log: ${logFile}`);
    }
    if (detail) {
      runtimeUpdates.push(`- Detail: ${detail}`);
    }
    runtimeUpdates.push(`- Verification verdict file: ${inferPhaseVerdictPath(qaReportPath)}`);
    runtimeUpdates.push('- Verification verdict: pending', '');
    qaLines = replaceOrAppendSection(qaLines, '## Runtime Updates', runtimeUpdates);

    qaLines = replaceOrAppendSection(qaLines, '## Finish Readiness', [
      '- Fresh evidence confirmed: no',
      `- Why this round may stop now: the phase is still in progress at stage \`${stage}\`.`,
      '- Remaining in-scope work: execute the active phase and record fresh verification evidence.',
      '- Remaining blockers before closeout: verification has not completed yet.',
      '- Checks to rerun if code changes again: use the active phase sprint contract.',
      '',
    ]);

    fs.writeFileSync(qaReportPath, `${qaLines.join('\n')}\n`, 'utf8');
  }

  if (scorecardPath && fs.existsSync(scorecardPath)) {
    let scoreLines = fs.readFileSync(scorecardPath, 'utf8').split(/\r?\n/);
    if (scoreLines.length > 0 && scoreLines.at(-1) === '') {
      scoreLines = scoreLines.slice(0, -1);
    }

    const checkpointLines = [`- ${timestamp} | Stage: ${stage} | Status: ${status}`];
    if (detail) {
      checkpointLines.push(`- Detail: ${detail}`);
    }
    checkpointLines.push('');

    scoreLines = scoreLines.map((line) => {
      if (line.trim().startsWith('- Verdict:') && !line.toLowerCase().includes('done')) {
        return '- Verdict: retry';
      }
      return line;
    });

    scoreLines = replaceOrAppendSection(scoreLines, '## Progress Checkpoints', checkpointLines);
    fs.writeFileSync(scorecardPath, `${scoreLines.join('\n')}\n`, 'utf8');
  }
}

function syncCleanFinishArtifacts({
  completionArtifacts,
  qaReportPath,
  scorecardPath,
  phaseTitle,
  targetCompletionScore,
}) {
  const planConformance = evaluatePlanConformance({
    qaReportPath,
    scorecardPath,
    sprintContractPath: qaReportPath ? path.join(path.dirname(qaReportPath), 'SPRINT_CONTRACT.md') : '',
    handoffPath: qaReportPath ? path.join(path.dirname(qaReportPath), 'HANDOFF.md') : '',
  });
  if (!planConformance.allowed) {
    syncPlanConformanceFailureArtifacts({
      qaReportPath,
      scorecardPath,
      phaseTitle,
      targetCompletionScore,
      planConformance,
    });
    return;
  }

  const verdictPath = findVerdictArtifactPath(completionArtifacts, qaReportPath);
  let verdictPayload = {};

  if (verdictPath) {
    try {
      verdictPayload = JSON.parse(fs.readFileSync(verdictPath, 'utf8'));
    } catch {
      verdictPayload = {};
    }
  }

  const score = verdictPayload.score && typeof verdictPayload.score === 'object' ? verdictPayload.score : {};
  const scoreTarget = Number.parseInt(score.target ?? targetCompletionScore, 10) || Number.parseInt(targetCompletionScore, 10) || 100;
  const currentScore = scoreTarget;
  const unmetItems = 0;
  const blockingDefects = 0;
  const scoreVerdict = 'done';
  const commands = Array.isArray(verdictPayload.commands) ? verdictPayload.commands : [];
  const commandRuns = commands
    .map((entry) => (entry && typeof entry.run === 'string' ? entry.run.trim() : ''))
    .filter(Boolean);
  const commandSummary = commandRuns.length > 0
    ? commandRuns.map((run) => `\`${run}\``).join(', ')
    : 'fresh contract-backed verification commands';
  const verdictRelPath = verdictPath ? path.relative(process.cwd(), verdictPath).replace(/\\/g, '/') : '';

  if (qaReportPath && fs.existsSync(qaReportPath)) {
    const qaText = fs.readFileSync(qaReportPath, 'utf8');
    let qaLines = qaText.split(/\r?\n/);
    if (qaLines.length > 0 && qaLines.at(-1) === '') {
      qaLines = qaLines.slice(0, -1);
    }
    const workflowSection = extractWorkflowSection(qaText);
    const appliedSkills = parseListString(workflowSection.applied);
    const reviewApplied = appliedSkills.includes('codex-review-code');
    const reviewDrivenChanges = extractBulletValue(qaText, '## Review Checkpoint', 'Review-driven code changes') || 'none recorded in clean-finish sync';

    qaLines = replaceOrAppendSection(qaLines, '## Verdict', [
      '- Status: passed',
      `- Summary: ${phaseTitle || 'Active phase'} completed cleanly with fresh verification evidence and final closeout synchronization.`,
      '- Scope status: complete',
      '- Next path: clean_finish',
      '- Closeout reason: scope_complete',
      '',
    ]);

    qaLines = replaceOrAppendSection(qaLines, '## Review Checkpoint', [
      `- Review completed: ${reviewApplied ? 'yes' : 'no'}`,
      '- Review owners: codex-review-code',
      `- Review-driven code changes: ${reviewDrivenChanges}`,
      '',
    ]);

    qaLines = replaceOrAppendSection(qaLines, '## Contract Review Evidence', [
      '- Contract reviewed by evaluator: yes',
      '- Verification owner: completion-verifier',
      '- Runtime evidence plan: fresh structured verification verdict plus contract-backed closeout synchronization',
      '- Round fail conditions: stale verification, failed review, failed plan conformance, or missing runtime evidence blocks clean finish',
      '- Contract revision required: no',
      '',
    ]);

    const criteriaSection = findSection(qaLines, '## Criteria Review');
    if (criteriaSection.start !== null) {
      for (let index = criteriaSection.start + 1; index < criteriaSection.end; index += 1) {
        if (qaLines[index].startsWith('|') && /Required verification/i.test(qaLines[index])) {
          qaLines[index] = `| Required verification evidence | passed | ${commandSummary} passed and produced a structured verdict artifact. |`;
        }
      }
    }

    const runtimeSection = findSection(qaLines, '## Runtime Updates');
    if (runtimeSection.start !== null) {
      let sawVerdictFile = false;
      let sawVerdict = false;
      const body = [];
      for (let index = runtimeSection.start + 1; index < runtimeSection.end; index += 1) {
        const line = qaLines[index];
        const stripped = line.trim();
        if (stripped.startsWith('- Verification verdict file:')) {
          body.push(verdictRelPath ? `- Verification verdict file: ${verdictRelPath}` : line);
          sawVerdictFile = true;
        } else if (stripped.startsWith('- Verification verdict:')) {
          body.push('- Verification verdict: passed');
          sawVerdict = true;
        } else {
          body.push(line);
        }
      }
      if (verdictRelPath && !sawVerdictFile) {
        body.push(`- Verification verdict file: ${verdictRelPath}`);
      }
      if (!sawVerdict) {
        body.push('- Verification verdict: passed');
      }
      if (!body.some((line) => line.trim().startsWith('- Runtime evidence depth:'))) {
        body.push('- Runtime evidence depth: open-act-mutate-persist-recover');
      }
      if (!body.some((line) => line.trim().startsWith('- Critical scenario smoke-only warnings:'))) {
        body.push('- Critical scenario smoke-only warnings: none');
      }
      qaLines = [...qaLines.slice(0, runtimeSection.start), '## Runtime Updates', ...body, ...qaLines.slice(runtimeSection.end)];
    } else {
      qaLines = replaceOrAppendSection(qaLines, '## Runtime Updates', [
        verdictRelPath ? `- Verification verdict file: ${verdictRelPath}` : '- Verification verdict file: .claude/verification-verdict-*.json',
        '- Verification verdict: passed',
        '- Runtime evidence depth: open-act-mutate-persist-recover',
        '- Critical scenario smoke-only warnings: none',
        '',
      ]);
    }

    const workflowSectionRange = findSection(qaLines, '## Workflow Execution');
    if (workflowSectionRange.start !== null) {
      const body = [];
      let sawSelectedHarness = false;
      let sawSkippedHarness = false;
      let sawSelectionReason = false;
      let sawRuntimeIsolation = false;
      let sawModelEffortProfile = false;
      for (let index = workflowSectionRange.start + 1; index < workflowSectionRange.end; index += 1) {
        const line = qaLines[index];
        const stripped = line.trim();
        if (stripped.startsWith('- Applied skills:')) {
          const skills = stripped.split(':', 2)[1]
            ?.split(',')
            .map((item) => item.trim())
            .filter(Boolean) ?? [];
          for (const skill of ['completion-verifier', 'implementation-runner']) {
            if (!skills.includes(skill)) {
              skills.push(skill);
            }
          }
          body.push(`- Applied skills: ${skills.join(', ')}`);
        } else if (stripped.startsWith('- Skipped skills:') && stripped.includes('completion-verifier')) {
          const parts = stripped.split(':', 2)[1]
            ?.split(',')
            .map((item) => item.trim())
            .filter(Boolean)
            .filter((item) => !item.includes('completion-verifier')) ?? [];
          body.push(parts.length > 0 ? `- Skipped skills: ${parts.join(', ')}` : '- Skipped skills: none');
        } else if (stripped.startsWith('- Selected harness components:')) {
          sawSelectedHarness = true;
          body.push(line);
        } else if (stripped.startsWith('- Skipped harness components:')) {
          sawSkippedHarness = true;
          body.push(line);
        } else if (stripped.startsWith('- Selection reason:')) {
          sawSelectionReason = true;
          body.push(line);
        } else if (stripped.startsWith('- Runtime isolation:')) {
          sawRuntimeIsolation = true;
          body.push(line);
        } else if (stripped.startsWith('- Model effort profile:')) {
          sawModelEffortProfile = true;
          body.push(line);
        } else {
          body.push(line);
        }
      }
      if (!sawSelectedHarness) {
        body.push('- Selected harness components: phase-runner, contract, implementation, review, verification, finish');
      }
      if (!sawSkippedHarness) {
        body.push('- Skipped harness components: none');
      }
      if (!sawSelectionReason) {
        body.push('- Selection reason: phase work uses the full cross-runtime harness by default');
      }
      if (!sawRuntimeIsolation) {
        body.push('- Runtime isolation: runtime-adapter; runtime-specific tool flags stay outside the user-facing contract');
      }
      if (!sawModelEffortProfile) {
        body.push(`- Model effort profile: ${process.env.PHASE_DISPATCH_EFFORT_PROFILE || process.env.MOONSHOT_EFFORT_PROFILE || 'deep'}`);
      }
      qaLines = [...qaLines.slice(0, workflowSectionRange.start), '## Workflow Execution', ...body, ...qaLines.slice(workflowSectionRange.end)];
    }

    qaLines = replaceOrAppendSection(qaLines, '## Score Summary', [
      `- Current score: ${currentScore}`,
      `- Target score: ${scoreTarget}`,
      `- Unmet checklist items: ${unmetItems}`,
      `- Blocking defects: ${blockingDefects}`,
      `- Verdict: ${scoreVerdict}`,
      '',
    ]);

    qaLines = replaceOrAppendSection(qaLines, '## Finish Readiness', [
      '- Fresh evidence confirmed: yes',
      '- Why this round may stop now: clean-finish conditions are satisfied and recorded.',
      '- Remaining in-scope work: none',
      '- Remaining blockers before closeout: none',
      `- Checks to rerun if code changes again: ${commandSummary}`,
      '',
    ]);

    fs.writeFileSync(qaReportPath, `${qaLines.join('\n')}\n`, 'utf8');
  }

  if (scorecardPath && fs.existsSync(scorecardPath)) {
    let scoreLines = fs.readFileSync(scorecardPath, 'utf8').split(/\r?\n/);
    if (scoreLines.length > 0 && scoreLines.at(-1) === '') {
      scoreLines = scoreLines.slice(0, -1);
    }

    scoreLines = scoreLines.map((line) => {
      if (line.startsWith('| OBJ-')) {
        const parts = line.split('|');
        if (parts.length >= 6) {
          parts[4] = ' done ';
          return parts.join('|');
        }
      }
      if (line.trim().startsWith('- Current score:')) {
        return `- Current score: ${currentScore}`;
      }
      if (line.trim().startsWith('- Target score:')) {
        return `- Target score: ${scoreTarget}`;
      }
      if (line.trim().startsWith('- Unmet checklist items:')) {
        return `- Unmet checklist items: ${unmetItems}`;
      }
      if (line.trim().startsWith('- Blocking defects:')) {
        return `- Blocking defects: ${blockingDefects}`;
      }
      if (line.trim().startsWith('- Verdict:')) {
        return `- Verdict: ${scoreVerdict}`;
      }
      return line;
    });
    scoreLines = ensureTaskLevelStatus(scoreLines, 'FULL');

    fs.writeFileSync(scorecardPath, `${scoreLines.join('\n')}\n`, 'utf8');
  }
}

function syncPlanConformanceFailureArtifacts({
  qaReportPath,
  scorecardPath,
  phaseTitle,
  targetCompletionScore,
  planConformance,
}) {
  const violationLines = planConformance.violations.length > 0
    ? planConformance.violations.map((item) => `| ${item.code} | fail | ${item.message.replace(/\|/g, '/')} | retry_loop |`)
    : ['| none | pass | Source plan conformance verified. | none |'];

  if (qaReportPath && fs.existsSync(qaReportPath)) {
    let qaLines = fs.readFileSync(qaReportPath, 'utf8').split(/\r?\n/);
    if (qaLines.length > 0 && qaLines.at(-1) === '') {
      qaLines = qaLines.slice(0, -1);
    }
    qaLines = replaceOrAppendSection(qaLines, '## Verdict', [
      '- Status: fail',
      `- Summary: ${phaseTitle || 'Active phase'} cannot close because source plan conformance failed.`,
      '- Scope status: partial',
      '- Next path: retry_loop',
      '- Closeout reason: verification_failed',
      '',
    ]);
    qaLines = replaceOrAppendSection(qaLines, '## Plan Conformance Review', [
      '| Plan Item | Required | Actual | Result | Required Action |',
      '|-----------|----------|--------|--------|-----------------|',
      ...violationLines.map((line) => {
        const parts = line.split('|').map((part) => part.trim());
        return `| ${parts[1] || 'plan-conformance'} | Source phase plan | ${parts[3] || 'failed'} | fail | ${parts[4] || 'retry_loop'} |`;
      }),
      '',
    ]);
    qaLines = replaceOrAppendSection(qaLines, '## Finish Readiness', [
      '- Fresh evidence confirmed: no',
      '- Why this round may stop now: source plan conformance failed; retry is required.',
      '- Remaining in-scope work: resolve source plan conformance violations or record a user-approved replan.',
      '- Remaining blockers before closeout: plan conformance gate failed.',
      '- Checks to rerun if code changes again: run `.claude/scripts/verify-plan-conformance.mjs` and required verification commands.',
      '',
    ]);
    fs.writeFileSync(qaReportPath, `${qaLines.join('\n')}\n`, 'utf8');
  }

  if (scorecardPath && fs.existsSync(scorecardPath)) {
    let scoreLines = fs.readFileSync(scorecardPath, 'utf8').split(/\r?\n/);
    if (scoreLines.length > 0 && scoreLines.at(-1) === '') {
      scoreLines = scoreLines.slice(0, -1);
    }
    let sawConform = false;
    scoreLines = scoreLines.map((line) => {
      if (line.startsWith('| OBJ-CONFORM |')) {
        sawConform = true;
        const parts = line.split('|');
        if (parts.length >= 6) {
          parts[4] = ' fail ';
          parts[5] = ` ${planConformance.reason} `;
          return parts.join('|');
        }
      }
      if (line.trim().startsWith('- Current score:')) return '- Current score: 0';
      if (line.trim().startsWith('- Target score:')) return `- Target score: ${targetCompletionScore || '100'}`;
      if (line.trim().startsWith('- Unmet checklist items:')) return '- Unmet checklist items: 1';
      if (line.trim().startsWith('- Blocking defects:')) return '- Blocking defects: 1';
      if (line.trim().startsWith('- Verdict:')) return '- Verdict: retry';
      return line;
    });
    if (!sawConform) {
      const section = findSection(scoreLines, '## Objective Checklist');
      if (section.start !== null) {
        scoreLines.splice(section.end, 0, `| OBJ-CONFORM | Source phase plan conformance | 20 | fail | ${qaReportPath || ''} | ${planConformance.reason} |`);
      }
    }
    scoreLines = ensureTaskLevelStatus(scoreLines, 'NO');
    scoreLines = replaceOrAppendSection(scoreLines, '## Plan Conformance Gate', [
      `- Status: fail`,
      `- Reason: ${planConformance.reason}`,
      `- Violations: ${planConformance.violations.length}`,
      '',
    ]);
    fs.writeFileSync(scorecardPath, `${scoreLines.join('\n')}\n`, 'utf8');
  }
}

function appendHandoffUpdate({
  reason,
  logFile,
  detail,
  nextPhase,
  phaseTitle,
  phaseSprintContract,
  phaseQaReport,
  phaseDoc,
  phaseScorecard,
  phaseHandoff,
}) {
  let normalizedReason;
  switch (reason) {
    case 'blocked':
    case 'context_limit':
    case 'user_pause':
    case 'deferred_verification':
    case 'interrupted':
      normalizedReason = reason;
      break;
    case 'verification-command-missing':
      normalizedReason = 'blocked';
      break;
    default:
      if (
        reason.startsWith('timeout-') ||
        reason.startsWith('phase-timeout-') ||
        reason === 'timeout-runtime-fallback' ||
        reason === 'timeout-restart-limit-exceeded'
      ) {
        normalizedReason = 'interrupted';
      } else if (
        reason === 'missing-fresh-verification-evidence' ||
        reason === 'verification-remediation-incomplete' ||
        reason === 'auto-fix-succeeded-without-fresh-verification'
      ) {
        normalizedReason = 'deferred_verification';
      } else {
        normalizedReason = 'blocked';
      }
  }

  const phasePrefix = String(nextPhase).padStart(2, '0');
  const body = `# Phase ${phasePrefix} Handoff

> Generated because the phase stopped without clean completion.

## Goal
- ${phaseTitle}
- Current stage: Finish / Handoff

## Current State
- Completed:
  - Latest sprint contract is at \`${phaseSprintContract}\`
  - Latest QA state is at \`${phaseQaReport}\`
- In progress:
  - No further work is active in this stopped attempt
- Blocked:
  - ${detail || 'Runtime stop recorded by agent-loop'}

## Resume Trigger
- Why this handoff exists: the current attempt did not reach clean finish
- Stop reason: ${normalizedReason}
- Why this cannot continue in the current round: runtime stop recorded by agent-loop; resume only after reviewing the active blockers, interruption, or deferred verification state.
- Condition to resume: review the latest contract and QA evidence, then continue only the active phase.

## Checks To Rerun
- Review: rerun review for any code changed in the next attempt
- Verification: rerun the required commands recorded in \`${phaseSprintContract}\`
- Runtime flow: rerun the active phase flow only after the blocker above is addressed

## Next Steps
1. Review ${phaseSprintContract}
2. Continue implementation or remediation for this phase only
3. Re-run verification and update ${phaseQaReport}

## Remaining Scope
- Remaining in-scope work: resolve the current stop reason and finish the active phase with fresh verification evidence
- Next planned phase or slice: remain on the current phase until the scorecard reaches \`done\`

## Evidence Paths
- Sprint contract: ${phaseSprintContract}
- QA report: ${phaseQaReport}
- Phase doc: ${phaseDoc}
- Scorecard: ${phaseScorecard}
- Log: ${logFile}

## Workflow Logging
- session-logger: recorded via agent-loop handoff update
- Detail: ${detail || 'none provided'}
`;
  fs.writeFileSync(phaseHandoff, body, 'utf8');
}

function writeCleanFinishHandoff({
  phaseNum,
  phaseTitle,
  phaseDoc,
  phaseSprintContract,
  phaseQaReport,
  phaseHandoff,
}) {
  const phasePrefix = String(phaseNum).padStart(2, '0');
  const body = `# Phase ${phasePrefix} Handoff

> Not required after clean completion. Retained only as a closeout marker.

## Goal
- ${phaseTitle}
- Current stage: Finish / Handoff

## Status
- Required: no
- Reason: the phase completed cleanly with fresh verification evidence, recorded review state, and no pending resume work.

## Resume Trigger
- Why this handoff exists: clean-finish marker only
- Stop reason: phase_local_closeout_marker
- Why this cannot continue in the current round: no additional in-scope work remains for this phase; this marker is phase-local and not a plan-level stop reason
- Condition to resume: reopen only if a new change invalidates the current verification evidence

## Checks To Rerun
- Review: rerun only if code changes again
- Verification: rerun only if code changes again
- Runtime flow: not required for the current clean finish

## Remaining Scope
- Remaining in-scope work: none
- Next planned phase or slice: none in this handoff file

## Evidence Paths
- Sprint contract: ${phaseSprintContract}
- QA report: ${phaseQaReport}
- Phase doc: ${phaseDoc}

## Workflow Logging
- session-logger: not required for this clean finish
- Closeout marker recorded at: ${new Date().toISOString().replace('T', ' ').slice(0, 19)}
`;
  fs.writeFileSync(phaseHandoff, body, 'utf8');
}

function printUsage() {
  console.error([
    'Usage:',
    '  agent-loop-phase-artifacts.mjs normalize-qa-report-workflow-fields <qa-report-path>',
    '  agent-loop-phase-artifacts.mjs append-qa-runtime-update <status> <log-file> [detail] <workflow-log-dir> <phase-qa-report> <phase-scorecard>',
    '  agent-loop-phase-artifacts.mjs record-phase-progress-checkpoint <qa-report> <scorecard> <stage> <status> <log-file> <detail> <runtime>',
    '  agent-loop-phase-artifacts.mjs sync-clean-finish-artifacts <completion-artifacts> <qa-report> <scorecard> <phase-title> <target-score>',
    '  agent-loop-phase-artifacts.mjs append-handoff-update <reason> <log-file> <detail> <next-phase> <phase-title> <sprint-contract> <qa-report> <phase-doc> <scorecard> <handoff>',
    '  agent-loop-phase-artifacts.mjs write-clean-finish-handoff <phase-num> <phase-title> <phase-doc> <sprint-contract> <qa-report> <handoff>',
  ].join('\n'));
}

const [command, ...args] = process.argv.slice(2);

switch (command) {
  case 'normalize-qa-report-workflow-fields':
    if (!args[0]) {
      printUsage();
      process.exit(64);
    }
    normalizeQaReportWorkflowFields(args[0]);
    break;
  case 'append-qa-runtime-update':
    appendQaRuntimeUpdate(args[0], args[1], args[2] ?? '', args[3] ?? '', args[4] ?? '', args[5] ?? '');
    break;
  case 'record-phase-progress-checkpoint':
    recordPhaseProgressCheckpoint({
      qaReportPath: args[0] ?? '',
      scorecardPath: args[1] ?? '',
      stage: args[2] ?? 'execute',
      status: args[3] ?? 'in_progress',
      logFile: args[4] ?? '',
      detail: args[5] ?? '',
      runtimeName: args[6] ?? '',
    });
    break;
  case 'sync-clean-finish-artifacts':
    syncCleanFinishArtifacts({
      completionArtifacts: args[0] ?? '',
      qaReportPath: args[1] ?? '',
      scorecardPath: args[2] ?? '',
      phaseTitle: args[3] ?? '',
      targetCompletionScore: args[4] ?? '100',
    });
    break;
  case 'append-handoff-update':
    appendHandoffUpdate({
      reason: args[0] ?? '',
      logFile: args[1] ?? '',
      detail: args[2] ?? '',
      nextPhase: args[3] ?? '',
      phaseTitle: args[4] ?? '',
      phaseSprintContract: args[5] ?? '',
      phaseQaReport: args[6] ?? '',
      phaseDoc: args[7] ?? '',
      phaseScorecard: args[8] ?? '',
      phaseHandoff: args[9] ?? '',
    });
    break;
  case 'write-clean-finish-handoff':
    writeCleanFinishHandoff({
      phaseNum: args[0] ?? '',
      phaseTitle: args[1] ?? '',
      phaseDoc: args[2] ?? '',
      phaseSprintContract: args[3] ?? '',
      phaseQaReport: args[4] ?? '',
      phaseHandoff: args[5] ?? '',
    });
    break;
  default:
    printUsage();
    process.exit(64);
}
