#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import {
  browserArtifactPathAllowed,
  buildBrowserFailureBlockerMapping,
} from './lib/browser-failure-package.mjs';

const SETUP_GAP_EXIT = 64;
const DEFAULT_TIMEOUT_MS = 15000;

const usage = () => [
  'Usage:',
  '  node scripts/browser-flow-runner.mjs --flow smoke --url <url> --browserctl <path> [--run-id <id>] [--verdict-dir <dir>]',
  '  node scripts/browser-flow-runner.mjs --flow smoke --config <browser-flow.json> --browserctl <path> [--run-id <id>] [--verdict-dir <dir>]',
  '  browser-flow config may include agenticConfirmation for backend-neutral final browser evidence.',
].join('\n');

const parseArgs = (argv) => {
  const options = {
    flow: '',
    url: '',
    browserctl: process.env.BROWSERCTL || 'browserctl',
    runId: process.env.RUN_ID || new Date().toISOString().replace(/[-:.TZ]/g, ''),
    verdictDir: process.env.BROWSER_FLOW_VERDICT_DIR || '.moonshot-relay',
    config: '',
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--flow') {
      options.flow = argv[++index] || '';
    } else if (arg === '--flow-name') {
      options.flow = argv[++index] || '';
    } else if (arg === '--url') {
      options.url = argv[++index] || '';
    } else if (arg === '--browserctl') {
      options.browserctl = argv[++index] || '';
    } else if (arg === '--run-id') {
      options.runId = argv[++index] || '';
    } else if (arg === '--verdict-dir') {
      options.verdictDir = argv[++index] || '';
    } else if (arg === '--config') {
      options.config = argv[++index] || '';
    } else if (arg === '--timeout-ms') {
      options.timeoutMs = Number(argv[++index] || DEFAULT_TIMEOUT_MS);
    } else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    options.timeoutMs = DEFAULT_TIMEOUT_MS;
  }
  return options;
};

const toPortable = (filePath) => path.relative(process.cwd(), filePath).split(path.sep).join('/') || filePath.split(path.sep).join('/');

const writeVerdict = async (options, verdict) => {
  const verdictDir = path.resolve(options.verdictDir || '.moonshot-relay');
  await mkdir(verdictDir, { recursive: true });
  const verdictFile = path.join(verdictDir, `browser-flow-verdict-${options.runId}.json`);
  await writeFile(verdictFile, `${JSON.stringify(verdict, null, 2)}\n`);
  console.log(toPortable(verdictFile));
  return verdictFile;
};

const loadConfig = async (configPath) => {
  if (!configPath) {
    return null;
  }
  const resolved = path.resolve(configPath);
  const content = await readFile(resolved, 'utf8');
  return {
    path: resolved,
    dir: path.dirname(resolved),
    data: JSON.parse(content),
  };
};

const redactValueSet = (config = {}) => {
  const values = new Set();
  const addRedactValue = (value) => {
    if (typeof value !== 'string' || value.length < 4) {
      return;
    }
    if (/^(true|false|null|none|undefined|yes|no|on|off)$/i.test(value.trim())) {
      return;
    }
    values.add(value);
  };
  const collectConfigSecrets = (value, key = '') => {
    if (Array.isArray(value)) {
      value.forEach((item) => collectConfigSecrets(item, key));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [childKey, childValue] of Object.entries(value)) {
        collectConfigSecrets(childValue, childKey);
      }
      return;
    }
    if (/TOKEN|SECRET|PASSWORD|AUTH|API[_-]?KEY|PRIVATE/i.test(key)) {
      addRedactValue(value);
    }
  };
  for (const [key, value] of Object.entries(process.env)) {
    if (/TOKEN|SECRET|PASSWORD|AUTH|API[_-]?KEY|PRIVATE/i.test(key)) {
      addRedactValue(value);
    }
  }
  for (const value of Array.isArray(config.redactValues) ? config.redactValues : []) {
    addRedactValue(value);
  }
  collectConfigSecrets(config);
  return values;
};

const redactText = (text, values) => {
  let redacted = String(text || '');
  for (const value of values) {
    redacted = redacted.split(value).join('[REDACTED]');
  }
  return redacted.replace(/[A-Za-z0-9_-]*(?:token|secret|password|apikey|api_key|private)[A-Za-z0-9_=-]*/gi, '[REDACTED]');
};

