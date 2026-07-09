#!/usr/bin/env node
import { readFile } from 'node:fs/promises';

import {
  validateEpisodeLedgerRecord,
  validateFailureMemoryCandidate,
  validateMemoryClaim,
  validateTaskEvidenceGraph,
} from './lib/memory-control-plane-contracts.mjs';

function parseArgs(argv = process.argv.slice(2)) {
  const args = { type: 'claim', file: '', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--type') args.type = argv[++index] || args.type;
    else if (item === '--file') args.file = argv[++index] || '';
    else if (item === '--json') args.json = true;
    else if (item === '--help' || item === '-h') args.help = true;
  }
  return args;
}

function usage() {
  return 'Usage: node scripts/memory-claim-validate.mjs --type <claim|episode|task-graph|failure-candidate> --file <json-file> --json';
}

function validate(type, payload) {
  if (type === 'claim') return validateMemoryClaim(payload);
  if (type === 'episode') return validateEpisodeLedgerRecord(payload);
  if (type === 'task-graph') return validateTaskEvidenceGraph(payload);
  if (type === 'failure-candidate') return validateFailureMemoryCandidate(payload);
  return { ok: false, violations: [`unknown type: ${type}`] };
}

async function main() {
  const args = parseArgs();
  if (args.help || !args.file) {
    console.log(usage());
    return;
  }
  const payload = JSON.parse(await readFile(args.file, 'utf8'));
  const validation = validate(args.type, payload);
  const result = {
    status: validation.ok ? 'passed' : 'failed',
    type: args.type,
    violations: validation.violations,
  };
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else console.log(result.status);
  if (!validation.ok) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
