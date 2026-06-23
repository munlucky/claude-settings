#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import process from 'node:process';

import {
  detectScopeDrift,
  markdownPlanCompatibility,
  validatePlanGraph,
} from './lib/plan-graph.mjs';

const usage = () => 'Usage: node scripts/plan-graph-validate.mjs [--graph <json-file>] [--changed-files-json <json-array>] [--markdown-phase-docs-json <json-array>] [--json]';

const parseArgs = (argv) => {
  const options = { graph: '', changedFilesJson: '', markdownPhaseDocsJson: '', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--graph') options.graph = argv[++index] || '';
    else if (arg === '--changed-files-json') options.changedFilesJson = argv[++index] || '';
    else if (arg === '--markdown-phase-docs-json') options.markdownPhaseDocsJson = argv[++index] || '';
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

  if (!args.graph && args.markdownPhaseDocsJson) {
    const result = markdownPlanCompatibility({ phaseDocs: JSON.parse(args.markdownPhaseDocsJson) });
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else console.log(result.status);
    return;
  }
  if (!args.graph) throw new Error(`Missing --graph or --markdown-phase-docs-json\n${usage()}`);

  const graph = JSON.parse(await readFile(args.graph, 'utf8'));
  const graphResult = validatePlanGraph(graph);
  const changedFiles = args.changedFilesJson ? JSON.parse(args.changedFilesJson) : [];
  const declaredWriteSet = (graph.phases || []).flatMap((phase) => phase.ownedPaths || []);
  const drift = detectScopeDrift({ declaredWriteSet, changedFiles });
  const result = {
    status: graphResult.status === 'pass' && drift.status === 'clean' ? 'pass' : 'blocked',
    graph: graphResult,
    drift,
  };
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else console.log(result.status);
  if (result.status !== 'pass') process.exitCode = 2;
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
