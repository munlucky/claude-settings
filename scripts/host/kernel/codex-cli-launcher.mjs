import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

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

const runProcess = ({ command, args, input, cwd, env, timeoutMs, spawnImpl = spawn }) => new Promise((resolve, reject) => {
  const windowsScript = process.platform === 'win32' ? resolveWindowsCodexScript(command, env) : null;
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
  child.stdin?.end(input);
  let stdout = '';
  let stderr = '';
  const append = (current, chunk) => `${current}${chunk}`.slice(-4_000_000);
  child.stdout?.on('data', (chunk) => { stdout = append(stdout, chunk); });
  child.stderr?.on('data', (chunk) => { stderr = append(stderr, chunk); });
  const timer = setTimeout(() => {
    if (process.platform === 'win32' && spawnImpl === spawn && child.pid) {
      spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
    } else {
      child.kill();
    }
    reject(new Error(`codex_review_timeout after ${timeoutMs}ms`));
  }, timeoutMs);
  child.once('error', (error) => { clearTimeout(timer); reject(error); });
  child.once('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
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
    const processResult = await runProcess({ command: executable, args, input, cwd: projectRoot, env, timeoutMs, spawnImpl });
    const events = parseJsonLines(processResult.stdout);
    const threadId = events.find((event) => event.type === 'thread.started')?.thread_id || null;
    const completed = [...events].reverse().find((event) => event.type === 'turn.completed') || null;
    const failed = [...events].reverse().find((event) => event.type === 'turn.failed' || event.type === 'error') || null;
    if (processResult.code !== 0 || failed || !threadId || !completed) {
      throw new Error(`codex_review_dispatch_failed: exit=${processResult.code}; ${failed?.message || processResult.stderr || 'missing terminal event'}`);
    }
    const outcome = assertReviewOutcome(JSON.parse(await readFile(outputPath, 'utf8')));
    return {
      status: 'completed',
      resultStatus: 'completed',
      resolvedModel: invocation.model,
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
