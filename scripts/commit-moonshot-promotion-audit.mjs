#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { buildPromotionOutput, executePromotionFlow, readReplayManifestFile } from './lib/awtl-memory-promotion.mjs';
import {
  appendReplayScorecardRecord,
  isReplayScorecardExcluded,
  loadReplayScorecardRecords,
  readLatestReplayScorecardRecord,
} from './lib/awtl-replay-scorecard.mjs';
import { recordCommitCloseoutEvent } from './lib/commit-closeout-events.mjs';
import { resolveRuntimeStatePath } from './lib/runtime-state-root.mjs';

const DEFAULT_CANDIDATE_PATH = resolveRuntimeStatePath('cache', 'memorygraph', 'memory_update_candidates.jsonl');
const DEFAULT_FAILED_TURN_CASE_PATH = resolveRuntimeStatePath('cache', 'awtl', 'failed_turn_cases.jsonl');
const DEFAULT_SCORECARD_PATH = resolveRuntimeStatePath('cache', 'awtl', 'replay_scorecard.jsonl');

const BLOCKED_DENIAL_PATTERNS = [
  /^invalid_candidate$/,
  /^blocked_failure_class:/,
  /^blocked_promotion_tag$/,
  /^imported_only$/,
  /^replay_regression_worsened$/,
  /^replay_blocked$/,
];

function toText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : fallback;
}

function uniqueStrings(values = []) {
  const seen = new Set();
  const output = [];
  for (const value of values) {
    const text = toText(value, '');
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    output.push(text);
  }
  return output;
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
}

function readJsonValue(value, label) {
  const source = toText(value, '');
  if (!source) {
    return null;
  }
  const raw = source.startsWith('@')
    ? fs.readFileSync(path.resolve(source.slice(1)), 'utf8')
    : source;
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error.message}`);
  }
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    candidatePath: DEFAULT_CANDIDATE_PATH,
    failedTurnCasePath: DEFAULT_FAILED_TURN_CASE_PATH,
    scorecardPath: DEFAULT_SCORECARD_PATH,
    memoryGraphStatus: 'available',
    approval: '',
    projectId: 'moonshot-relay',
    writeVerified: false,
    json: false,
    outputPath: '',
    replayManifestPath: '',
    replayManifestJson: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--candidate-path':
        options.candidatePath = argv[++index] ?? options.candidatePath;
        break;
      case '--failed-turn-cases-path':
      case '--failed-turn-case-path':
        options.failedTurnCasePath = argv[++index] ?? options.failedTurnCasePath;
        break;
      case '--scorecard-path':
        options.scorecardPath = argv[++index] ?? options.scorecardPath;
        break;
      case '--memory-graph-status':
        options.memoryGraphStatus = argv[++index] ?? options.memoryGraphStatus;
        break;
      case '--approval':
        options.approval = argv[++index] ?? '';
        break;
      case '--project-id':
        options.projectId = argv[++index] ?? options.projectId;
        break;
      case '--run-id':
        options.runId = argv[++index] ?? '';
        break;
      case '--goal-id':
        options.goalId = argv[++index] ?? '';
        break;
      case '--workspace-id':
        options.workspaceId = argv[++index] ?? '';
        break;
      case '--write-verified':
        options.writeVerified = true;
        break;
      case '--replay-manifest-path':
        options.replayManifestPath = argv[++index] ?? '';
        break;
      case '--replay-manifest-json':
        options.replayManifestJson = argv[++index] ?? '';
        break;
      case '--output':
        options.outputPath = argv[++index] ?? '';
        break;
      case '--json':
        options.json = true;
        break;
      case '-h':
      case '--help':
        options.help = true;
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }

  return options;
}

async function recordPromotionAuditEvent(options, summary, eventType = 'commit.promotion_audit.completed', severity = 'info') {
  try {
    await recordCommitCloseoutEvent({
      runId: options.runId || '',
      goalId: options.goalId || '',
      workspaceId: options.workspaceId || '',
      projectId: summary.projectId,
      eventType,
      severity,
      writer: 'commit-moonshot-promotion-audit',
      payload: {
        status: summary.status,
        closeoutStatus: summary.closeoutStatus,
        mode: summary.mode,
        candidateCacheLoaded: summary.candidateCacheLoaded,
        candidateCount: summary.candidateCount,
        invalidCandidateCount: summary.invalidCandidateCount,
        failedTurnCaseCount: summary.failedTurnCaseCount,
        replayScorecardLoaded: summary.replayScorecardLoaded,
        memoryGraphStatus: summary.memoryGraphStatus,
        counts: summary.counts,
        warnings: summary.warnings,
      },
    });
  } catch {
    // Commit closeout event recording is audit evidence, not a Git blocker.
  }
}

function printHelp() {
  process.stdout.write(`Usage: node <MOONSHOT_RELAY_HOME>/scripts/commit-moonshot-promotion-audit.mjs [options]

