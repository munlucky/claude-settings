#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  buildEvidenceBlock,
  evidenceRootFor,
  normalizeStage,
  readAnalysisEvidence,
  replaceEvidenceBlock,
} from './lib/code-review-graph-evidence-block.mjs';

const isWindows = process.platform === 'win32';
const LOCK_TIMEOUT_MS = Number.parseInt(process.env.CODE_REVIEW_GRAPH_STAGE_LOCK_TIMEOUT_MS || '5000', 10);
const LOCK_STALE_MS = Number.parseInt(process.env.CODE_REVIEW_GRAPH_STAGE_LOCK_STALE_MS || '120000', 10);

function parseArgs(argv) {
  const out = { command: argv[2] || '' };
  for (let i = 3; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function usage() {
  return [
    'usage: node .claude/scripts/code-review-graph-stage.mjs run --stage <plan|execute|review|verify|finish> --repo . --base <ref> --evidence-carrier <bounded|phase> --analysis-file <path> --phase-execution-dir <dir>',
  ].join('\n');
}

function utf8Env(extra = {}) {
  return {
    ...process.env,
    ...extra,
    LANG: process.env.LANG || 'C.UTF-8',
    LC_ALL: process.env.LC_ALL || 'C.UTF-8',
    PYTHONUTF8: '1',
    PYTHONIOENCODING: 'utf-8',
  };
}

function runCommand(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: isWindows && command === 'code-review-graph',
    windowsHide: true,
    env: utf8Env(options.env),
  });
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withStageLock(repo, fn) {
  const lockDir = path.resolve(repo, '.code-review-graph');
  const lockPath = path.join(lockDir, '.stage.lock');
  fs.mkdirSync(lockDir, { recursive: true });
  const started = Date.now();
  while (true) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() }));
      fs.closeSync(fd);
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }
      try {
        const stat = fs.statSync(lockPath);
        if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
          fs.rmSync(lockPath, { force: true });
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() - started > LOCK_TIMEOUT_MS) {
        return {
          ok: false,
          graphStatus: 'unavailable',
          failureClass: 'tool_unavailable:lock_timeout',
          detail: `lock timeout: ${lockPath}`,
        };
      }
      sleep(100);
    }
  }

  try {
    return fn();
  } finally {
    fs.rmSync(lockPath, { force: true });
  }
}

function assertBaseRef(repo, base) {
  if (!base) return null;
  const result = runCommand('git', ['rev-parse', '--verify', `${base}^{commit}`], { cwd: repo });
  if (result.error || result.status !== 0) {
    return {
      ok: false,
      graphStatus: 'unavailable',
      failureClass: 'tool_unavailable:base_ref_unavailable',
      detail: String(result.stderr || result.error?.message || '').trim(),
    };
  }
  return null;
}

function parseStatus(stdout) {
  const text = String(stdout || '').trim();
  if (!text) {
    return { graphStatus: 'unknown', nodes: null, files: null };
  }
  try {
    const json = JSON.parse(text);
    const nodes = Number.parseInt(json.nodes ?? json.nodeCount ?? json.stats?.nodes ?? '', 10);
    const files = Number.parseInt(json.files ?? json.fileCount ?? json.stats?.files ?? '', 10);
    return {
      graphStatus: json.status || 'fresh',
      nodes: Number.isFinite(nodes) ? nodes : null,
      files: Number.isFinite(files) ? files : null,
    };
  } catch {
    const nodesMatch = text.match(/nodes?\s*[=:]\s*(\d+)/iu);
    const filesMatch = text.match(/files?\s*[=:]\s*(\d+)/iu);
    return {
      graphStatus: /corrupt/iu.test(text) ? 'corrupt' : 'fresh',
      nodes: nodesMatch ? Number.parseInt(nodesMatch[1], 10) : null,
      files: filesMatch ? Number.parseInt(filesMatch[1], 10) : null,
    };
  }
}

function graphStatus(repo) {
  const result = runCommand('code-review-graph', ['status', '--repo', repo], { cwd: repo });
  if (isCommandNotFound(result)) {
    return {
      ok: false,
      graphStatus: 'unavailable',
      failureClass: 'tool_unavailable:command_not_found',
      detail: commandFailureDetail(result),
    };
  }
  if (result.status !== 0) {
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    const isCorrupt = /corrupt|invalid|decode|parse/iu.test(output);
    return {
      ok: false,
      graphStatus: isCorrupt ? 'corrupt' : 'unavailable',
      failureClass: isCorrupt ? 'tool_unavailable:graph_corrupt' : 'tool_unavailable:graph_rebuild_failed',
      detail: output.trim(),
    };
  }
  const parsed = parseStatus(result.stdout);
  if (parsed.nodes === 0 || parsed.files === 0) {
    return {
      ok: false,
      graphStatus: 'not_ready',
      failureClass: 'tool_unavailable:graph_empty',
      detail: `nodes=${parsed.nodes ?? 'unknown'} files=${parsed.files ?? 'unknown'}`,
      ...parsed,
    };
  }
  return { ok: true, graphStatus: parsed.graphStatus || 'fresh', failureClass: '', detail: 'graph ready', ...parsed };
}

