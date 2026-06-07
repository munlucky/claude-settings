#!/usr/bin/env node

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  COMMIT_CLOSEOUT_EVENT_TYPES,
  defaultCommitEventSeverity,
  recordCommitCloseoutEvent,
} from './lib/commit-closeout-events.mjs';

function printHelp() {
  process.stdout.write(`Usage: node <MOONSHOT_RELAY_HOME>/scripts/commit-moonshot-closeout-event.mjs [options]

Records commit-moonshot staging, Git commit, and push closeout events.

Options:
  --project-id <id>          Project id. Default: moonshot-relay.
  --project-path <path>      Project path. Default: cwd.
  --run-id <id>              Active phase runner run id.
  --goal-id <id>             Active phase runner goal id.
  --workspace-id <id>        Active workspace id.
  --event-type <type>        Commit closeout event type.
  --severity <severity>      Optional severity override.
  --payload-json <json>      Optional sanitized event payload.
  --json                     Emit JSON only.
  -h, --help                 Show this help.

Allowed event types:
${[...COMMIT_CLOSEOUT_EVENT_TYPES].map((eventType) => `  - ${eventType}`).join('\n')}
`);
}

function readJsonValue(value, label) {
  const source = String(value || '').trim();
  if (!source) {
    return {};
  }
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error.message}`);
  }
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    projectId: 'moonshot-relay',
    projectPath: process.cwd(),
    payloadJson: '{}',
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '-h':
      case '--help':
        options.help = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--project-id':
        options.projectId = argv[++index] ?? options.projectId;
        break;
      case '--project-path':
        options.projectPath = argv[++index] ?? options.projectPath;
        break;
      case '--run-id':
        options.runId = argv[++index] ?? '';
        break;
      case '--goal-id':
        options.goalId = argv[++index] ?? '';
        break;
      case '--workspace-id':
        options.workspaceId = argv[++index] ?? '';
        break;
      case '--event-type':
        options.eventType = argv[++index] ?? '';
        break;
      case '--severity':
        options.severity = argv[++index] ?? '';
        break;
      case '--payload-json':
        options.payloadJson = argv[++index] ?? '{}';
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }

  return options;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    printHelp();
    return null;
  }
  const eventType = String(options.eventType || '').trim();
  if (!eventType) {
    throw new Error('--event-type is required');
  }
  const payload = readJsonValue(options.payloadJson, '--payload-json');
  const result = await recordCommitCloseoutEvent({
    runId: options.runId || '',
    goalId: options.goalId || '',
    workspaceId: options.workspaceId || '',
    projectId: options.projectId,
    projectPath: path.resolve(options.projectPath || process.cwd()),
    eventType,
    severity: options.severity || defaultCommitEventSeverity(eventType),
    payload,
    writer: 'commit-moonshot-closeout-event',
  });
  const output = {
    ...result,
    eventType,
    severity: options.severity || defaultCommitEventSeverity(eventType),
  };
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  return output;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`[commit-moonshot-closeout-event] ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