Audits commit-time AWTL MemoryGraph promotion candidates. Default mode records
review decisions only; MemoryGraph writes require --write-verified.

Options:
  --candidate-path <path>          Candidate JSONL path.
  --failed-turn-case-path <path>   Failed-turn cache path.
  --scorecard-path <path>          Replay scorecard JSONL path.
  --memory-graph-status <status>   available | unavailable. Default: available.
  --approval <status>              Use approved only for explicit human approval.
  --write-verified                 Write candidates that pass replay or approval gates.
  --replay-manifest-path <path>    Optional replay probe manifest.
  --replay-manifest-json <json>    Optional replay probe manifest JSON.
  --project-id <id>                Project id for provenance. Default: moonshot-relay.
  --output <path>                  Write audit JSON to a file.
  --json                           Emit JSON only.
`);
}

function loadCandidateRecords(candidatePath = DEFAULT_CANDIDATE_PATH) {
  const resolvedPath = path.resolve(candidatePath);
  if (!fs.existsSync(resolvedPath)) {
    return {
      candidatePath: resolvedPath,
      loaded: false,
      candidates: [],
      invalidEntries: [],
      warnings: ['candidate-cache-missing'],
    };
  }

  const candidates = [];
  const invalidEntries = [];
  const rawLines = fs.readFileSync(resolvedPath, 'utf8').split(/\r?\n/);
  rawLines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) {
      return;
    }
    try {
      const parsed = JSON.parse(line);
      candidates.push({
        lineNumber: index + 1,
        candidate: parsed,
      });
    } catch (error) {
      invalidEntries.push({
        lineNumber: index + 1,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return {
    candidatePath: resolvedPath,
    loaded: true,
    candidates,
    invalidEntries,
    warnings: [],
  };
}

function countJsonlRecords(filePath) {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    return {
      path: resolvedPath,
      loaded: false,
      count: 0,
      warnings: ['cache-missing'],
    };
  }
  const count = fs.readFileSync(resolvedPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .length;
  return {
    path: resolvedPath,
    loaded: true,
    count,
    warnings: [],
  };
}

function loadReplayManifest(options = {}) {
  if (options.replayManifestJson) {
    return readJsonValue(options.replayManifestJson, 'replay manifest');
  }
  if (options.replayManifestPath) {
    return readReplayManifestFile(options.replayManifestPath);
  }
  return null;
}

function replayManifestApplies(manifest, candidate, totalCandidates) {
  if (!manifest) {
    return false;
  }
  const manifestCandidateId = toText(manifest.candidate_id ?? manifest.candidateId, '');
  if (!manifestCandidateId && totalCandidates === 1) {
    return true;
  }
  return manifestCandidateId && manifestCandidateId === toText(candidate?.candidate_id ?? candidate?.candidateId, '');
}

function isReplayVerifiedRecord(record = null) {
  if (!record || isReplayScorecardExcluded(record)) {
    return false;
  }
  const validatedBy = toText(record.validated_by ?? record.validatedBy, '').toLowerCase();
  const replayStatus = toText(record.replay_status ?? record.replayStatus, '').toLowerCase();
  const decision = toText(record.decision ?? '', '').toLowerCase();
  const status = toText(record.status ?? '', '').toLowerCase();
  return validatedBy === 'replay'
    && decision === 'promote'
    && (replayStatus === 'passed' || status === 'promoted' || status === 'written' || status === 'passed');
}

function replayAssessmentFromScorecard(record = null) {
  if (!isReplayVerifiedRecord(record)) {
    return null;
  }
  return {
    ok: true,
    status: 'passed',
    blocking_reasons: [],
    probe_statuses: { scorecard: 'passed' },
    regression_worsened: false,
    required_probe_statuses: ['passed', 'passed', 'passed'],
    provided: true,
  };
}

function hasBlockedDenial(denialCodes = []) {
  return denialCodes.some((code) => BLOCKED_DENIAL_PATTERNS.some((pattern) => pattern.test(code)));
}

function classifyPromotionResult(output = {}, candidate = {}) {
  const denialCodes = output.denial_codes ?? output.gate?.denial_codes ?? [];
  if (output.status === 'promotable') {
    return 'promotable';
  }
  if (denialCodes.includes('memorygraph_unavailable') || output.memory_graph?.status === 'unavailable') {
    return 'memorygraph_unavailable';
  }
  if (hasBlockedDenial(denialCodes)) {
    return 'blocked';
  }
  if (denialCodes.includes('replay_or_approval_required') || denialCodes.includes('replay_needs_more_evidence')) {
    return candidate.requires_human_review === true ? 'needs_human_approval' : 'needs_replay';
  }
  return 'blocked';
}

function scorecardRecordForOutput(output = {}, category = 'blocked', options = {}) {
  const now = new Date().toISOString();
  const writeStatus = output.memory_graph?.write_status ?? (category === 'promotable' ? 'not_requested' : 'skipped');
  return {
    record_id: output.candidate_id ? `commit-audit:${output.candidate_id}:${now}` : `commit-audit:${category}:${now}`,
    created_at: output.provenance?.last_validated_at ?? now,
    status: writeStatus,
    decision: category === 'promotable' ? 'promote' : 'skip',
    candidate_id: output.candidate_id ?? '',
    run_id: output.run_id ?? '',
    trace_id: output.trace_id ?? '',
    failure_turn_id: output.provenance?.origin_turn ?? '',
    validated_by: output.provenance?.validated_by ?? options.validatedBy ?? 'audit',
    last_validated_at: output.provenance?.last_validated_at ?? now,
    memory_graph_status: output.memory_graph?.status ?? '',
    replay_status: output.replay?.status ?? '',
    risk_level: writeStatus === 'failed' ? 'risky' : '',
    denial_codes: output.denial_codes ?? [],
    applies_to: output.compact_fact?.applies_to ?? [],
    does_not_apply_to: output.compact_fact?.does_not_apply_to ?? [],
    evidence_refs: output.compact_fact?.facts ?? [],
    notes: options.notes ?? 'commit-promotion-audit',
  };
}

function appendDecision(scorecardPath, record) {
  appendReplayScorecardRecord(scorecardPath, record);
}

function summarizeCounts(results = []) {
  const counts = {
    promotable: 0,
    needs_replay: 0,
    needs_human_approval: 0,
    blocked: 0,
    memorygraph_unavailable: 0,
    written: 0,
    write_failed: 0,
  };

  for (const result of results) {
    if (Object.hasOwn(counts, result.category)) {
      counts[result.category] += 1;
    }
    if (result.writeStatus === 'written') {
      counts.written += 1;
    } else if (['failed', 'unavailable'].includes(result.writeStatus)) {
      counts.write_failed += 1;
    }
  }
  return counts;
}

export function auditPromotionCandidates(options = {}) {
  const candidatePath = options.candidatePath ?? DEFAULT_CANDIDATE_PATH;
  const failedTurnCasePath = options.failedTurnCasePath ?? DEFAULT_FAILED_TURN_CASE_PATH;
  const scorecardPath = options.scorecardPath ?? DEFAULT_SCORECARD_PATH;
  const writeVerified = options.writeVerified === true;
  const approval = toText(options.approval, '');
  const memoryGraphStatus = toText(options.memoryGraphStatus, 'available');
  const projectId = toText(options.projectId, 'moonshot-relay');
  const promotionExecutor = options.promotionExecutor ?? executePromotionFlow;
  const candidateRecords = loadCandidateRecords(candidatePath);
  const failedTurnCases = countJsonlRecords(failedTurnCasePath);
  const replayScorecard = loadReplayScorecardRecords(scorecardPath);
  const replayManifest = options.replayManifest ?? loadReplayManifest(options);
  const results = [];

  for (const invalidEntry of candidateRecords.invalidEntries) {
    const output = {
      candidate_id: '',
      run_id: '',
      trace_id: '',
      status: 'blocked',
      denial_codes: ['invalid_candidate'],
      memory_graph: {
        status: memoryGraphStatus,
        write_status: 'skipped',
      },
    };
    appendDecision(scorecardPath, scorecardRecordForOutput(output, 'blocked', {
      notes: `invalid-candidate-line:${invalidEntry.lineNumber}`,
    }));
    results.push({
      candidateId: '',
      lineNumber: invalidEntry.lineNumber,
      category: 'blocked',
      status: 'blocked',
      writeStatus: 'skipped',
      denialCodes: ['invalid_candidate'],
      reason: invalidEntry.error,
    });
  }

  for (const record of candidateRecords.candidates) {
    const candidate = record.candidate;
    const latestScorecard = readLatestReplayScorecardRecord(replayScorecard.records, {
      candidate_id: candidate?.candidate_id,
      failure_turn_id: candidate?.failure_turn_id,
      run_id: candidate?.run_id,
      trace_id: candidate?.trace_id,
    });
    const candidateReplayManifest = replayManifestApplies(replayManifest, candidate, candidateRecords.candidates.length)
      ? replayManifest
      : null;
    const scorecardReplayAssessment = candidateReplayManifest ? null : replayAssessmentFromScorecard(latestScorecard);
    const promotionOptions = {
      approval,
      projectId,
      memoryGraphStatus,
      replayManifest: candidateReplayManifest,
      replayAssessment: scorecardReplayAssessment,
      writeMemoryGraph: false,
      autoPromote: 'verified-only',
      validatedBy: candidateReplayManifest || scorecardReplayAssessment ? 'replay' : (approval ? 'human_approval' : 'audit'),
    };

    let output;
    try {
      output = buildPromotionOutput(candidate, promotionOptions);
    } catch (error) {
      output = {
        candidate_id: toText(candidate?.candidate_id ?? candidate?.candidateId, ''),
        run_id: toText(candidate?.run_id ?? candidate?.runId, ''),
        trace_id: toText(candidate?.trace_id ?? candidate?.traceId, ''),
        status: 'blocked',
        denial_codes: ['invalid_candidate'],
        memory_graph: {
          status: memoryGraphStatus,
          write_status: 'skipped',
        },
        error: error instanceof Error ? error.message : String(error),
      };
    }

    let category = classifyPromotionResult(output, candidate);
    let finalOutput = output;
    if (writeVerified && category === 'promotable') {
      finalOutput = promotionExecutor(candidate, {
        ...promotionOptions,
        writeMemoryGraph: true,
      });
      category = classifyPromotionResult(finalOutput, candidate);
    }

    const writeStatus = finalOutput.memory_graph?.write_status ?? 'skipped';
    appendDecision(scorecardPath, scorecardRecordForOutput(finalOutput, category, {
      validatedBy: promotionOptions.validatedBy,
      notes: writeVerified ? 'commit-promotion-audit-write-verified' : 'commit-promotion-audit-only',
    }));
    results.push({
      candidateId: finalOutput.candidate_id ?? output.candidate_id ?? '',
      lineNumber: record.lineNumber,
      category,
      status: finalOutput.status ?? output.status ?? 'blocked',
      writeStatus,
      denialCodes: uniqueStrings(finalOutput.denial_codes ?? output.denial_codes ?? []),
      replayStatus: finalOutput.replay?.status ?? output.replay?.status ?? '',
      validatedBy: finalOutput.provenance?.validated_by ?? promotionOptions.validatedBy,
    });
  }

  const summary = {
    status: 'completed',
    closeoutStatus: 'non_blocking',
    mode: writeVerified ? 'write_verified' : 'audit',
    projectId,
    candidatePath: path.resolve(candidatePath),
    failedTurnCasePath: path.resolve(failedTurnCasePath),
    scorecardPath: path.resolve(scorecardPath),
    candidateCacheLoaded: candidateRecords.loaded,
    candidateCount: candidateRecords.candidates.length,
    invalidCandidateCount: candidateRecords.invalidEntries.length,
    failedTurnCaseCount: failedTurnCases.count,
    replayScorecardLoaded: replayScorecard.loaded,
    memoryGraphStatus,
    counts: summarizeCounts(results),
    results,
    warnings: uniqueStrings([
      ...candidateRecords.warnings,
      ...failedTurnCases.warnings.map((warning) => `failed-turn-cases:${warning}`),
      ...replayScorecard.warnings.map((warning) => `scorecard:${warning}`),
    ]),
  };

  if (options.outputPath) {
    ensureDir(options.outputPath);
    fs.writeFileSync(path.resolve(options.outputPath), `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  }

  return summary;
}

function formatHumanSummary(summary = {}) {
  const counts = summary.counts ?? {};
  return [
    'commit-moonshot AWTL promotion audit',
    `mode=${summary.mode}`,
    `candidateCount=${summary.candidateCount}`,
    `promotable=${counts.promotable ?? 0}`,
    `needsReplay=${counts.needs_replay ?? 0}`,
    `needsHumanApproval=${counts.needs_human_approval ?? 0}`,
    `blocked=${counts.blocked ?? 0}`,
    `memorygraphUnavailable=${counts.memorygraph_unavailable ?? 0}`,
    `written=${counts.written ?? 0}`,
    `closeoutStatus=${summary.closeoutStatus}`,
  ].join('\n');
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    printHelp();
    return;
  }
  const summary = auditPromotionCandidates(options);
  await recordPromotionAuditEvent(options, summary);
  if (!options.json) {
    process.stdout.write(`${formatHumanSummary(summary)}\n`);
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`[commit-moonshot-promotion-audit] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