function runGraphOperation(repo, stage) {
  const status = graphStatus(repo);
  if (!status.ok) {
    return status;
  }
  if (stage === 'verify' || stage === 'finish') {
    return status;
  }
  const command = stage === 'review' ? 'detect' : 'update';
  const result = runCommand('code-review-graph', [command, '--repo', repo], { cwd: repo });
  if (isCommandNotFound(result)) {
    return { ok: false, graphStatus: 'unavailable', failureClass: 'tool_unavailable:command_not_found', detail: commandFailureDetail(result) };
  }
  if (result.status !== 0) {
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    const isCorrupt = /corrupt|invalid|decode|parse/iu.test(output);
    return {
      ok: false,
      graphStatus: isCorrupt ? 'corrupt' : 'unavailable',
      failureClass: isCorrupt ? 'tool_unavailable:graph_corrupt_rebuild_failed' : 'tool_unavailable:graph_rebuild_failed',
      detail: output.trim(),
    };
  }
  return { ...status, detail: `${command} completed` };
}

function validateExistingEvidence({ analysisFile }) {
  const evidence = readAnalysisEvidence(analysisFile);
  if (!evidence?.adapterArtifact || !evidence?.adapterArtifactDigest || !evidence?.stageCoverage) {
    return {
      ok: false,
      graphStatus: 'unavailable',
      failureClass: 'tool_unavailable:qa_report_missing',
      detail: 'analysis evidence block is missing adapter artifact cross-check fields',
    };
  }
  if (!fs.existsSync(evidence.adapterArtifact)) {
    return {
      ok: false,
      graphStatus: 'unavailable',
      failureClass: 'tool_unavailable:qa_report_missing',
      detail: `adapter artifact not found: ${evidence.adapterArtifact}`,
    };
  }
  const digest = sha256(fs.readFileSync(evidence.adapterArtifact));
  if (digest !== evidence.adapterArtifactDigest) {
    return {
      ok: false,
      graphStatus: 'corrupt',
      failureClass: 'tool_unavailable:graph_corrupt',
      detail: 'adapter artifact digest mismatch',
    };
  }
  return { ok: true, graphStatus: 'fresh', failureClass: '', detail: 'existing adapter evidence verified' };
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function isCommandNotFound(result) {
  if (result.error?.code === 'ENOENT') {
    return true;
  }
  const output = `${result.stderr || ''}\n${result.stdout || ''}`;
  return result.status !== 0 && /(not recognized|not found|cannot find|no such file)/iu.test(output);
}

function commandFailureDetail(result) {
  return String(result.error?.message || result.stderr || result.stdout || '').trim();
}

function atomicWriteFile(target, bytes) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeFileSync(fd, bytes);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, target);
}

function writeEvidenceArtifact(root, adapterRunId, payload) {
  const target = path.join(root, `${adapterRunId}.json`);
  const bytes = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  atomicWriteFile(target, bytes);
  return { artifactPath: target, digest: sha256(bytes) };
}

function updateAnalysisFile(analysisFile, record) {
  if (!analysisFile) return;
  const current = fs.existsSync(analysisFile) ? fs.readFileSync(analysisFile, 'utf8') : '';
  const next = replaceEvidenceBlock(current, buildEvidenceBlock(record));
  atomicWriteFile(analysisFile, Buffer.from(next, 'utf8'));
}

function executeRun(options) {
  const repo = path.resolve(options.repo || '.');
  const stage = normalizeStage(options.stage);
  const evidenceCarrier = String(options['evidence-carrier'] || '').trim();
  const phaseExecutionDir = options['phase-execution-dir'] || '';
  const analysisFile = options['analysis-file'] ? path.resolve(repo, options['analysis-file']) : '';
  const evidenceRoot = evidenceRootFor({ repo, evidenceCarrier, phaseExecutionDir });
  const adapterRunId = `crg-${stage}-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;

  return withStageLock(repo, () => {
    const baseFailure = assertBaseRef(repo, options.base);
    let result = baseFailure;
    if (!result) {
      if (stage === 'verify') {
        result = validateExistingEvidence({ analysisFile });
      } else if (stage === 'finish') {
        result = { ok: true, graphStatus: 'fresh', failureClass: '', detail: 'persist_summary coverage recorded' };
      } else {
        result = runGraphOperation(repo, stage);
      }
    }

    const updatedAt = new Date().toISOString();
    const payload = {
      schemaVersion: 1,
      adapterRunId,
      stage,
      repo,
      base: options.base || '',
      evidenceCarrier,
      phaseExecutionDir,
      ok: Boolean(result.ok),
      graphStatus: result.graphStatus,
      failureClass: result.failureClass || '',
      detail: result.detail || '',
      coverage: stage === 'finish' ? 'persist_summary' : stage,
      updatedAt,
    };
    const artifact = writeEvidenceArtifact(evidenceRoot, adapterRunId, payload);
    updateAnalysisFile(analysisFile, {
      ...payload,
      artifactPath: artifact.artifactPath,
      digest: artifact.digest,
    });
    return { ...payload, ...artifact };
  });
}

function main() {
  const args = parseArgs(process.argv);
  if (args.command !== 'run') {
    console.error(usage());
    process.exit(2);
  }
  try {
    const result = executeRun(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exit(result.ok ? 0 : 1);
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}

export {
  executeRun,
  parseStatus,
  validateExistingEvidence,
};
