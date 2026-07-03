#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

import { collectRetroRecord } from './collect.mjs';
import { importCollectRecords } from './retro-store.mjs';
import { runDailyRetro } from './daily-retro.mjs';
import { proposeImprovements } from './improvement-proposer.mjs';
import { writeIssueDrafts } from './issue-draft-writer.mjs';

const usage = `Usage:
  moonshot-relay retro collect --project <id> --task-id <taskId> --task-root <dir> --date <YYYY-MM-DD> [--out <dir>] [--replace] [--json]
  moonshot-relay retro import --project <id> --from <dir> --date <YYYY-MM-DD> [--state-root <dir>] [--json]
  moonshot-relay retro daily --project <id> --date <YYYY-MM-DD> [--state-root <dir>] [--json]
  moonshot-relay retro propose --project <id> --date <YYYY-MM-DD> [--state-root <dir>] [--json]
  moonshot-relay retro issue-draft --project <id> --date <YYYY-MM-DD> [--state-root <dir>] [--json]`;

function parseArgs(argv) {
  const [command = 'help', ...rest] = argv;
  const options = { command, json: false, replace: false };
  if (options.command === '--help' || options.command === '-h') options.command = 'help';
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--replace') options.replace = true;
    else if (arg === '--help' || arg === '-h') options.command = 'help';
    else if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      options[key] = rest[++index] || '';
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage}`);
    }
  }
  return options;
}

function emit(result, json) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.status || result.schemaVersion || 'ok');
  }
}

export async function runRetroCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.command === 'help') {
    return { usage };
  }
  if (options.command === 'collect') {
    const result = await collectRetroRecord({
      projectId: options.project,
      taskId: options.taskId,
      taskRoot: options.taskRoot,
      date: options.date,
      out: options.out,
      replace: options.replace,
    });
    return {
      schemaVersion: 'retro.collect-command-result.v1',
      projectId: options.project,
      taskId: options.taskId,
      path: result.path,
      promotionAuthority: false,
    };
  }
  if (options.command === 'import') {
    return importCollectRecords({
      projectId: options.project,
      date: options.date,
      source: options.from,
      stateRoot: options.stateRoot,
    });
  }
  if (options.command === 'daily') {
    const result = await runDailyRetro({
      projectId: options.project,
      date: options.date,
      stateRoot: options.stateRoot,
    });
    return {
      schemaVersion: 'retro.daily-command-result.v1',
      projectId: options.project,
      date: options.date,
      outRoot: result.outRoot,
      sourceCount: result.report.sourceCount,
      promotionAuthority: false,
    };
  }
  if (options.command === 'propose') {
    return proposeImprovements({
      projectId: options.project,
      date: options.date,
      stateRoot: options.stateRoot,
    });
  }
  if (options.command === 'issue-draft') {
    return writeIssueDrafts({
      projectId: options.project,
      date: options.date,
      stateRoot: options.stateRoot,
    });
  }
  throw new Error(`Unknown retro command: ${options.command}\n${usage}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runRetroCli().then((result) => {
    if (result.usage) {
      console.log(result.usage);
    } else {
      const options = parseArgs(process.argv.slice(2));
      emit(result, options.json);
    }
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
