#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_OUTPUT_ROOT = '.claude/logs/meta-harness-trace';
const DEFAULT_WORKFLOW_LOG_DIR = '.claude/logs/workflow-enforcement';
const DEFAULT_AGENT_LOG_DIR = '.claude/logs/agent-loop';

function usage() {
  console.error([
    'Usage:',
    '  meta-harness-trace.mjs capture --trace-id <id> --phase-status <path> --analysis <path> --qa-report <path> --handoff <path> --scorecard <path> [--workflow-log-dir <path>] [--agent-log-dir <path>] [--output-root <path>]',
  ].join('\n'));
}

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift() || '';
  const options = {};

  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case '--trace-id':
        options.traceId = args.shift() ?? '';
        break;
      case '--phase-status':
        options.phaseStatusPath = args.shift() ?? '';
        break;
      case '--analysis':
        options.analysisPath = args.shift() ?? '';
        break;
      case '--qa-report':
        options.qaReportPath = args.shift() ?? '';
        break;
      case '--handoff':
        options.handoffPath = args.shift() ?? '';
        break;
      case '--scorecard':
        options.scorecardPath = args.shift() ?? '';
        break;
      case '--workflow-log-dir':
        options.workflowLogDir = args.shift() ?? '';
        break;
      case '--agent-log-dir':
        options.agentLogDir = args.shift() ?? '';
        break;
      case '--output-root':
        options.outputRoot = args.shift() ?? '';
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return { command, options };
}

function readTextIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return '';
  }
  return fs.readFileSync(filePath, 'utf8');
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function parseYamlScalar(value) {
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
  const root = {};
  const stack = [{ indent: -1, container: root }];
  const lines = String(text || '').split(/\r?\n/);

  function nextMeaningful(index) {
    for (let probe = index + 1; probe < lines.length; probe += 1) {
      const stripped = lines[probe].trim();
      if (!stripped || stripped.startsWith('#')) {
        continue;
      }
      return {
        indent: lines[probe].length - lines[probe].trimStart().length,
        stripped,
      };
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

    while (stack.length > 1 && indent <= stack.at(-1).indent) {
      stack.pop();
    }

    const container = stack.at(-1).container;
    if (stripped.startsWith('- ')) {
      if (Array.isArray(container)) {
        container.push(parseYamlScalar(stripped.slice(2)));
      }
      continue;
    }

    const separator = stripped.indexOf(':');
    if (separator <= 0 || Array.isArray(container)) {
      continue;
    }

    const key = stripped.slice(0, separator).trim();
    const value = stripped.slice(separator + 1).trim();
    if (!value) {
      const next = nextMeaningful(index);
      const nested = next && next.indent > indent && next.stripped.startsWith('- ') ? [] : {};
      container[key] = nested;
      stack.push({ indent, container: nested });
      continue;
    }

    container[key] = parseYamlScalar(value);
  }

  return root;
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

function extractSection(text, heading) {
  const lines = String(text || '').split(/\r?\n/);
  const result = [];
  let inSection = false;
  for (const line of lines) {
    if (line.trim() === heading) {
      inSection = true;
      result.push(line);
      continue;
    }
    if (inSection && line.startsWith('## ')) {
      break;
    }
    if (inSection) {
      result.push(line);
    }
  }
  return result;
}

function parsePhaseStatus(statusPath, qaReportPath) {
  const text = readTextIfExists(statusPath);
  if (!text) {
    return null;
  }

  const lines = text.split(/\r?\n/);
  const phases = [];
  let current = null;
  let inAttempts = false;

  for (const rawLine of lines) {
    if (/^\s*-\s+number:\s*/.test(rawLine)) {
      if (current) phases.push(current);
      const number = Number.parseInt(rawLine.match(/number:\s*([0-9]+)/)?.[1] || '', 10);
      current = { number, title: '', status: '', qaReport: '', handoff: '', scorecard: '', sprintContract: '', attempts: {} };
      inAttempts = false;
      continue;
    }
    if (!current) {
      continue;
    }

    const stripped = rawLine.trim();
    if (stripped === 'attempts:') {
      inAttempts = true;
      continue;
    }
    if (inAttempts && !rawLine.startsWith('      ')) {
      inAttempts = false;
    }

    if (inAttempts) {
      if (stripped.startsWith('total:')) current.attempts.total = stripped.split(':', 2)[1].trim();
      if (stripped.startsWith('lastOutcome:')) current.attempts.lastOutcome = stripped.split(':', 2)[1].trim();
      if (stripped.startsWith('lastUpdatedAt:')) current.attempts.lastUpdatedAt = stripped.split(':', 2)[1].trim().replace(/^"|"$/g, '');
      continue;
    }

    if (stripped.startsWith('title:')) current.title = stripped.split(':', 2)[1].trim().replace(/^"|"$/g, '');
    else if (stripped.startsWith('status:')) current.status = stripped.split(':', 2)[1].trim();
    else if (stripped.startsWith('qaReport:')) current.qaReport = stripped.split(':', 2)[1].trim().replace(/^"|"$/g, '');
    else if (stripped.startsWith('handoff:')) current.handoff = stripped.split(':', 2)[1].trim().replace(/^"|"$/g, '');
    else if (stripped.startsWith('scorecard:')) current.scorecard = stripped.split(':', 2)[1].trim().replace(/^"|"$/g, '');
    else if (stripped.startsWith('sprintContract:')) current.sprintContract = stripped.split(':', 2)[1].trim().replace(/^"|"$/g, '');
    else if (stripped.startsWith('completedAt:')) current.completedAt = stripped.split(':', 2)[1].trim().replace(/^"|"$/g, '');
  }
  if (current) phases.push(current);

  if (qaReportPath) {
    const match = phases.find((phase) => phase.qaReport === qaReportPath);
    if (match) {
      return match;
    }
  }
  return phases.find((phase) => phase.status === 'in_progress') || phases.find((phase) => phase.status === 'completed') || null;
}

function findVerdictPath(qaReportPath) {
  const qaText = readTextIfExists(qaReportPath);
  const explicit = extractBulletValue(qaText, '## Runtime Updates', 'Verification verdict file');
  if (explicit) {
    return explicit;
  }
  const qaDir = path.basename(path.dirname(qaReportPath || ''));
  const match = qaDir.match(/^([0-9]{2})-/);
  return match ? `.claude/verification-verdict-phase${match[1]}-final.json` : '.claude/verification-verdict-phase-final.json';
}

function fileSummary(kind, filePath) {
  const resolved = String(filePath || '');
  if (!resolved) {
    return { kind, path: '', exists: false };
  }
  const exists = fs.existsSync(resolved);
  if (!exists) {
    return { kind, path: resolved, exists: false };
  }
  const stat = fs.statSync(resolved);
  return {
    kind,
    path: resolved,
    exists: true,
    sizeBytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
  };
}

function uniqueLines(lines) {
  const seen = new Set();
  const result = [];
  for (const line of lines) {
    const normalized = line.trim();
    if (!normalized) {
      continue;
    }
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(line);
  }
  return result;
}

function trimTextForDiagnosis(text) {
  const lines = String(text || '').split(/\r?\n/);
  const matched = new Set();
  const patterns = [
    /error/i,
    /fail/i,
    /warn/i,
    /retry/i,
    /block/i,
    /closeout/i,
    /verdict/i,
    /stop reason/i,
    /next path/i,
    /review completed/i,
    /score/i,
    /selected bundles/i,
    /applied skills/i,
    /skipped skills/i,
    /remaining /i,
    /condition to resume/i,
  ];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith('## ')) {
      continue;
    }
    if (!patterns.some((pattern) => pattern.test(line))) {
      continue;
    }
    for (let probe = Math.max(0, index - 1); probe <= Math.min(lines.length - 1, index + 1); probe += 1) {
      matched.add(probe);
    }
    for (let probe = index; probe >= 0; probe -= 1) {
      if (lines[probe].startsWith('## ')) {
        matched.add(probe);
        break;
      }
    }
  }

  return uniqueLines([...matched].sort((a, b) => a - b).map((index) => lines[index]));
}

function buildDiagnosisSources({ qaText, handoffText, scorecardText, summaryText, decisionsText }) {
  return [
    {
      source: 'qa_report',
      excerpt: trimTextForDiagnosis(qaText),
    },
    {
      source: 'handoff',
      excerpt: trimTextForDiagnosis(handoffText),
    },
    {
      source: 'scorecard',
      excerpt: trimTextForDiagnosis(scorecardText),
    },
    {
      source: 'agent_loop_summary',
      excerpt: trimTextForDiagnosis(summaryText),
    },
    {
      source: 'agent_loop_decisions',
      excerpt: trimTextForDiagnosis(decisionsText),
    },
  ].filter((entry) => entry.excerpt.length > 0);
}

