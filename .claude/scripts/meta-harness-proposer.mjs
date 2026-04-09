#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

function usage() {
  console.error([
    'Usage:',
    '  meta-harness-proposer.mjs propose --trace-manifest <path> [--diagnosis <path>] --output <path>',
  ].join('\n'));
}

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift() || '';
  const options = {};

  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case '--trace-manifest':
        options.traceManifest = args.shift() ?? '';
        break;
      case '--diagnosis':
        options.diagnosisPath = args.shift() ?? '';
        break;
      case '--output':
        options.outputPath = args.shift() ?? '';
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return { command, options };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function inferDiagnosisPath(traceManifest) {
  const dir = path.dirname(traceManifest);
  return path.join(dir, 'diagnosis.json');
}

function buildCandidates({ manifest, diagnosis }) {
  const candidates = [];
  const playbooks = [];
  const blockerCodes = Array.isArray(manifest.workflow?.blockers) ? manifest.workflow.blockers : [];
  const warnings = Array.isArray(manifest.verifier?.workflowWarnings) ? manifest.verifier.workflowWarnings : [];
  const diagnosisText = JSON.stringify(diagnosis);

  if (blockerCodes.includes('review_incomplete') || warnings.some((item) => /review/i.test(item))) {
    candidates.push({
      changeId: 'closeout-review-enforcement',
      changeType: 'script-adjustment',
      targetFiles: [
        '.claude/scripts/agent-loop-phase-state.mjs',
        '.claude/scripts/workflow-enforcement.mjs',
      ],
      rationale: 'Closeout state should not drift from review evidence.',
    });
    playbooks.push('review-closeout-repair');
  }

  if (blockerCodes.includes('fresh_evidence_missing') || warnings.some((item) => /evidence/i.test(item))) {
    candidates.push({
      changeId: 'verification-evidence-repair',
      changeType: 'workflow-adjustment',
      targetFiles: [
        '.claude/scripts/workflow-enforcement.mjs',
        '.claude/scripts/agent-loop-phase-state.mjs',
      ],
      rationale: 'Fresh verification evidence should be machine-visible before closeout.',
    });
    playbooks.push('verification-evidence-repair');
  }

  if (/always-loaded budget overflow|always-loaded token budget/i.test(diagnosisText)) {
    candidates.push({
      changeId: 'knowledge-budget-trim',
      changeType: 'docs-adjustment',
      targetFiles: [
        '.claude/rules/',
        '.claude/docs/guidelines/knowledge-repository-ops.md',
      ],
      rationale: 'Always-loaded token budget overflow is a measurable harness-local issue that can be reduced without touching downstream project code.',
    });
    playbooks.push('knowledge-budget-trim');
  }

  return {
    candidates,
    playbooks: [...new Set(playbooks)],
  };
}

function propose(options) {
  if (!options.traceManifest || !options.outputPath) {
    throw new Error('propose requires --trace-manifest and --output');
  }

  const manifest = readJson(options.traceManifest);
  const diagnosisPath = options.diagnosisPath || inferDiagnosisPath(options.traceManifest);
  const diagnosis = fs.existsSync(diagnosisPath) ? readJson(diagnosisPath) : { summary: {}, salientSources: [] };
  const { candidates, playbooks } = buildCandidates({ manifest, diagnosis });

  const payload = {
    proposalVersion: '1.0',
    generatedAt: new Date().toISOString(),
    traceId: manifest.traceId,
    inputArtifacts: {
      manifest: options.traceManifest,
      diagnosis: fs.existsSync(diagnosisPath) ? diagnosisPath : null,
    },
    optimizationBoundary: {
      allowedRoots: [
        '.claude/scripts',
        '.claude/templates',
        '.claude/skills',
        '.claude/docs/guidelines',
        '.claude/docs/tasks',
      ],
      forbiddenRoots: [
        'src',
        'app',
        'packages',
        'services',
        '.env',
        'secrets',
      ],
    },
    status: candidates.length > 0 ? 'proposed' : 'no_change',
    recoveryPlaybooks: playbooks,
    candidateChanges: candidates,
    rationale: candidates.length > 0
      ? 'Bounded harness-local changes were inferred from the trace and diagnosis view.'
      : 'No bounded harness-local changes were proposed because the trace is already clean and no actionable blocker was detected.',
  };

  fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
  fs.writeFileSync(options.outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`PROPOSAL_PATH=${options.outputPath}`);
}

const { command, options } = parseArgs(process.argv.slice(2));

try {
  switch (command) {
    case 'propose':
      propose(options);
      break;
    default:
      usage();
      process.exit(64);
  }
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
}
