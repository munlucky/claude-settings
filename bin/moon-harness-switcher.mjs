#!/usr/bin/env node
import process from 'node:process';
import { switchStatus, switchDoctor, launchSwitch, recoverSwitch, rollbackSwitch, uninstallSwitcher } from '../scripts/switcher/operations.mjs';
import { buildLivePreflight, adoptLive } from '../scripts/switcher/adoption.mjs';

const args = process.argv.slice(2);
const command = args[0] || 'status';
const get = (flag) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : null; };
const json = args.includes('--json');
const output = (value) => console.log(json ? JSON.stringify(value) : Object.entries(value || {}).map(([key, item]) => `${key}: ${typeof item === 'object' ? JSON.stringify(item) : item}`).join('\n'));
try {
  const surface = get('--surface');
  const track = get('--track');
  let result;
  if (command === 'status') result = await switchStatus({ surface });
  else if (command === 'doctor') result = await switchDoctor({ surface });
  else if (command === 'preflight') result = await buildLivePreflight({ sourceRoot: get('--source-root') || process.cwd() });
  else if (command === 'adopt') result = await adoptLive({ sourceRoot: get('--source-root') || process.cwd(), approved: args.includes('--approved'), approvalToken: get('--approval-token') || '' });
  else if (command === 'launch') result = await launchSwitch({ surface, track, sourceRoot: get('--source-root') || process.cwd(), dryRun: !args.includes('--execute') });
  else if (command === 'recover') result = await recoverSwitch({ surface, closeApproval: args.includes('--approved') });
  else if (command === 'rollback') result = await rollbackSwitch({ surface });
  else if (command === 'uninstall') result = await uninstallSwitcher({ home: get('--home') });
  else throw new Error(`unknown command: ${command}`);
  output(result);
  if (result?.status === 'error' || result?.errorCode === 'wrong_harness') process.exitCode = 1;
} catch (error) {
  output({ schemaVersion: 1, status: 'error', errorCode: error.code || 'unknown_error', message: error.message, sensitiveContentRead: false });
  process.exitCode = 1;
}
