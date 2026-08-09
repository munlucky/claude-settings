import { spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { cleanupWindowsTimeoutProcessTree } from '../../kernel/proof/process-tree.mjs';

export const CODEX_REVIEW_OUTPUT_SCHEMA = Object.freeze({
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail', 'blocked'] },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['critical', 'important', 'minor'] },
          category: { type: 'string', enum: ['contract', 'architecture', 'implementation', 'security', 'verification'] },
          path: { type: ['string', 'null'] },
          summary: { type: 'string' },
          requiredAction: { type: 'string', enum: ['fix', 'replan', 'block'] },
        },
        required: ['severity', 'category', 'path', 'summary', 'requiredAction'],
        additionalProperties: false,
      },
    },
    risks: { type: 'array', items: { type: 'string' } },
    evidenceRefs: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'findings', 'risks', 'evidenceRefs'],
  additionalProperties: false,
});

const parseJsonLines = (text) => String(text || '')
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean)
  .flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });

export const resolveObservedCodexModel = (events = []) => {
  for (const event of [...events].reverse()) {
    if (!['turn.completed', 'response.completed'].includes(event?.type)) continue;
    const observed = event?.model
      ?? event?.model_id
      ?? event?.model_slug
      ?? event?.response?.model
      ?? event?.turn?.model
      ?? event?.metadata?.model;
    if (typeof observed === 'string' && observed.trim()) return observed.trim();
  }
  return null;
};

const codexSessionDateDirectories = (sessionsRoot, startedAt = new Date()) => {
  const directories = new Set();
  for (const offset of [-86_400_000, 0, 86_400_000]) {
    const date = new Date(startedAt.getTime() + offset);
    const local = [date.getFullYear(), date.getMonth() + 1, date.getDate()];
    const utc = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
    for (const [year, month, day] of [local, utc]) {
      directories.add(path.join(sessionsRoot, String(year), String(month).padStart(2, '0'), String(day).padStart(2, '0')));
    }
  }
  return [...directories];
};

const findCodexSessionRollout = async ({ threadId, env, startedAt }) => {
  if (!/^[0-9a-f-]{16,}$/i.test(String(threadId || ''))) return null;
  const codexHome = env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const suffix = `${threadId}.jsonl`;
  for (const directory of codexSessionDateDirectories(path.join(codexHome, 'sessions'), startedAt)) {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); } catch { continue; }
    const match = entries.find((entry) => entry.isFile() && entry.name.endsWith(suffix));
    if (match) return path.join(directory, match.name);
  }
  return null;
};

export const resolveObservedCodexSessionModel = async ({ threadId, env = process.env, startedAt = new Date() } = {}) => {
  const rolloutPath = await findCodexSessionRollout({ threadId, env, startedAt });
  if (!rolloutPath) return null;
  let identityMatched = false;
  let observed = null;
  const lines = readline.createInterface({ input: createReadStream(rolloutPath), crlfDelay: Infinity });
  for await (const line of lines) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event?.type === 'session_meta') {
      const sessionId = event?.payload?.session_id ?? event?.payload?.id;
      identityMatched = sessionId === threadId;
    }
    if (event?.type === 'turn_context') {
      const model = event?.payload?.model;
      if (typeof model === 'string' && model.trim()) observed = model.trim();
    }
  }
  return identityMatched ? observed : null;
};

const assertReviewOutcome = (value) => {
  if (!value || typeof value !== 'object' || !['pass', 'fail', 'blocked'].includes(value.verdict)) {
    throw new Error('codex_review_output_invalid: verdict must be pass, fail, or blocked');
  }
  for (const field of ['findings', 'risks', 'evidenceRefs']) {
    if (!Array.isArray(value[field])) throw new Error(`codex_review_output_invalid: ${field} must be an array`);
  }
  return value;
};

const reviewPrompt = ({ executionContract, executionCapsule }) => [
  'Perform the independent Kernel review described below.',
  'You are a read-only reviewer. Do not edit files, run mutating commands, or invoke Kernel commands.',
  'Inspect the current workspace and return only the JSON object required by the supplied output schema.',
  'A pass verdict requires every reviewed acceptance claim to be supported by the current files and evidence.',
  '',
  'EXECUTION CONTRACT',
  JSON.stringify(executionContract || {}, null, 2),
  '',
  'REVIEW CAPSULE',
  JSON.stringify(executionCapsule || {}, null, 2),
].join('\n');

