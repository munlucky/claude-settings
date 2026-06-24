#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  copyFile,
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const SCHEMA_VERSION = 'moonshot-swe-bench-adapter-result.v1';
const ADAPTER_VERSION = '1';

const usage = () => `Usage:
  node tools/adapters/swe-bench-adapter.mjs convert --task-json <path> --out <dir> [--json]
  node tools/adapters/swe-bench-adapter.mjs run-fake --fixture <path> --out <dir> [--json]
  node tools/adapters/swe-bench-adapter.mjs verify --worktree <path> --out <json> [--json]
  node tools/adapters/swe-bench-adapter.mjs import-result --verifier-result <path> --lab-result <path> [--out <json>] [--json]

Runs the source-local SWE-bench adapter contract. Real SWE-bench execution requires a separate dependency decision.`;

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const sha256File = async (filePath) => `sha256:${sha256(await readFile(filePath))}`;

function parseArgs(argv) {
  const [command = 'help', ...rest] = argv;
  const options = {
    command,
    taskJson: '',
    fixture: '',
    worktree: '',
    verifierResult: '',
    labResult: '',
    out: '',
    json: false,
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--help' || arg === '-h') {
      options.command = 'help';
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      options[key] = rest[++index] || '';
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }
  return options;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(path.resolve(filePath), 'utf8'));
}

