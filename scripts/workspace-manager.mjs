#!/usr/bin/env node
import process from 'node:process';

import { assessWorkspaceLeaseReturn } from './lib/workspace-manager.mjs';

const usage = () => 'Usage: node scripts/workspace-manager.mjs assess-return --git-status-short <text> [--secret-findings-json <json>] [--json]';

const parseArgs = (argv) => {
  const options = { command: argv[0] || '', gitStatusShort: '', secretFindingsJson: '[]', json: false };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--git-status-short') options.gitStatusShort = argv[++index] || '';
    else if (arg === '--secret-findings-json') options.secretFindingsJson = argv[++index] || '[]';
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  return options;
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (args.command !== 'assess-return') throw new Error(`Unknown command: ${args.command}\n${usage()}`);
  const result = assessWorkspaceLeaseReturn({
    gitStatusShort: args.gitStatusShort,
    secretFindings: JSON.parse(args.secretFindingsJson),
  });
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else console.log(result.status);
  if (result.status !== 'safe_to_return') process.exitCode = 2;
};

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
