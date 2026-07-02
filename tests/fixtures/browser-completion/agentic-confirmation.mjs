#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const options = {};
for (let index = 2; index < process.argv.length; index += 1) {
  const arg = process.argv[index];
  if (arg.startsWith('--')) {
    options[arg.slice(2)] = process.argv[++index] || '';
  }
}

const screenshotPath = options.screenshot || '.moonshot-relay/browser-artifacts/run/goal/flow/agentic.png';
const snapshotPath = options.snapshot || '.moonshot-relay/browser-artifacts/run/goal/flow/snapshot.json';
await mkdir(path.dirname(path.resolve(screenshotPath)), { recursive: true });
await mkdir(path.dirname(path.resolve(snapshotPath)), { recursive: true });
await writeFile(path.resolve(screenshotPath), 'png\n', 'utf8');
await writeFile(path.resolve(snapshotPath), '{"role":"main"}\n', 'utf8');

if (options.stdoutPrefix) {
  console.log(options.stdoutPrefix);
}

console.log(JSON.stringify({
  status: 'passed',
  backend: options.backend || 'agent-browser',
  url: options.url || 'http://127.0.0.1/',
  expectedText: options.adapterText || 'adapter supplied text',
  expectedRole: options.adapterRole || 'link',
  expectedName: options.adapterName || 'Adapter Name',
  expectedTextFound: true,
  roleNameFound: true,
  screenshotPath,
  snapshotPath,
  accessibilitySnapshot: { role: 'main', name: options.text || 'Ready' },
  consoleSummary: { errorCount: 0 },
  networkSummary: { failedRequestCount: 0 },
}));