async function writeJson(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function taskMetadata(task) {
  return {
    taskId: task.taskId || task.instance_id || 'fake-task',
    repo: task.repo || task.repository || 'fake/repo',
    baseCommit: task.baseCommit || task.base_commit || 'fake-base',
  };
}

async function convertTask({ taskJson, out }) {
  if (!taskJson || !out) {
    throw new Error(`Missing --task-json or --out\n${usage()}`);
  }
  const task = await readJson(taskJson);
  const outRoot = path.resolve(out);
  await mkdir(outRoot, { recursive: true });
  const taskPackagePath = path.join(outRoot, 'moonshot-task.json');
  const patchPath = path.join(outRoot, 'candidate.patch');
  const payload = {
    schemaVersion: 'moonshot-swe-bench-task-package.v1',
    task: taskMetadata(task),
    problemStatement: task.problemStatement || task.problem_statement || '',
    testPatch: task.testPatch || task.test_patch || '',
  };
  await writeJson(taskPackagePath, payload);
  await writeFile(patchPath, task.patch || task.modelPatch || '');
  return {
    schemaVersion: SCHEMA_VERSION,
    adapterVersion: ADAPTER_VERSION,
    mode: 'fake',
    realExecutionEnabled: false,
    readiness: 'adapter_contract_ready',
    task: payload.task,
    moonshotTaskPackage: {
      path: taskPackagePath,
      sha256: await sha256File(taskPackagePath),
    },
    patch: {
      path: patchPath,
      sha256: await sha256File(patchPath),
    },
    verifier: {
      status: 'skipped',
      command: '',
      resultPath: '',
      failureClass: 'external_dependency_skipped',
    },
    metrics: {
      resolved: 0,
      testsPassed: 0,
      testsFailed: 0,
    },
    phaseStatus: 'phase_gated_real_execution_deferred',
  };
}

async function runFake({ fixture, out }) {
  if (!fixture || !out) {
    throw new Error(`Missing --fixture or --out\n${usage()}`);
  }
  const outRoot = path.resolve(out);
  await mkdir(outRoot, { recursive: true });
  const taskPackageDir = path.join(outRoot, 'swe-task');
  const converted = await convertTask({ taskJson: fixture, out: taskPackageDir });
  const verifierPath = path.join(outRoot, 'verifier-result.json');
  const verifier = {
    schemaVersion: 'moonshot-swe-bench-verifier-result.v1',
    status: 'passed',
    mode: 'fake',
    realExecutionEnabled: false,
    task: converted.task,
    metrics: {
      resolved: 1,
      testsPassed: 1,
      testsFailed: 0,
    },
    failureClass: 'none',
    phaseStatus: 'phase_gated_real_execution_deferred',
  };
  await writeJson(verifierPath, verifier);
  return {
    ...converted,
    verifier: {
      status: verifier.status,
      command: 'run-fake',
      resultPath: verifierPath,
      failureClass: 'none',
    },
    metrics: verifier.metrics,
  };
}

async function verifyWorktree({ worktree, out }) {
  if (!worktree || !out) {
    throw new Error(`Missing --worktree or --out\n${usage()}`);
  }
  const worktreeRoot = path.resolve(worktree);
  const patchPath = path.join(worktreeRoot, 'candidate.patch');
  const passed = existsSync(patchPath);
  const result = {
    schemaVersion: 'moonshot-swe-bench-verifier-result.v1',
    status: passed ? 'passed' : 'failed',
    mode: 'fake',
    realExecutionEnabled: false,
    task: { taskId: path.basename(worktreeRoot), repo: 'fake/repo', baseCommit: 'fake-base' },
    patch: {
      path: patchPath,
      sha256: passed ? await sha256File(patchPath) : '',
    },
    metrics: {
      resolved: passed ? 1 : 0,
      testsPassed: passed ? 1 : 0,
      testsFailed: passed ? 0 : 1,
    },
    failureClass: passed ? 'none' : 'swe_bench_verifier_failure',
    phaseStatus: 'phase_gated_real_execution_deferred',
  };
  await writeJson(path.resolve(out), result);
  return result;
}

async function importResult({ verifierResult, labResult, out }) {
  if (!verifierResult || !labResult) {
    throw new Error(`Missing --verifier-result or --lab-result\n${usage()}`);
  }
  const verifier = await readJson(verifierResult);
  const lab = await readJson(labResult);
  const importedMetric = {
    kind: 'metric',
    suiteId: 'swe-bench-adapter',
    metricId: 'sweBenchResolved',
    candidateValue: verifier.metrics?.resolved ?? 0,
    baselineValue: null,
    delta: null,
    direction: 'higher',
    maxRegression: { absolute: 0, percent: null },
    status: verifier.status === 'passed' ? 'passed' : 'failed',
    failureClass: verifier.failureClass || 'none',
    reason: verifier.realExecutionEnabled ? 'real SWE-bench verifier result imported' : 'fake adapter result imported; real execution deferred',
  };
  const next = {
    ...lab,
    quantitative: {
      ...(lab.quantitative || {}),
      comparisons: [
        ...((lab.quantitative && Array.isArray(lab.quantitative.comparisons)) ? lab.quantitative.comparisons : []),
        importedMetric,
      ],
    },
    sweBenchAdapter: {
      schemaVersion: SCHEMA_VERSION,
      adapterVersion: ADAPTER_VERSION,
      realExecutionEnabled: verifier.realExecutionEnabled === true,
      readiness: verifier.realExecutionEnabled === true ? 'real_swe_bench_ready' : 'adapter_contract_ready',
      phaseStatus: verifier.realExecutionEnabled === true ? 'real_swe_bench_ready' : 'phase_gated_real_execution_deferred',
      verifierResult,
    },
  };
  const outputPath = out ? path.resolve(out) : path.resolve(labResult);
  if (out) {
    await copyFile(path.resolve(labResult), `${path.resolve(labResult)}.bak`).catch(() => {});
  }
  await writeJson(outputPath, next);
  return {
    schemaVersion: SCHEMA_VERSION,
    adapterVersion: ADAPTER_VERSION,
    imported: true,
    outputPath,
    metric: importedMetric,
    realExecutionEnabled: verifier.realExecutionEnabled === true,
    phaseStatus: verifier.realExecutionEnabled === true ? 'real_swe_bench_ready' : 'phase_gated_real_execution_deferred',
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let result;
  if (options.command === 'help') {
    console.log(usage());
    return;
  }
  if (options.command === 'convert') {
    result = await convertTask({ taskJson: options.taskJson, out: options.out });
  } else if (options.command === 'run-fake') {
    result = await runFake({ fixture: options.fixture, out: options.out });
  } else if (options.command === 'verify') {
    result = await verifyWorktree({ worktree: options.worktree, out: options.out });
  } else if (options.command === 'import-result') {
    result = await importResult({
      verifierResult: options.verifierResult,
      labResult: options.labResult,
      out: options.out,
    });
  } else {
    throw new Error(`Unknown command: ${options.command}\n${usage()}`);
  }

  if (options.json || !options.out || options.command === 'import-result') {
    console.log(JSON.stringify(result, null, 2));
  }
  if (result.verifier?.status === 'failed' || result.status === 'failed') {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
