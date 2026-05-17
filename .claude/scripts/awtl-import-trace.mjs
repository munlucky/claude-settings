#!/usr/bin/env node

import fs from 'node:fs';

import { importRuntimeSource } from './lib/awtl-runtime-importers.mjs';

function parseArgs(argv) {
  const args = {
    sourceRuntime: '',
    sourceRuntimeSchema: '',
    input: '',
    inputFormat: 'json',
    output: '',
    outputFormat: 'jsonl',
    importedAt: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--source-runtime' || value === '--sourceRuntime') {
      args.sourceRuntime = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (value === '--source-runtime-schema' || value === '--sourceRuntimeSchema') {
      args.sourceRuntimeSchema = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (value === '--input') {
      args.input = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (value === '--input-format') {
      args.inputFormat = argv[index + 1] ?? 'json';
      index += 1;
      continue;
    }
    if (value === '--output') {
      args.output = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (value === '--output-format') {
      args.outputFormat = argv[index + 1] ?? 'jsonl';
      index += 1;
      continue;
    }
    if (value === '--imported-at') {
      args.importedAt = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (value === '--help' || value === '-h') {
      args.help = true;
    }
  }

  return args;
}

function readInputText(inputPath) {
  if (inputPath) {
    return fs.readFileSync(inputPath, 'utf8');
  }
  return fs.readFileSync(0, 'utf8');
}

function parseInput(text, format) {
  if (format === 'jsonl') {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
  if (!text.trim()) {
    return {};
  }
  return JSON.parse(text);
}

function serializeOutput(result, format) {
  if (format === 'json') {
    return `${JSON.stringify(result, null, 2)}\n`;
  }
  return `${result.map((event) => JSON.stringify(event)).join('\n')}\n`;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);

  if (args.help) {
    process.stdout.write([
      'Usage: node .claude/scripts/awtl-import-trace.mjs [options]',
      '',
      'Options:',
      '  --source-runtime <name>',
      '  --source-runtime-schema <schema>',
      '  --input <path>',
      '  --input-format json|jsonl',
      '  --output <path>',
      '  --output-format json|jsonl',
      '  --imported-at <rfc3339 timestamp>',
      '',
    ].join('\n'));
    return 0;
  }

  const text = readInputText(args.input);
  const input = parseInput(text, args.inputFormat);
  const result = importRuntimeSource(input, {
    sourceRuntime: args.sourceRuntime,
    sourceRuntimeSchema: args.sourceRuntimeSchema,
    importedAt: args.importedAt,
  });

  const output = serializeOutput(result, args.outputFormat);
  if (args.output) {
    fs.writeFileSync(args.output, output, 'utf8');
    return 0;
  }

  process.stdout.write(output);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exitCode = 1;
  });
}
