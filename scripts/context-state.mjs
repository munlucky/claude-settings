#!/usr/bin/env node
import process from 'node:process';

import {
  assemblePrompt,
  buildContextState,
  compactContextState,
  rehydratePhaseBrief,
} from './lib/context-state-engine.mjs';

const usage = () => `Usage: node scripts/context-state.mjs <build|compact|rehydrate|assemble-prompt> [--run-id <id>] [--goal-id <id>] [--context-json <json>] [--json]`;

const parseArgs = (argv) => {
  const [command = ''] = argv;
  const options = { command, json: false };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      options.json = true;
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      options[key] = argv[++index] || '';
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }
  return options;
};

const parseJsonOption = (text, name) => {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${name} must be valid JSON`);
  }
};

const write = (payload, json) => {
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
  } else {
    console.log(payload.status || 'ok');
  }
};

const inputContext = async (options) => {
  const parsed = parseJsonOption(options.contextJson, '--context-json');
  if (parsed) {
    return parsed.contextState || parsed;
  }
  const built = await buildContextState({
    runId: options.runId || '',
    goalId: options.goalId || '',
  });
  return built.contextState;
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  let result;

  if (options.command === 'build') {
    result = await buildContextState({
      runId: options.runId || '',
      goalId: options.goalId || '',
    });
  } else if (options.command === 'compact') {
    result = compactContextState(await inputContext(options), {
      maxEvidence: Number(options.maxEvidence || 24),
      maxChangedFiles: Number(options.maxChangedFiles || 80),
      maxRisks: Number(options.maxRisks || 24),
      maxAssumptions: Number(options.maxAssumptions || 24),
    });
  } else if (options.command === 'rehydrate') {
    result = rehydratePhaseBrief(await inputContext(options));
  } else if (options.command === 'assemble-prompt') {
    result = assemblePrompt(await inputContext(options), {
      maxEvidence: Number(options.maxEvidence || 24),
      maxChangedFiles: Number(options.maxChangedFiles || 80),
      maxRisks: Number(options.maxRisks || 24),
      maxAssumptions: Number(options.maxAssumptions || 24),
      previousStablePrefixHash: options.previousStablePrefixHash || '',
    });
  } else if (options.command === '--help' || options.command === '-h') {
    console.log(usage());
    return;
  } else {
    throw new Error(`Unknown command: ${options.command}\n${usage()}`);
  }

  write(result, options.json);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
