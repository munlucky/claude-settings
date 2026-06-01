#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { executePromotionFlow, readCandidateFromJsonText, readCandidateFile, readReplayManifestFile } from './lib/awtl-memory-promotion.mjs';
import { appendReplayScorecardRecord } from './lib/awtl-replay-scorecard.mjs';

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    candidatePath: '',
    candidateJson: '',
    replayManifestPath: '',
    replayManifestJson: '',
    approval: '',
    projectId: 'moonshot-relay',
    validatedBy: '',
    runId: '',
    candidateId: '',
    memoryGraphStatus: 'available',
    writeMemoryGraph: false,
    autoPromote: 'verified-only',
    scorecardPath: '',
    outputPath: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--candidate-path':
        args.candidatePath = argv[++index] ?? '';
        break;
      case '--candidate-json':
        args.candidateJson = argv[++index] ?? '';
        break;
      case '--replay-manifest-path':
        args.replayManifestPath = argv[++index] ?? '';
        break;
      case '--replay-manifest-json':
        args.replayManifestJson = argv[++index] ?? '';
        break;
      case '--approval':
        args.approval = argv[++index] ?? '';
        break;
      case '--project-id':
        args.projectId = argv[++index] ?? args.projectId;
        break;
      case '--validated-by':
        args.validatedBy = argv[++index] ?? '';
        break;
      case '--run-id':
        args.runId = argv[++index] ?? '';
        break;
      case '--candidate-id':
        args.candidateId = argv[++index] ?? '';
        break;
      case '--memory-graph-status':
        args.memoryGraphStatus = argv[++index] ?? args.memoryGraphStatus;
        break;
      case '--output':
        args.outputPath = argv[++index] ?? '';
        break;
      case '--write-memorygraph':
        args.writeMemoryGraph = true;
        break;
      case '--auto-promote':
        args.autoPromote = argv[++index] ?? args.autoPromote;
        break;
      case '--scorecard-path':
        args.scorecardPath = argv[++index] ?? '';
        break;
      default:
        break;
    }
  }

  return args;
}

function loadCandidate(args) {
  if (args.candidateJson) {
    return readCandidateFromJsonText(args.candidateJson);
  }
  if (args.candidatePath) {
    return readCandidateFile(args.candidatePath);
  }
  const defaultPath = path.join(process.cwd(), '.claude/cache/memorygraph/memory_update_candidates.jsonl');
  if (fs.existsSync(defaultPath)) {
    return readCandidateFile(defaultPath);
  }
  throw new Error('candidate input is required');
}

function loadReplayManifest(args) {
  if (args.replayManifestJson) {
    return JSON.parse(args.replayManifestJson);
  }
  if (args.replayManifestPath) {
    return readReplayManifestFile(args.replayManifestPath);
  }
  return null;
}

function main() {
  const args = parseArgs();
  const candidate = loadCandidate(args);
  const replayManifest = loadReplayManifest(args);
  const output = executePromotionFlow(candidate, {
    approval: args.approval,
    projectId: args.projectId,
    validatedBy: args.validatedBy,
    runId: args.runId,
    candidateId: args.candidateId,
    memoryGraphStatus: args.memoryGraphStatus,
    replayManifest,
    writeMemoryGraph: args.writeMemoryGraph,
    autoPromote: args.autoPromote,
  });

  appendReplayScorecardRecord(args.scorecardPath || '.claude/cache/awtl/replay_scorecard.jsonl', {
    record_id: output.candidate_id ? `replay:${output.candidate_id}:${output.provenance?.last_validated_at ?? Date.now()}` : '',
    created_at: output.provenance?.last_validated_at ?? new Date().toISOString(),
    status: output.memory_graph?.write_status ?? output.status,
    decision: output.status === 'promotable' ? 'promote' : 'skip',
    candidate_id: output.candidate_id,
    run_id: output.run_id,
    trace_id: output.trace_id,
    failure_turn_id: output.provenance?.origin_turn ?? '',
    validated_by: output.provenance?.validated_by ?? 'replay',
    last_validated_at: output.provenance?.last_validated_at ?? output.provenance?.validated_at ?? new Date().toISOString(),
    memory_graph_status: output.memory_graph?.status ?? '',
    replay_status: output.replay?.status ?? '',
    risk_level: output.memory_graph?.write_status === 'failed' ? 'risky' : '',
    denial_codes: output.denial_codes ?? [],
    applies_to: output.compact_fact?.applies_to ?? [],
    does_not_apply_to: output.compact_fact?.does_not_apply_to ?? [],
    evidence_refs: output.compact_fact?.facts ?? [],
    notes: output.memory_graph?.write_result ? 'direct-write-attempted' : '',
  });

  const text = `${JSON.stringify(output, null, 2)}\n`;
  if (args.outputPath) {
    fs.mkdirSync(path.dirname(path.resolve(args.outputPath)), { recursive: true });
    fs.writeFileSync(path.resolve(args.outputPath), text, 'utf8');
  }
  process.stdout.write(text);
}

main();