const resolveCwd = (cwd, baseDir) => {
  if (!cwd) {
    return process.cwd();
  }
  return path.resolve(baseDir || process.cwd(), cwd);
};

const normalizeCommandSpec = (spec, baseDir) => {
  if (!spec) {
    return null;
  }
  if (typeof spec === 'string') {
    return {
      command: spec,
      args: [],
      cwd: process.cwd(),
      shell: true,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    };
  }
  if (Array.isArray(spec)) {
    return {
      command: String(spec[0] || ''),
      args: spec.slice(1).map(String),
      cwd: process.cwd(),
      shell: false,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    };
  }
  if (typeof spec === 'object') {
    return {
      command: String(spec.command || ''),
      args: Array.isArray(spec.args) ? spec.args.map(String) : [],
      cwd: resolveCwd(spec.cwd, baseDir),
      shell: spec.shell ?? false,
      timeoutMs: Number(spec.timeoutMs || DEFAULT_TIMEOUT_MS),
      env: spec.env && typeof spec.env === 'object' ? spec.env : {},
    };
  }
  return null;
};

const hasCommand = (rawSpec, baseDir) => Boolean(normalizeCommandSpec(rawSpec, baseDir)?.command);

const commandLine = (spec) => [spec.command, ...(spec.args || [])].filter(Boolean).join(' ');

const isPathLikeCommand = (command) => path.isAbsolute(command) || command.includes('/') || command.includes('\\');

const browserCompletionFailureClassFor = (failureClass) => ({
  static_check_failed: 'static_gate_failed',
  build_failed: 'build_failed',
  fixture_seed_failure: 'fixture_setup_failed',
  missing_preview_command: 'preview_start_failed',
  missing_readiness_probe: 'preview_start_failed',
  preview_start_failed: 'preview_start_failed',
  unavailable_port: 'preview_start_failed',
  readiness_timeout: 'preview_start_failed',
  cleanup_failed: 'runtime_environment_failed',
  preview_process_leak: 'runtime_environment_failed',
  mock_api_process_leak: 'runtime_environment_failed',
  missing_browser_backend: 'runtime_environment_failed',
  browser_backend_failed: 'runtime_environment_failed',
  unsupported_browser_backend: 'setup_gap',
  missing_confirmation_command: 'runtime_environment_failed',
  browser_adapter_timeout: 'runtime_environment_failed',
  browser_confirmation_failed: 'browser_confirmation_failed',
  mock_api_start_failed: 'runtime_environment_failed',
  unsupported_flow: 'setup_gap',
  missing_url: 'setup_gap',
}[failureClass] || failureClass || '');

const supportedConfirmationBackends = new Set(['agent-browser', 'playwright-mcp', 'browserctl']);

const parseJsonObject = (text) => {
  if (!text) {
    return {};
  }
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    const lines = String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    for (const line of lines.reverse()) {
      if (!line.startsWith('{') || !line.endsWith('}')) {
        continue;
      }
      try {
        const parsed = JSON.parse(line);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch {
        // Keep scanning earlier lines; adapter stdout can contain non-JSON logs.
      }
    }
    return {};
  }
};

