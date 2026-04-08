#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const WORKFLOW_LOG_DIR = process.env.WORKFLOW_ENFORCEMENT_LOG_DIR || '.claude/logs/workflow-enforcement';
const STATUS_FILE_DEFAULT = '.claude/docs/phase-status.yaml';

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

function collectCandidateFiles(args) {
  if (process.env.WORKFLOW_ENFORCEMENT_FILES) {
    return process.env.WORKFLOW_ENFORCEMENT_FILES.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  }
  if (args.length > 0) {
    return args;
  }
  const inside = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' });
  if (inside.error || (inside.status ?? 1) !== 0) {
    return [];
  }
  const status = spawnSync('git', ['status', '--short'], { encoding: 'utf8' });
  if (status.error || (status.status ?? 1) !== 0) {
    return [];
  }
  return status.stdout.split(/\r?\n/).map((line) => {
    const trimmed = line.replace(/^.. /, '');
    return trimmed.includes(' -> ') ? trimmed.split(' -> ').at(-1) : trimmed;
  }).map((item) => item.trim()).filter(Boolean);
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
    }
  }
  return result;
}

function parseListString(value) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
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

function isWorkflowArtifact(filePath) {
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized === '.claude/docs/phase-status.yaml') return true;
  if (normalized.startsWith('.claude/logs/agent-loop/')) return true;
  if (normalized.startsWith('.claude/logs/workflow-enforcement/')) return true;
  return normalized.includes('/execution/') && (
    normalized.endsWith('/SPRINT_CONTRACT.md') ||
    normalized.endsWith('/QA_REPORT.md') ||
    normalized.endsWith('/HANDOFF.md')
  );
}

