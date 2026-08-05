#!/usr/bin/env node
import { parseCliArgs, printResult } from '../scripts/kernel/standalone/common.mjs';
import { runCodebaseUnderstanding } from '../scripts/kernel/standalone/codebase-understanding.mjs';

const args = parseCliArgs(process.argv.slice(2));
runCodebaseUnderstanding({ query: args.query || '', force: args.force === true })
  .then((result) => printResult(result, { json: args.json }))
  .catch((error) => { printResult({ status: 'error', errorCode: error.code || error.message }, { json: true }); process.exitCode = 1; });