const runAgenticConfirmation = (config, context) => {
  const rawConfig = config.agenticConfirmation || config.browserConfirmation || null;
  if (!rawConfig) {
    return { step: null, outcome: null };
  }
  const backend = String(rawConfig.backend || 'agent-browser');
  if (!supportedConfirmationBackends.has(backend)) {
    return {
      step: {
        name: 'agentic_browser_confirmation',
        status: 'setup_gap',
        setupGap: true,
        failureClass: 'unsupported_browser_backend',
        backend,
        command: '',
        stdout: '',
        stderr: `Unsupported browser confirmation backend: ${backend}`,
        exitCode: null,
      },
      outcome: {
        status: 'setup_gap',
        setupGap: true,
        failureClass: 'unsupported_browser_backend',
        stderr: `Unsupported browser confirmation backend: ${backend}`,
      },
    };
  }
  const rawCommand = rawConfig.command || rawConfig.adapterCommand || rawConfig.confirmCommand;
  if (!hasCommand(rawCommand, context.baseDir)) {
    return {
      step: {
        name: 'agentic_browser_confirmation',
        status: 'setup_gap',
        setupGap: true,
        failureClass: 'missing_confirmation_command',
        backend,
        command: '',
        stdout: '',
        stderr: 'Browser confirmation config is missing command.',
        exitCode: null,
      },
      outcome: {
        status: 'setup_gap',
        setupGap: true,
        failureClass: 'missing_confirmation_command',
        stderr: 'Browser confirmation config is missing command.',
      },
    };
  }

  const step = runCommandStep('agentic_browser_confirmation', rawCommand, context);
  const parsed = parseJsonObject(step.stdout);
  const merged = {
    backend,
    ...parsed,
    adapterExpectedUrl: parsed.expectedUrl || '',
    adapterExpectedText: parsed.expectedText || '',
    adapterExpectedRole: parsed.expectedRole || '',
    adapterExpectedName: parsed.expectedName || '',
    expectedUrl: rawConfig.expectedUrl || config.readinessUrl || '',
    expectedText: rawConfig.expectedText || '',
    expectedRole: rawConfig.expectedRole || '',
    expectedName: rawConfig.expectedName || '',
    command: step.command,
    stdout: step.stdout,
    stderr: step.stderr,
    exitCode: step.exitCode,
  };
  const artifactPaths = [
    merged.screenshotPath,
    merged.snapshotPath,
    ...(Array.isArray(merged.artifacts) ? merged.artifacts.map((artifact) => artifact?.path || artifact?.artifactPath) : []),
  ].filter(Boolean);
  const outsideArtifactPaths = artifactPaths.filter((artifactPath) => !browserArtifactPathAllowed(artifactPath, { baseDir: context.baseDir }));
  const confirmationStep = {
    ...step,
    backend,
    confirmation: merged,
  };
  if (outsideArtifactPaths.length > 0) {
    return {
      step: {
        ...confirmationStep,
        status: 'failed',
        failureClass: 'artifact_missing',
      },
      outcome: {
        status: 'failed',
        setupGap: false,
        failureClass: 'artifact_missing',
        command: step.command,
        stdout: step.stdout,
        stderr: `Browser confirmation artifact path outside .moonshot-relay/browser-artifacts: ${outsideArtifactPaths.map((entry) => redactText(entry, context.redactValues)).join(', ')}`,
      },
    };
  }
  if (step.timedOut) {
    return {
      step: {
        ...confirmationStep,
        setupGap: true,
        failureClass: 'browser_adapter_timeout',
      },
      outcome: {
        status: 'setup_gap',
        setupGap: true,
        failureClass: 'browser_adapter_timeout',
        command: step.command,
        stdout: step.stdout,
        stderr: step.stderr,
      },
    };
  }
  if (parsed.status === 'setup_gap') {
    return {
      step: {
        ...confirmationStep,
        status: 'setup_gap',
        setupGap: true,
        failureClass: parsed.failureClass || 'runtime_environment_failed',
      },
      outcome: {
        status: 'setup_gap',
        setupGap: true,
        failureClass: parsed.failureClass || 'runtime_environment_failed',
        command: step.command,
        stdout: step.stdout,
        stderr: step.stderr,
      },
    };
  }
  if (step.status !== 'passed' || parsed.status === 'failed') {
    const missingAdapter = /ENOENT|not recognized|not found|no such file/i.test(`${step.stderr}\n${step.stdout}`);
    return {
      step: {
        ...confirmationStep,
        status: missingAdapter ? 'setup_gap' : confirmationStep.status,
        setupGap: missingAdapter,
        failureClass: parsed.failureClass || (missingAdapter ? 'missing_browser_backend' : 'browser_confirmation_failed'),
      },
      outcome: {
        status: parsed.status === 'setup_gap' || missingAdapter ? 'setup_gap' : 'failed',
        setupGap: parsed.status === 'setup_gap' || missingAdapter,
        failureClass: parsed.failureClass || (missingAdapter ? 'missing_browser_backend' : 'browser_confirmation_failed'),
        command: step.command,
        stdout: step.stdout,
        stderr: step.stderr,
      },
    };
  }
  return {
    step: {
      ...confirmationStep,
      failureClass: '',
      setupGap: false,
    },
    outcome: null,
  };
};

