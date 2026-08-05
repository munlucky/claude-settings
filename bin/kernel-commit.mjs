#!/usr/bin/env node
import { parseCliArgs, printResult } from '../scripts/kernel/standalone/common.mjs';
import { kernelCommit } from '../scripts/kernel/standalone/kernel-commit.mjs';

const args = parseCliArgs(process.argv.slice(2));
kernelCommit({ message: args.message || null, push: args.push === true, memory: args.memory === true, memoryReview: args.memoryReview === true, approvalRef: args.approvalRef || null, runId: args.runId || null })
  .then((result) => printResult(result, { json: args.json }))
  .catch((error) => { printResult({ status: 'error', errorCode: error.code || error.message }, { json: true }); process.exitCode = 1; });
