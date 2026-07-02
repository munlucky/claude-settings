#!/usr/bin/env node
import process from 'node:process';

import { auditSessionsRoot } from './lib/phase-runner-session-audit.mjs';

const usage = () => 'Usage: node scripts/phase-runner-session-audit.mjs --sessions-root <dir-or-jsonl> [--json]';

const parseArgs = (argv) => {
  const options = { sessionsRoot: '', json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--sessions-root') options.sessionsRoot = argv[++index] || '';
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  return options;
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.sessionsRoot) {
    throw new Error(`Missing --sessions-root\n${usage()}`);
  }
  const result = await auditSessionsRoot({ sessionsRoot: options.sessionsRoot });
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`directSessionCount: ${result.directSessionCount}`);
    console.log(`uniqueSessionCount: ${result.uniqueSessionCount}`);
    console.log(`duplicateCount: ${result.duplicateCount}`);
    console.log(`invalidJsonLineCount: ${result.invalidJsonLineCount}`);
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
