#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

import { buildPromotionOutput, promoteMemoryCandidate, readCandidateFromJsonText, readCandidateFile, readReplayManifestFile } from './lib/awtl-memory-promotion.mjs';

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    candidatePath: '',
    candidateJson: '',
    replayManifestPath: '',
    replayManifestJson: '',
    approval: '',
    projectId: 'claude-settings',
    validatedBy: '',
    runId: '',
    candidateId: '',
    memoryGraphStatus: 'available',
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
  const output = replayManifest
    ? promoteMemoryCandidate(candidate, {
      approval: args.approval,
      projectId: args.projectId,
      validatedBy: args.validatedBy,
      runId: args.runId,
      candidateId: args.candidateId,
      memoryGraphStatus: args.memoryGraphStatus,
      replayManifest,
    })
    : buildPromotionOutput(candidate, {
      approval: args.approval,
      projectId: args.projectId,
      validatedBy: args.validatedBy,
      runId: args.runId,
      candidateId: args.candidateId,
      memoryGraphStatus: args.memoryGraphStatus,
    });

  const text = `${JSON.stringify(output, null, 2)}\n`;
  if (args.outputPath) {
    fs.mkdirSync(path.dirname(path.resolve(args.outputPath)), { recursive: true });
    fs.writeFileSync(path.resolve(args.outputPath), text, 'utf8');
  }
  process.stdout.write(text);
}

main();
