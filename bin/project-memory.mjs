#!/usr/bin/env node
import { parseCliArgs, printResult } from '../scripts/kernel/standalone/common.mjs';
import { runProjectMemory } from '../scripts/kernel/standalone/project-memory.mjs';

const args = parseCliArgs(process.argv.slice(2));
const command = args._[0] || 'status';
runProjectMemory({ command, args: { ...args, provider: args.provider || 'codex,claude' } })
  .then((result) => printResult(result, { json: args.json }))
  .catch((error) => { printResult({ status: 'error', errorCode: error.code || error.message }, { json: true }); process.exitCode = 1; });
