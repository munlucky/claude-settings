#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const usage = () => `Usage: node scripts/browser-flow-runner.mjs --flow smoke --url <url> --browserctl <path> [--run-id <id>] [--verdict-dir <dir>]`;

const parseArgs = (argv) => {
  const options = {
    flow: '',
    url: '',
    browserctl: process.env.BROWSERCTL || 'browserctl',
    runId: process.env.RUN_ID || new Date().toISOString().replace(/[-:.TZ]/g, ''),
    verdictDir: process.env.BROWSER_FLOW_VERDICT_DIR || '.moonshot-relay',
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
    } else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }
  return options;
};

const writeVerdict = async (options, verdict) => {
  const verdictDir = path.resolve(options.verdictDir || '.moonshot-relay');
  await mkdir(verdictDir, { recursive: true });
  const verdictFile = path.join(verdictDir, `browser-flow-verdict-${options.runId}.json`);
  await writeFile(verdictFile, `${JSON.stringify(verdict, null, 2)}\n`);
  const portable = path.relative(process.cwd(), verdictFile).split(path.sep).join('/');
  console.log(portable || verdictFile.split(path.sep).join('/'));
  return verdictFile;
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const baseVerdict = {
    schemaVersion: 1,
    flow: options.flow || 'smoke',
    url: options.url,
    runId: options.runId,
    startedAt,
    finishedAt: '',
    status: 'failed',
    setupGap: false,
    command: '',
    stdout: '',
    stderr: '',
  };

  if ((options.flow || 'smoke') !== 'smoke') {
    await writeVerdict(options, {
      ...baseVerdict,
      finishedAt: new Date().toISOString(),
      status: 'setup_gap',
      setupGap: true,
      stderr: `Unsupported browser flow: ${options.flow}`,
    });
    process.exitCode = 64;
    return;
  }

  if (!options.url) {
    await writeVerdict(options, {
      ...baseVerdict,
      finishedAt: new Date().toISOString(),
      status: 'setup_gap',
      setupGap: true,
      stderr: 'Missing --url for smoke browser flow.',
    });
    process.exitCode = 64;
    return;
  }

  const command = [options.browserctl, 'health'];
  const result = spawnSync(options.browserctl, ['health'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    shell: process.platform === 'win32',
    timeout: 15000,
  });

  const setupGap = result.error && result.error.code === 'ENOENT';
  await writeVerdict(options, {
    ...baseVerdict,
    finishedAt: new Date().toISOString(),
    status: result.status === 0 ? 'passed' : setupGap ? 'setup_gap' : 'failed',
    setupGap: Boolean(setupGap),
    command: command.join(' '),
    stdout: result.stdout || '',
    stderr: result.stderr || (result.error ? result.error.message : ''),
  });

  if (result.status === 0) {
    return;
  }
  process.exitCode = setupGap ? 64 : 1;
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
