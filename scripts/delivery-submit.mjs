#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  assessDeliverySubmission,
  buildSubmissionReceipt,
} from './lib/delivery-policy.mjs';

const usage = () => 'Usage: node scripts/delivery-submit.mjs submit --score <json-file> --verification <json-file> [--review <json-file>] --current-sha <sha> [--submitted-sha <sha>] [--mode local|pr|release] [--out <submission.json>] [--json]';

const parseArgs = (argv) => {
  const options = { command: argv[0] || '', mode: 'local', json: false };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--score') options.score = argv[++index] || '';
    else if (arg === '--verification') options.verification = argv[++index] || '';
    else if (arg === '--review') options.review = argv[++index] || '';
    else if (arg === '--current-sha') options.currentSha = argv[++index] || '';
    else if (arg === '--submitted-sha') options.submittedSha = argv[++index] || '';
    else if (arg === '--mode') options.mode = argv[++index] || '';
    else if (arg === '--out') options.out = argv[++index] || '';
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  return options;
};

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (args.command !== 'submit') throw new Error(`Unknown command: ${args.command}\n${usage()}`);
  if (!args.score || !args.verification || !args.currentSha) {
    throw new Error(`Missing required delivery evidence\n${usage()}`);
  }

  const score = await readJson(args.score);
  const verification = await readJson(args.verification);
  const review = args.review ? await readJson(args.review) : null;
  const currentSha = args.currentSha;
  const submittedSha = args.submittedSha || currentSha;
  const assessment = assessDeliverySubmission({
    mode: args.mode,
    score,
    verification,
    review,
    currentSha,
    submittedSha,
  });
  if (assessment.status !== 'allowed') {
    const blocked = { status: 'blocked', assessment };
    if (args.json) console.log(JSON.stringify(blocked, null, 2));
    else console.log(blocked.status);
    process.exitCode = 2;
    return;
  }

  const submission = buildSubmissionReceipt({
    mode: args.mode,
    score,
    verification,
    review,
    currentSha,
    submittedSha,
  });
  if (args.out) {
    await mkdir(path.dirname(args.out), { recursive: true });
    await writeFile(args.out, `${JSON.stringify(submission, null, 2)}\n`, 'utf8');
  }
  const result = { status: 'submitted', submission, wrote: args.out || '' };
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else console.log(result.status);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
