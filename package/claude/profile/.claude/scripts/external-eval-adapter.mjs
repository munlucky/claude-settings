#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_OUTPUT_ROOT = '.tmp/external-eval-plane';

function parseArgs(argv) {
  const options = {
    mode: argv[2] || '',
    taskId: 'TASK-001',
    source: '.',
    outputRoot: DEFAULT_OUTPUT_ROOT,
    run: false,
  };
  for (let index = 3; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--task-id') {
      options.taskId = argv[index + 1] || options.taskId;
      index += 1;
    } else if (arg === '--source') {
      options.source = argv[index + 1] || options.source;
      index += 1;
    } else if (arg === '--output-root') {
      options.outputRoot = argv[index + 1] || options.outputRoot;
      index += 1;
    } else if (arg === '--run') {
      options.run = true;
    }
  }
  return options;
}

function commandExists(command) {
  const result = spawnSync('/bin/sh', ['-c', `command -v ${command}`], {
    encoding: 'utf8',
  });
  return result.status === 0;
}

function readOptional(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${content.replace(/\s+$/u, '')}\n`, 'utf8');
}

function sourceSummary(source) {
  const resolved = path.resolve(source);
  const files = ['SPRINT_CONTRACT.md', 'QA_REPORT.md', 'SCORECARD.md', 'HANDOFF.md']
    .map((name) => path.join(resolved, name))
    .filter((candidate) => fs.existsSync(candidate));
  return {
    source: path.relative(process.cwd(), resolved) || resolved,
    files: files.map((filePath) => path.relative(process.cwd(), filePath)),
    text: files.map((filePath) => `\n## ${path.basename(filePath)}\n${readOptional(filePath)}`).join('\n').trim(),
  };
}

function exportTerminalBench(options, outputDir, summary) {
  write(path.join(outputDir, 'instruction.md'), `# ${options.taskId}\n\nRun the Moonshot phase task using the repository harness contract.\n\nSource artifacts:\n${summary.files.map((file) => `- ${file}`).join('\n') || '- none provided'}\n\nExpected behavior:\n- Preserve pass-to-pass behavior.\n- Convert fail-to-pass acceptance checks where applicable.\n- Produce QA_REPORT, SCORECARD, and HANDOFF evidence.`);
  write(path.join(outputDir, 'setup.sh'), '#!/usr/bin/env bash\nset -euo pipefail\n# Fill in project dependency setup for this exported benchmark task before running it.\n');
  write(path.join(outputDir, 'test.sh'), '#!/usr/bin/env bash\nset -euo pipefail\n# Fill in the exported verification command for this benchmark task before running it.\n');
  write(path.join(outputDir, 'expected-artifacts.md'), '# Expected Artifacts\n\n- QA_REPORT.md with fresh verification evidence\n- SCORECARD.md with `Current task status: FULL`\n- HANDOFF.md or equivalent clean finish note\n- Verification verdict JSON when available\n');
  return {
    tool: commandExists('harbor') ? 'harbor' : commandExists('terminal-bench') ? 'terminal-bench' : '',
    toolStatus: commandExists('harbor') || commandExists('terminal-bench') ? 'available' : 'tool_missing',
  };
}

function exportOpenAiEvals(options, outputDir, summary) {
  const record = {
    task_id: options.taskId,
    input: {
      artifacts: summary.files,
      text: summary.text,
    },
    ideal: 'Completion claim is supported by fresh evidence, traceable requirements, resumable handoff, and no unsupported FULL status.',
  };
  write(path.join(outputDir, 'eval-input.jsonl'), JSON.stringify(record));
  write(path.join(outputDir, 'rubric.md'), '# Rubric\n\nScore evidence sufficiency, resumability, traceability, and unsupported completion claims. A passing output must show fresh verification evidence and a `FULL` task-level status that matches the scorecard gates.\n');
  return {
    tool: commandExists('oaieval') ? 'oaieval' : '',
    toolStatus: commandExists('oaieval') ? 'available' : 'tool_missing',
  };
}

function exportInspect(options, outputDir, summary) {
  write(path.join(outputDir, 'task.json'), JSON.stringify({
    id: options.taskId,
    dataset: [{ input: summary.text, target: 'FULL completion requires scorecard and verification evidence.' }],
    solver: 'claude/codex/harness profile placeholder',
    scorer: 'scorecard + verdict + rubric placeholder',
  }, null, 2));
  write(path.join(outputDir, 'solver.md'), '# Solver Placeholder\n\nRun the selected Claude/Codex profile through Moonshot harness commands and collect QA_REPORT, SCORECARD, and HANDOFF artifacts.\n');
  write(path.join(outputDir, 'scorer.md'), '# Scorer Placeholder\n\nCombine SCORECARD task status, verification verdict freshness, and rubric checks for unsupported completion claims.\n');
  return {
    tool: commandExists('inspect') ? 'inspect' : '',
    toolStatus: commandExists('inspect') ? 'available' : 'tool_missing',
  };
}

function main() {
  const options = parseArgs(process.argv);
  const validModes = new Set(['terminal-bench', 'openai-evals', 'inspect']);
  if (!validModes.has(options.mode)) {
    process.stderr.write('Usage: external-eval-adapter.mjs <terminal-bench|openai-evals|inspect> --task-id TASK --source PATH --output-root PATH [--run]\n');
    process.exit(2);
  }

  const outputDir = path.resolve(options.outputRoot, options.mode, options.taskId);
  fs.mkdirSync(outputDir, { recursive: true });
  const summary = sourceSummary(options.source);
  const tool = options.mode === 'terminal-bench'
    ? exportTerminalBench(options, outputDir, summary)
    : options.mode === 'openai-evals'
      ? exportOpenAiEvals(options, outputDir, summary)
      : exportInspect(options, outputDir, summary);

  const manifest = {
    generatedAt: new Date().toISOString(),
    mode: options.mode,
    taskId: options.taskId,
    source: summary.source,
    outputDir: path.relative(process.cwd(), outputDir),
    runRequested: options.run,
    runStatus: options.run ? tool.toolStatus : 'export_only',
    tool,
  };
  write(path.join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  process.stdout.write(`${path.join(outputDir, 'manifest.json')}\n`);
}

main();