const resolveWindowsCodexScript = (command, env) => {
  if (path.extname(command).toLowerCase() === '.ps1' && path.isAbsolute(command) && existsSync(command)) return command;
  for (const directory of String(env.PATH || env.Path || '').split(path.delimiter).filter(Boolean)) {
    const candidate = path.join(directory, 'codex.ps1');
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('codex_review_dispatch_failed: codex.ps1 was not found on PATH');
};

export const runCodexReviewProcess = ({
  command,
  args,
  input,
  cwd,
  env,
  timeoutMs,
  spawnImpl = spawn,
  platform = process.platform,
  resolveWindowsScript = resolveWindowsCodexScript,
  cleanupWindowsProcessTree = cleanupWindowsTimeoutProcessTree,
}) => new Promise((resolve, reject) => {
  const windowsScript = platform === 'win32' ? resolveWindowsScript(command, env) : null;
  const launchCommand = windowsScript ? 'powershell.exe' : command;
  const launchArgs = windowsScript
    ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', windowsScript, ...args]
    : args;
  const child = spawnImpl(launchCommand, launchArgs, {
    cwd,
    env,
    windowsHide: true,
    shell: false,
  });
  // Passing the review prompt over stdin avoids Windows PowerShell's script
  // argument re-tokenization and gives codex.ps1 the EOF it requires.
  child.stdin?.on('error', () => {});
  child.stdin?.end(input);
  let stdout = '';
  let stderr = '';
  let settled = false;
  const append = (current, chunk) => `${current}${chunk}`.slice(-4_000_000);
  child.stdout?.on('data', (chunk) => { stdout = append(stdout, chunk); });
  child.stderr?.on('data', (chunk) => { stderr = append(stderr, chunk); });
  const startedAt = new Date();
  let timer = null;
  const settle = (callback, value) => {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    callback(value);
  };
  timer = setTimeout(() => {
    if (platform === 'win32') {
      const cleanup = cleanupWindowsProcessTree({
        launcherPid: child.pid,
        expectedCommand: launchCommand,
        expectedArgs: windowsScript ? [windowsScript] : [],
        startedAt,
      });
      if (cleanup.status !== 'completed') {
        settle(reject, new Error(`codex_review_timeout_cleanup_failed: ${cleanup.reason || cleanup.status}`));
        return;
      }
    } else {
      child.kill();
    }
    settle(reject, new Error(`codex_review_timeout after ${timeoutMs}ms`));
  }, timeoutMs);
  child.once('error', (error) => settle(reject, error));
  child.once('close', (code) => settle(resolve, { code, stdout, stderr }));
});

export const createCodexCliReviewLauncher = ({
  executable = process.platform === 'win32' ? 'codex.ps1' : 'codex',
  projectRoot,
  images = [],
  timeoutMs = 600_000,
  env = process.env,
  spawnImpl = spawn,
} = {}) => async ({ invocation, executionCapsule, executionContract }) => {
  if (!projectRoot) throw new Error('Codex CLI review launcher requires projectRoot');
  if (invocation?.sandbox !== 'read-only' || invocation?.freshSessionRequired !== true) {
    throw new Error('codex_review_requires_fresh_read_only_session');
  }
  if (!invocation.model) throw new Error('codex_review_requires_explicit_model');

  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'kernel-codex-review-'));
  const schemaPath = path.join(tempRoot, 'review-output.schema.json');
  const outputPath = path.join(tempRoot, 'review-output.json');
  try {
    await writeFile(schemaPath, JSON.stringify(CODEX_REVIEW_OUTPUT_SCHEMA, null, 2));
    const args = [
      'exec', '--json', '--model', invocation.model, '--sandbox', 'read-only',
      '--cd', path.resolve(projectRoot), '--skip-git-repo-check',
      '--ignore-user-config',
      '--output-schema', schemaPath, '--output-last-message', outputPath,
    ];
    for (const image of images) args.push('--image', path.resolve(image));
    const input = reviewPrompt({ executionContract, executionCapsule });

    const started = Date.now();
    const processResult = await runCodexReviewProcess({ command: executable, args, input, cwd: projectRoot, env, timeoutMs, spawnImpl });
    const events = parseJsonLines(processResult.stdout);
    const threadId = events.find((event) => event.type === 'thread.started')?.thread_id || null;
    const completed = [...events].reverse().find((event) => event.type === 'turn.completed') || null;
    const failed = [...events].reverse().find((event) => event.type === 'turn.failed' || event.type === 'error') || null;
    if (processResult.code !== 0 || failed || !threadId || !completed) {
      throw new Error(`codex_review_dispatch_failed: exit=${processResult.code}; ${failed?.message || processResult.stderr || 'missing terminal event'}`);
    }
    const outcome = assertReviewOutcome(JSON.parse(await readFile(outputPath, 'utf8')));
    const resolvedModel = resolveObservedCodexModel(events)
      ?? await resolveObservedCodexSessionModel({ threadId, env, startedAt: new Date(started) });
    return {
      status: 'completed',
      resultStatus: 'completed',
      resolvedModel,
      resolvedEffort: invocation.effort || null,
      sessionId: threadId,
      wallClockMs: Date.now() - started,
      inputTokens: completed.usage?.input_tokens ?? null,
      cachedInputTokens: completed.usage?.cached_input_tokens ?? null,
      outputTokens: completed.usage?.output_tokens ?? null,
      outcome,
    };
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
};