const runCommandStep = (name, rawSpec, context) => {
  const spec = normalizeCommandSpec(rawSpec, context.baseDir);
  if (!spec || !spec.command) {
    return { name, status: 'skipped', command: '', stdout: '', stderr: '', exitCode: null };
  }
  const timeout = Number.isFinite(spec.timeoutMs) && spec.timeoutMs > 0 ? spec.timeoutMs : context.timeoutMs;
  const result = spawnSync(spec.command, spec.args || [], {
    cwd: spec.cwd,
    env: { ...process.env, ...(spec.env || {}) },
    encoding: 'utf8',
    shell: spec.shell,
    timeout,
    windowsHide: true,
  });
  const timedOut = result.error?.code === 'ETIMEDOUT';
  return {
    name,
    status: result.status === 0 ? 'passed' : 'failed',
    command: redactText(commandLine(spec), context.redactValues),
    cwd: redactText(spec.cwd, context.redactValues),
    exitCode: result.status,
    timedOut,
    stdout: redactText(result.stdout || '', context.redactValues),
    stderr: redactText(result.stderr || (result.error ? result.error.message : ''), context.redactValues),
  };
};

const startBackground = (name, rawSpec, context) => {
  const spec = normalizeCommandSpec(rawSpec, context.baseDir);
  if (!spec || !spec.command) {
    return null;
  }
  const logs = { stdout: '', stderr: '' };
  const entry = {
    name,
    child: null,
    logs,
    command: redactText(commandLine(spec), context.redactValues),
    cwd: redactText(spec.cwd, context.redactValues),
    pid: null,
    exitCode: null,
    signal: null,
    exited: false,
    spawnError: '',
  };
  if (isPathLikeCommand(spec.command) && !existsSync(spec.command)) {
    entry.exited = true;
    entry.spawnError = redactText(`spawn ${spec.command} ENOENT`, context.redactValues);
    entry.logs.stderr = entry.spawnError;
    return entry;
  }
  const child = spawn(spec.command, spec.args || [], {
    cwd: spec.cwd,
    env: { ...process.env, ...(spec.env || {}) },
    shell: spec.shell,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout?.on('data', (chunk) => {
    logs.stdout += redactText(chunk.toString(), context.redactValues);
  });
  child.stderr?.on('data', (chunk) => {
    logs.stderr += redactText(chunk.toString(), context.redactValues);
  });
  entry.child = child;
  entry.pid = child.pid || null;
  child.once('error', (error) => {
    entry.exited = true;
    entry.spawnError = redactText(error instanceof Error ? error.message : String(error), context.redactValues);
    entry.logs.stderr = `${entry.logs.stderr || ''}${entry.logs.stderr ? '\n' : ''}${entry.spawnError}`;
  });
  child.once('exit', (code, signal) => {
    entry.exited = true;
    entry.exitCode = code;
    entry.signal = signal;
  });
  return entry;
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const stopBackground = async (entry, timeoutMs = 3000) => {
  if (!entry?.child || entry.exited) {
    return { terminated: true, exitCode: entry?.exitCode ?? null, signal: entry?.signal ?? null };
  }
  const child = entry.child;
  const exitPromise = new Promise((resolve) => {
    child.once('exit', (code, signal) => {
      entry.exited = true;
      entry.exitCode = code;
      entry.signal = signal;
      resolve({ code, signal });
    });
  });
  child.kill();
  const result = await Promise.race([exitPromise, wait(timeoutMs).then(() => null)]);
  if (result) {
    return { terminated: true, exitCode: result.code, signal: result.signal };
  }
  child.kill('SIGKILL');
  const killed = await Promise.race([exitPromise, wait(timeoutMs).then(() => null)]);
  return {
    terminated: Boolean(killed),
    exitCode: killed?.code ?? null,
    signal: killed?.signal ?? null,
  };
};

const probeReadiness = async (url, timeoutMs) => {
  const started = Date.now();
  let lastError = '';
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(Math.min(1000, timeoutMs)) });
      if (response.ok) {
        return { ready: true, httpStatus: response.status, error: '' };
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await wait(250);
  }
  return { ready: false, httpStatus: 0, error: lastError };
};

const classifyPreviewFailure = (entry, readiness) => {
  const combined = `${entry?.logs?.stdout || ''}\n${entry?.logs?.stderr || ''}\n${readiness?.error || ''}`;
  if (/EADDRINUSE|address already in use|Only one usage of each socket address/i.test(combined)) {
    return 'unavailable_port';
  }
  return 'readiness_timeout';
};

const browserHealthStep = (options, context) => {
  const command = [options.browserctl, 'health'];
  const pathLikeBrowserctl = isPathLikeCommand(options.browserctl);
  const useShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(options.browserctl);
  const result = spawnSync(options.browserctl, ['health'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: useShell,
    timeout: options.timeoutMs,
    windowsHide: true,
  });
  const missingBackend = (result.error && result.error.code === 'ENOENT') || (pathLikeBrowserctl && !existsSync(options.browserctl));
  return {
    name: 'browser_backend',
    status: result.status === 0 ? 'passed' : missingBackend ? 'setup_gap' : 'failed',
    setupGap: Boolean(missingBackend),
    failureClass: missingBackend ? 'missing_browser_backend' : result.status === 0 ? '' : 'browser_backend_failed',
    command: redactText(command.join(' '), context.redactValues),
    stdout: redactText(result.stdout || '', context.redactValues),
    stderr: redactText(result.stderr || (result.error ? result.error.message : ''), context.redactValues),
    exitCode: result.status,
  };
};

const buildBaseVerdict = (options) => ({
  schemaVersion: 1,
  flow: options.flow || 'smoke',
  url: options.url,
  runId: options.runId,
  startedAt: new Date().toISOString(),
  finishedAt: '',
  status: 'failed',
  setupGap: false,
  failureClass: '',
  browserCompletionFailureClass: '',
  setupGapReason: '',
  command: '',
  stdout: '',
  stderr: '',
  steps: [],
  preview: null,
  mockApi: null,
  agenticConfirmation: null,
  cleanup: {
    previewProcessTerminated: null,
    mockApiProcessTerminated: null,
    cleanupCommand: null,
    leakCheckCommand: null,
  },
});

const finish = (verdict, fields) => {
  const failureClass = fields.failureClass || verdict.failureClass || '';
  const finished = {
    ...verdict,
    ...fields,
    setupGapReason: fields.setupGapReason || (fields.setupGap ? failureClass : verdict.setupGapReason || ''),
    browserCompletionFailureClass: fields.browserCompletionFailureClass || browserCompletionFailureClassFor(failureClass),
    finishedAt: new Date().toISOString(),
  };
  if (finished.status !== 'passed') {
    finished.blockerMapping = buildBrowserFailureBlockerMapping({
      failureClass: finished.browserCompletionFailureClass || finished.failureClass,
      failedStage: finished.failedStage || finished.failureClass,
      setupGap: finished.setupGap === true,
      browserResult: finished,
    });
  } else {
    finished.blockerMapping = [];
  }
  return finished;
};

const runLifecycle = async (options, configBundle) => {
  const config = configBundle.data || {};
  const context = {
    baseDir: configBundle.dir,
    timeoutMs: Number(config.timeoutMs || options.timeoutMs || DEFAULT_TIMEOUT_MS),
    redactValues: redactValueSet(config),
  };
  const verdict = buildBaseVerdict({
    ...options,
    url: redactText(options.url || config.readinessUrl || '', context.redactValues),
  });
  verdict.configPath = redactText(toPortable(configBundle.path), context.redactValues);
  let outcome = null;
  let previewEntry = null;
  let mockApiEntry = null;
  try {
    lifecycle: {
    const browserStep = browserHealthStep(options, context);
    verdict.steps.push(browserStep);
    if (browserStep.status !== 'passed') {
      outcome = {
        status: browserStep.setupGap ? 'setup_gap' : 'failed',
        setupGap: browserStep.setupGap,
        failureClass: browserStep.failureClass,
        command: browserStep.command,
        stdout: browserStep.stdout,
        stderr: browserStep.stderr,
      };
      break lifecycle;
    }

    for (const [index, command] of (config.staticCommands || []).entries()) {
      const step = runCommandStep(`static_${index + 1}`, command, context);
      verdict.steps.push(step);
      if (step.status !== 'passed') {
        outcome = {
          status: 'failed',
          failureClass: 'static_check_failed',
          command: step.command,
          stdout: step.stdout,
          stderr: step.stderr,
        };
        break lifecycle;
      }
    }

    const buildStep = runCommandStep('build', config.buildCommand, context);
    verdict.steps.push(buildStep);
    if (buildStep.status === 'failed') {
      outcome = {
        status: 'failed',
        failureClass: 'build_failed',
        command: buildStep.command,
        stdout: buildStep.stdout,
        stderr: buildStep.stderr,
      };
      break lifecycle;
    }

    const fixtureStep = runCommandStep('fixture_seed', config.fixtureSeedCommand, context);
    verdict.steps.push(fixtureStep);
    if (fixtureStep.status === 'failed') {
      outcome = {
        status: 'setup_gap',
        setupGap: true,
        failureClass: 'fixture_seed_failure',
        command: fixtureStep.command,
        stdout: fixtureStep.stdout,
        stderr: fixtureStep.stderr,
      };
      break lifecycle;
    }

    if (!config.previewCommand) {
      outcome = {
        status: 'setup_gap',
        setupGap: true,
        failureClass: 'missing_preview_command',
        stderr: 'Browser flow config is missing previewCommand.',
      };
      break lifecycle;
    }
    if (!hasCommand(config.previewCommand, context.baseDir)) {
      outcome = {
        status: 'setup_gap',
        setupGap: true,
        failureClass: 'preview_start_failed',
        stderr: 'Browser flow config previewCommand is malformed.',
      };
      break lifecycle;
    }
    if (!config.readinessUrl) {
      outcome = {
        status: 'setup_gap',
        setupGap: true,
        failureClass: 'missing_readiness_probe',
        stderr: 'Browser flow config is missing readinessUrl.',
      };
      break lifecycle;
    }

    mockApiEntry = startBackground('mock_api', config.mockApiCommand, context);
    previewEntry = startBackground('preview', config.previewCommand, context);
    verdict.mockApi = mockApiEntry ? {
      command: mockApiEntry.command,
      cwd: mockApiEntry.cwd,
      pid: mockApiEntry.pid,
      logs: mockApiEntry.logs,
    } : null;
    verdict.preview = {
      command: previewEntry.command,
      cwd: previewEntry.cwd,
      pid: previewEntry.pid,
      readinessUrl: redactText(config.readinessUrl, context.redactValues),
      logs: previewEntry.logs,
    };

    if (mockApiEntry?.spawnError) {
      outcome = {
        status: 'setup_gap',
        setupGap: true,
        failureClass: 'mock_api_start_failed',
        command: mockApiEntry.command,
        stderr: redactText(mockApiEntry.spawnError, context.redactValues),
      };
      break lifecycle;
    }

    if (previewEntry?.spawnError) {
      outcome = {
        status: 'setup_gap',
        setupGap: true,
        failureClass: 'preview_start_failed',
        command: previewEntry.command,
        stderr: redactText(previewEntry.spawnError, context.redactValues),
      };
      break lifecycle;
    }

    if (!previewEntry?.pid) {
      outcome = {
        status: 'setup_gap',
        setupGap: true,
        failureClass: 'preview_start_failed',
        stderr: 'Preview process did not start.',
      };
      break lifecycle;
    }

    const readiness = await probeReadiness(config.readinessUrl, context.timeoutMs);
    verdict.preview.readiness = readiness;
    verdict.preview.logs = previewEntry.logs;
    if (!readiness.ready) {
      const failureClass = classifyPreviewFailure(previewEntry, readiness);
      outcome = {
        status: 'setup_gap',
        setupGap: true,
        failureClass,
        command: previewEntry.command,
        stdout: previewEntry.logs.stdout,
        stderr: previewEntry.logs.stderr || readiness.error,
      };
      break lifecycle;
    }

    const confirmation = runAgenticConfirmation(config, context);
    if (confirmation.step) {
      verdict.steps.push(confirmation.step);
      verdict.agenticConfirmation = confirmation.step.confirmation || {
        backend: confirmation.step.backend || '',
        status: confirmation.step.status,
        failureClass: confirmation.step.failureClass || '',
        command: confirmation.step.command || '',
        stdout: confirmation.step.stdout || '',
        stderr: confirmation.step.stderr || '',
        exitCode: confirmation.step.exitCode ?? null,
      };
    }
    if (confirmation.outcome) {
      outcome = confirmation.outcome;
      break lifecycle;
    }

    outcome = {
      status: 'passed',
      setupGap: false,
      failureClass: '',
      command: previewEntry.command,
      stdout: previewEntry.logs.stdout,
      stderr: previewEntry.logs.stderr,
    };
    }
  } finally {
    const previewStop = await stopBackground(previewEntry);
    const mockApiStop = await stopBackground(mockApiEntry);
    const cleanupStep = runCommandStep('cleanup', config.cleanupCommand, context);
    const leakCheckStep = runCommandStep('leak_check', config.leakCheckCommand, context);
    verdict.cleanup = {
      previewProcessTerminated: previewEntry ? previewStop.terminated : null,
      mockApiProcessTerminated: mockApiEntry ? mockApiStop.terminated : null,
      cleanupCommand: cleanupStep.command ? cleanupStep : null,
      leakCheckCommand: leakCheckStep.command ? leakCheckStep : null,
    };
  }
  if (outcome?.status === 'passed') {
    if (verdict.cleanup.previewProcessTerminated === false) {
      outcome = {
        ...outcome,
        status: 'setup_gap',
        setupGap: true,
        failureClass: 'preview_process_leak',
        stderr: 'Preview process did not terminate during cleanup.',
      };
    } else if (verdict.cleanup.mockApiProcessTerminated === false) {
      outcome = {
        ...outcome,
        status: 'setup_gap',
        setupGap: true,
        failureClass: 'mock_api_process_leak',
        stderr: 'Mock API process did not terminate during cleanup.',
      };
    } else if (verdict.cleanup.cleanupCommand?.status === 'failed') {
      outcome = {
        ...outcome,
        status: 'setup_gap',
        setupGap: true,
        failureClass: 'cleanup_failed',
        command: verdict.cleanup.cleanupCommand.command,
        stdout: verdict.cleanup.cleanupCommand.stdout,
        stderr: verdict.cleanup.cleanupCommand.stderr,
      };
    } else if (verdict.cleanup.leakCheckCommand?.status === 'failed') {
      outcome = {
        ...outcome,
        status: 'setup_gap',
        setupGap: true,
        failureClass: 'preview_process_leak',
        command: verdict.cleanup.leakCheckCommand.command,
        stdout: verdict.cleanup.leakCheckCommand.stdout,
        stderr: verdict.cleanup.leakCheckCommand.stderr,
      };
    }
  }
  return finish(verdict, outcome || {
    status: 'failed',
    failureClass: 'preview_start_failed',
    stderr: 'Preview lifecycle ended without an outcome.',
  });
};

const runLegacySmoke = async (options, context) => {
  const baseVerdict = buildBaseVerdict(options);

  if ((options.flow || 'smoke') !== 'smoke') {
    return finish(baseVerdict, {
      status: 'setup_gap',
      setupGap: true,
      failureClass: 'unsupported_flow',
      stderr: `Unsupported browser flow: ${options.flow}`,
    });
  }

  if (!options.url) {
    return finish(baseVerdict, {
      status: 'setup_gap',
      setupGap: true,
      failureClass: 'missing_url',
      stderr: 'Missing --url for smoke browser flow.',
    });
  }

  const step = browserHealthStep(options, context);
  return finish(baseVerdict, {
    status: step.status === 'passed' ? 'passed' : step.setupGap ? 'setup_gap' : 'failed',
    setupGap: Boolean(step.setupGap),
    failureClass: step.failureClass,
    command: step.command,
    stdout: step.stdout,
    stderr: step.stderr,
    steps: [step],
  });
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const config = await loadConfig(options.config);
  const context = {
    baseDir: process.cwd(),
    timeoutMs: options.timeoutMs,
    redactValues: redactValueSet(config?.data || {}),
  };
  const verdict = config ? await runLifecycle(options, config) : await runLegacySmoke(options, context);
  await writeVerdict(options, verdict);
  if (verdict.status === 'passed') {
    return;
  }
  process.exitCode = verdict.setupGap ? SETUP_GAP_EXIT : 1;
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