function captureTrace(options) {
  const traceId = options.traceId;
  if (!traceId || !options.phaseStatusPath || !options.analysisPath || !options.qaReportPath || !options.handoffPath || !options.scorecardPath) {
    throw new Error('capture requires --trace-id, --phase-status, --analysis, --qa-report, --handoff, and --scorecard');
  }

  const workflowLogDir = options.workflowLogDir || DEFAULT_WORKFLOW_LOG_DIR;
  const agentLogDir = options.agentLogDir || DEFAULT_AGENT_LOG_DIR;
  const outputRoot = options.outputRoot || DEFAULT_OUTPUT_ROOT;
  const traceDir = path.join(outputRoot, traceId);
  fs.mkdirSync(traceDir, { recursive: true });

  const qaText = readTextIfExists(options.qaReportPath);
  const handoffText = readTextIfExists(options.handoffPath);
  const scorecardText = readTextIfExists(options.scorecardPath);
  const summaryText = readTextIfExists(path.join(agentLogDir, 'summary.md'));
  const decisionsText = readTextIfExists(path.join(agentLogDir, 'decisions.md'));
  const analysis = parseSimpleYaml(readTextIfExists(options.analysisPath));
  const workflowState = readJsonIfExists(path.join(workflowLogDir, 'current-run.json'));
  const latestDispatch = readJsonIfExists(path.join(workflowLogDir, 'latest-dispatch.json'));
  const latestBounded = readJsonIfExists(path.join(workflowLogDir, 'latest-bounded.json'));
  const phase = parsePhaseStatus(options.phaseStatusPath, options.qaReportPath);
  const verdictPath = findVerdictPath(options.qaReportPath);
  const verdict = readJsonIfExists(verdictPath);

  const nextPath = extractBulletValue(qaText, '## Verdict', 'Next path');
  const closeoutReason = extractBulletValue(qaText, '## Verdict', 'Closeout reason');
  const reviewCompleted = extractBulletValue(qaText, '## Review Checkpoint', 'Review completed');
  const stopReason = extractBulletValue(handoffText, '## Resume Trigger', 'Stop reason');
  const remainingScope = extractBulletValue(qaText, '## Finish Readiness', 'Remaining in-scope work');

  const sourceArtifacts = [
    fileSummary('phase_status', options.phaseStatusPath),
    fileSummary('analysis', options.analysisPath),
    fileSummary('qa_report', options.qaReportPath),
    fileSummary('handoff', options.handoffPath),
    fileSummary('scorecard', options.scorecardPath),
    fileSummary('workflow_state', path.join(workflowLogDir, 'current-run.json')),
    fileSummary('workflow_dispatch', path.join(workflowLogDir, 'latest-dispatch.json')),
    fileSummary('workflow_bounded', path.join(workflowLogDir, 'latest-bounded.json')),
    fileSummary('agent_loop_summary', path.join(agentLogDir, 'summary.md')),
    fileSummary('agent_loop_decisions', path.join(agentLogDir, 'decisions.md')),
    fileSummary('verification_verdict', verdictPath),
  ];

  const manifest = {
    traceVersion: '1.0',
    generatedAt: new Date().toISOString(),
    traceId,
    phase: {
      number: phase?.number ?? null,
      title: phase?.title ?? '',
      status: phase?.status ?? '',
      sprintContract: phase?.sprintContract ?? '',
      qaReport: options.qaReportPath,
      handoff: options.handoffPath,
      scorecard: options.scorecardPath,
    },
    stop: {
      nextPath,
      closeoutReason,
      stopReason,
      remainingScope,
      reviewCompleted,
    },
    verifier: {
      path: verdictPath,
      verdict: verdict?.verdict ?? '',
      evidenceFresh: verdict?.evidenceFresh === true,
      verificationMode: verdict?.verificationMode ?? '',
      score: verdict?.score ?? null,
      requiredChecks: verdict?.requiredChecks ?? null,
      workflowWarnings: verdict?.workflowEvidence?.warnings ?? [],
    },
    workflow: {
      completionStatus: workflowState?.completionStatus ?? '',
      closeoutStatus: workflowState?.completion?.closeoutStatus ?? '',
      blockers: workflowState?.completion?.blockers ?? [],
      readiness: workflowState?.readiness ?? null,
      selectedBundles: workflowState?.selectedBundles ?? analysis?.workflowEvidence?.selectedBundles ?? [],
      requiredSkills: workflowState?.requiredSkills ?? analysis?.workflowEvidence?.requiredSkills ?? [],
      appliedSkills: workflowState?.appliedSkills ?? analysis?.workflowEvidence?.appliedSkills ?? [],
      skippedSkills: workflowState?.skippedSkills ?? analysis?.workflowEvidence?.skippedSkills ?? [],
      stageOrder: workflowState?.stageOrder ?? analysis?.workflowEvidence?.stageOrder ?? [],
    },
    sourceArtifacts,
    artifactDeltas: sourceArtifacts.filter((artifact) => artifact.exists).map(({ kind, path: filePath, sizeBytes, modifiedAt }) => ({
      kind,
      path: filePath,
      sizeBytes,
      modifiedAt,
    })),
    rawLogPaths: sourceArtifacts.filter((artifact) => artifact.exists).map((artifact) => artifact.path),
    workflowEvidenceFiles: {
      currentRun: path.join(workflowLogDir, 'current-run.json'),
      latestDispatch: path.join(workflowLogDir, 'latest-dispatch.json'),
      latestBounded: path.join(workflowLogDir, 'latest-bounded.json'),
    },
    dispatch: latestDispatch,
    bounded: latestBounded,
  };

  const diagnosisSources = buildDiagnosisSources({
    qaText,
    handoffText,
    scorecardText,
    summaryText,
    decisionsText,
  });

  const diagnosis = {
    traceId,
    generatedAt: manifest.generatedAt,
    summary: {
      phase: `${manifest.phase.number ?? 'n/a'} ${manifest.phase.title}`.trim(),
      phaseStatus: manifest.phase.status,
      nextPath: manifest.stop.nextPath,
      stopReason: manifest.stop.stopReason,
      completionStatus: manifest.workflow.completionStatus,
      closeoutStatus: manifest.workflow.closeoutStatus,
      verifierVerdict: manifest.verifier.verdict,
      verifierEvidenceFresh: manifest.verifier.evidenceFresh,
      scoreVerdict: manifest.verifier.score?.verdict ?? '',
      scoreCurrent: manifest.verifier.score?.current ?? null,
      scoreTarget: manifest.verifier.score?.target ?? null,
      blockerCodes: manifest.workflow.blockers,
    },
    salientSources: diagnosisSources,
  };

  const diagnosisMd = [
    `# Meta-Harness Diagnosis View`,
    '',
    `- Trace ID: ${traceId}`,
    `- Phase: ${diagnosis.summary.phase}`,
    `- Phase status: ${diagnosis.summary.phaseStatus || 'unknown'}`,
    `- Next path: ${diagnosis.summary.nextPath || 'unknown'}`,
    `- Stop reason: ${diagnosis.summary.stopReason || 'unknown'}`,
    `- Completion status: ${diagnosis.summary.completionStatus || 'unknown'}`,
    `- Closeout status: ${diagnosis.summary.closeoutStatus || 'unknown'}`,
    `- Verifier verdict: ${diagnosis.summary.verifierVerdict || 'unknown'}`,
    `- Evidence fresh: ${diagnosis.summary.verifierEvidenceFresh ? 'yes' : 'no'}`,
    `- Score: ${diagnosis.summary.scoreCurrent ?? 'n/a'} / ${diagnosis.summary.scoreTarget ?? 'n/a'} (${diagnosis.summary.scoreVerdict || 'unknown'})`,
    `- Blocker codes: ${diagnosis.summary.blockerCodes.length > 0 ? diagnosis.summary.blockerCodes.join(', ') : 'none'}`,
    '',
    `## Source Artifacts`,
    ...manifest.sourceArtifacts.map((artifact) => `- ${artifact.kind}: ${artifact.path || 'n/a'}${artifact.exists ? '' : ' (missing)'}`),
  ];

  for (const source of diagnosisSources) {
    diagnosisMd.push('', `## ${source.source}`);
    diagnosisMd.push(...source.excerpt);
  }

  fs.writeFileSync(path.join(traceDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(traceDir, 'diagnosis.json'), `${JSON.stringify(diagnosis, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(traceDir, 'diagnosis.md'), `${diagnosisMd.join('\n')}\n`, 'utf8');

  console.log(`TRACE_DIR=${traceDir}`);
}

const { command, options } = parseArgs(process.argv.slice(2));

try {
  switch (command) {
    case 'capture':
      captureTrace(options);
      break;
    default:
      usage();
      process.exit(64);
  }
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
}
