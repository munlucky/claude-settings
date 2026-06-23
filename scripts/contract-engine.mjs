#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import process from 'node:process';

import {
  classifyAmbiguity,
  createSpecRevision,
} from './lib/contract-invalidation.mjs';

const usage = () => 'Usage: node scripts/contract-engine.mjs validate --contract <json-file> [--json]';

const parseArgs = (argv) => {
  const options = { command: argv[0] || '', contract: '', json: false };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--contract') options.contract = argv[++index] || '';
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  return options;
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (args.command !== 'validate') throw new Error(`Unknown command: ${args.command}\n${usage()}`);
  if (!args.contract) throw new Error(`Missing --contract\n${usage()}`);

  const contract = JSON.parse(await readFile(args.contract, 'utf8'));
  const ambiguity = classifyAmbiguity(contract);
  const revision = createSpecRevision({
    previousRevision: contract.previousRevision || null,
    nextContract: contract,
    changeType: contract.changeType || 'spec',
    reason: contract.revisionReason || '',
  });
  const result = {
    status: ambiguity.status === 'clear' ? 'pass' : 'blocked',
    ambiguity,
    revision,
  };
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else console.log(result.status);
  if (result.status !== 'pass') process.exitCode = 2;
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
