#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import process from 'node:process';

import { buildReviewBundle } from './lib/review-bundle.mjs';

const usage = () => 'Usage: node scripts/review-bundle-build.mjs --input <json-file> [--json]';

const parseArgs = (argv) => {
  const options = { input: '', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--input') options.input = argv[++index] || '';
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
  if (!args.input) throw new Error(`Missing --input\n${usage()}`);
  const payload = JSON.parse(await readFile(args.input, 'utf8'));
  const bundle = buildReviewBundle(payload);
  if (args.json) console.log(JSON.stringify(bundle, null, 2));
  else console.log(bundle.bundleDigest);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