const codeSuffixes = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.py', '.rb', '.go', '.rs',
  '.java', '.kt', '.kts', '.cs', '.php', '.swift', '.scala', '.sh', '.bash',
  '.zsh', '.ps1', '.psm1', '.c', '.cc', '.cpp', '.cxx', '.h', '.hh', '.hpp', '.hxx',
]);

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
  });
  if (!options.analysisPath) {
    throw new Error('record-bounded requires --analysis-path');
  }

  fs.mkdirSync(WORKFLOW_LOG_DIR, { recursive: true });
  const analysisPath = options.analysisPath;
  const qaReportPath = options.qaReportPath || '';
  const handoffPath = options.handoffPath || '';
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

  if (qaReportPath && fs.existsSync(qaReportPath)) {
    const section = extractWorkflowSection(fs.readFileSync(qaReportPath, 'utf8'));
    if (section.selected) selectedBundles = parseListString(section.selected);
    if (section.applied) appliedSkills = parseListString(section.applied);
    if (section.skipped) skippedSkills = parseListString(section.skipped);
  }

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
    '  evidenceFiles:',
    `    analysisContext: ${yamlScalar(analysisPath)}`,
    `    qaReport: ${yamlScalar(qaReportPath)}`,
    `    handoff: ${yamlScalar(handoffPath)}`,
  ];

  let lines = fs.existsSync(analysisPath)
    ? fs.readFileSync(analysisPath, 'utf8').split(/\r?\n/)
    : ['schemaVersion: "1.0"'];
  if (!fs.existsSync(analysisPath)) {
    fs.mkdirSync(path.dirname(analysisPath), { recursive: true });
  }
  let start = lines.findIndex((line) => line.startsWith('workflowEvidence:'));
  let end = lines.length;
  if (start >= 0) {
    for (let index = start + 1; index < lines.length; index += 1) {
      if (lines[index] && !lines[index].startsWith(' ') && !lines[index].startsWith('\t')) {
        end = index;
        break;
      }
    }
    lines = [...lines.slice(0, start), ...workflowBlock, ...lines.slice(end)];
  } else {
    if (lines.length > 0 && lines.at(-1)?.trim()) {
      lines.push('');
    }
    lines.push(...workflowBlock);
  }
  fs.writeFileSync(analysisPath, `${lines.join('\n')}\n`, 'utf8');

  const payload = {
    evidenceVersion: '1.0',
    recordedAt: utcTimestamp(),
    source: 'moonshot-orchestrator',
    mode: 'bounded-direct',
    analysisPath,
    qaReportPath,
    handoffPath,
    selectedBundles,
    requiredSkills,
    stageOrder,
    appliedSkills,
    skippedSkills,
    evidenceFiles: {
      analysisContext: analysisPath,
      qaReport: qaReportPath || null,
      handoff: handoffPath || null,
    },
  };
  const logFile = path.join(WORKFLOW_LOG_DIR, 'latest-bounded.json');
  fs.writeFileSync(logFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Workflow enforcement bounded evidence recorded: ${logFile}`);
}

function verifyEnforcement(argv) {
  const files = collectCandidateFiles(argv);
  const latestDispatch = path.join(WORKFLOW_LOG_DIR, 'latest-dispatch.json');
  const latestBounded = path.join(WORKFLOW_LOG_DIR, 'latest-bounded.json');
  const forceTrace = String(process.env.WORKFLOW_ENFORCEMENT_REQUIRE_TRACE || '').toLowerCase() === 'true';
  const normalizedFiles = files.map((item) => item.replace(/\\/g, '/'));
  const analysisFiles = files.filter((filePath, index) => normalizedFiles[index] === '.claude/docs/moonshot-analysis.yaml' || normalizedFiles[index].endsWith('/moonshot-analysis.yaml'));
  const sprintContracts = files.filter((filePath) => filePath.endsWith('/SPRINT_CONTRACT.md') || filePath.endsWith('\\SPRINT_CONTRACT.md'));
  const qaReports = files.filter((filePath) => filePath.endsWith('/QA_REPORT.md') || filePath.endsWith('\\QA_REPORT.md'));
  const handoffs = files.filter((filePath) => filePath.endsWith('/HANDOFF.md') || filePath.endsWith('\\HANDOFF.md'));
  const requiresPhaseTrace = files.some((filePath) => isWorkflowArtifact(filePath));
  const requiresBoundedTrace = analysisFiles.length > 0;
  const requiresTrace = forceTrace || requiresPhaseTrace || requiresBoundedTrace;
  const codeChangeDetected = files.some((filePath) => codeSuffixes.has(path.extname(filePath).toLowerCase()));
  const violations = [];

  if (!requiresTrace) {
    console.log('Workflow enforcement: not applicable');
    return;
  }

  if (requiresPhaseTrace) {
    if (!fs.existsSync(latestDispatch)) {
      violations.push('missing latest dispatch evidence at .claude/logs/workflow-enforcement/latest-dispatch.json');
    } else {
      const payload = JSON.parse(fs.readFileSync(latestDispatch, 'utf8'));
      for (const key of ['planDir', 'executionMode', 'executionRoot', 'runtime']) {
        if (!payload[key]) {
          violations.push(`dispatch evidence missing '${key}'`);
        }
      }
      for (const key of ['selectedBundles', 'requiredSkills', 'stageOrder']) {
        if (!Array.isArray(payload[key]) || payload[key].length === 0) {
          violations.push(`dispatch evidence missing non-empty '${key}'`);
        }
      }
      for (const bundle of ['review-bundle', 'verification-bundle', 'finish-bundle']) {
        if (!payload.selectedBundles?.includes(bundle)) {
          violations.push(`dispatch evidence must include '${bundle}' in selectedBundles`);
        }
      }
    }

    if (qaReports.length === 0) {
      violations.push('workflow trace required but no QA_REPORT.md change detected');
    }

    for (const sprintContract of sprintContracts) {
      if (!fs.existsSync(sprintContract)) {
        violations.push(`missing sprint contract: ${sprintContract}`);
        continue;
      }
      const text = fs.readFileSync(sprintContract, 'utf8');
      for (const heading of ['## Stage Order', '## Review Cadence', '## Finish Rule']) {
        if (!sectionExists(text, heading)) {
          violations.push(`${sprintContract}: missing '${heading}' section`);
        }
      }
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
      const section = extractWorkflowSection(text);
      if (Object.keys(section).length === 0) {
        violations.push(`${qaReport}: missing '## Workflow Execution' section`);
        continue;
      }
      for (const [key, label] of [['selected', 'Selected bundles'], ['applied', 'Applied skills'], ['skipped', 'Skipped skills']]) {
        if (!section[key]) {
          violations.push(`${qaReport}: '${label}' must be filled with evidence, not placeholder text`);
        }
      }
      const applied = section.applied || '';
      const skipped = section.skipped || '';
      const selected = section.selected || '';
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
      const nextPath = extractBulletValue(text, '## Verdict', 'Next path');
      const closeoutReason = extractBulletValue(text, '## Verdict', 'Closeout reason');
      const stopWhy = extractBulletValue(text, '## Finish Readiness', 'Why this round may stop now');
      const remainingScope = extractBulletValue(text, '## Finish Readiness', 'Remaining in-scope work');
      const closeoutFieldsPresent = Boolean(scopeStatus || nextPath || closeoutReason || stopWhy || remainingScope);
      if (closeoutFieldsPresent) {
        if (!['complete', 'partial'].includes(scopeStatus)) {
          violations.push(`${qaReport}: 'Scope status' must be complete or partial`);
        }
        if (!['clean_finish', 'retry_loop', 'resume_later_handoff'].includes(nextPath)) {
          violations.push(`${qaReport}: 'Next path' must be clean_finish, retry_loop, or resume_later_handoff`);
        }
        if (!['scope_complete', 'verification_failed', 'blocked', 'interrupted', 'context_limit', 'user_pause', 'deferred_verification'].includes(closeoutReason)) {
          violations.push(`${qaReport}: 'Closeout reason' must use an allowed reason code`);
        }
        if (!stopWhy) violations.push(`${qaReport}: 'Why this round may stop now' must be filled`);
        if (!remainingScope) violations.push(`${qaReport}: 'Remaining in-scope work' must be filled`);
        const lowered = stopWhy.toLowerCase();
        if (lowered.includes('checkpoint') || lowered.includes('milestone')) {
          violations.push(`${qaReport}: milestone-only stop reasons are invalid`);
        }
        if (nextPath === 'clean_finish') {
          if (scopeStatus !== 'complete') violations.push(`${qaReport}: clean_finish requires Scope status = complete`);
          if (closeoutReason !== 'scope_complete') violations.push(`${qaReport}: clean_finish requires Closeout reason = scope_complete`);
        } else if (nextPath === 'retry_loop') {
          if (closeoutReason !== 'verification_failed') violations.push(`${qaReport}: retry_loop requires Closeout reason = verification_failed`);
        } else if (nextPath === 'resume_later_handoff' && !['blocked', 'interrupted', 'context_limit', 'user_pause', 'deferred_verification'].includes(closeoutReason)) {
          violations.push(`${qaReport}: resume_later_handoff requires a real stop reason, not scope_complete or verification_failed`);
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
      if (!text.includes('session-logger')) {
        violations.push(`${handoff}: incomplete stop evidence must mention session-logger`);
      }
      const stopReason = extractBulletValue(text, '## Resume Trigger', 'Stop reason');
      const stopWhy = extractBulletValue(text, '## Resume Trigger', 'Why this cannot continue in the current round');
      const remainingScope = extractBulletValue(text, '## Remaining Scope', 'Remaining in-scope work');
      const handoffFieldsPresent = Boolean(stopReason || stopWhy || remainingScope) || sectionExists(text, '## Remaining Scope');
      if (handoffFieldsPresent) {
        if (!sectionExists(text, '## Remaining Scope')) violations.push(`${handoff}: missing '## Remaining Scope' section`);
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

  if (requiresBoundedTrace) {
    if (fs.existsSync(latestBounded)) {
      const payload = JSON.parse(fs.readFileSync(latestBounded, 'utf8'));
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
      const payload = parseSimpleYaml(fs.readFileSync(analysisFile, 'utf8'));
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
      if (selected.length === 0) violations.push(`${analysisFile}: workflowEvidence.selectedBundles must be non-empty`);
      if (required.length === 0) violations.push(`${analysisFile}: workflowEvidence.requiredSkills must be non-empty`);
      if (stageOrder.length === 0) violations.push(`${analysisFile}: workflowEvidence.stageOrder must be non-empty`);
      if (applied.length === 0) violations.push(`${analysisFile}: workflowEvidence.appliedSkills must be non-empty`);
      if (skipped.length === 0) violations.push(`${analysisFile}: workflowEvidence.skippedSkills must be non-empty`);
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

main();
