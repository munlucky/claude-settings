#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import process from 'node:process';

const usage = () => 'Usage: node tools/evals/provider-profile-adoption.mjs verify --evidence <file> [--json]';

const parseArgs = (argv) => {
  const [command = 'verify'] = argv;
  const options = { command, evidence: '', json: false };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') options.json = true;
    else if (arg === '--evidence') options.evidence = argv[++index] || '';
    else if (arg.startsWith('--')) options[arg.slice(2)] = argv[++index] || '';
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  return options;
};

export function verifyAdoptionEvidence(evidence = {}) {
  const findings = [];
  const status = evidence.status || '';
  if (!['not_authorized', 'managed_profile_installed', 'live_adopted'].includes(status)) findings.push('invalid_terminal_status');
  if (status === 'not_authorized') {
    if (evidence.approvalStatus !== 'not_authorized') findings.push('not_authorized_requires_explicit_approval_state');
    if (evidence.mutationPerformed !== false) findings.push('not_authorized_requires_zero_mutation');
    if (evidence.liveInstallerInvoked === true) findings.push('not_authorized_must_not_invoke_live_installer');
    if (evidence.rollbackReady !== true) findings.push('not_authorized_requires_rollback_ready');
  }
  if (status === 'managed_profile_installed' || status === 'live_adopted') {
    if (!evidence.installId) findings.push('approved_install_requires_install_id');
    if (evidence.profileSurfaceParity !== 'pass') findings.push('approved_install_requires_profile_parity');
    if (evidence.installedDoctor !== 'pass') findings.push('approved_install_requires_installed_doctor');
    if (evidence.rollbackReady !== true) findings.push('approved_install_requires_rollback_ready');
  }
  return { schemaVersion: 1, status: findings.length === 0 ? 'pass' : 'fail', terminalState: status, findings };
}

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === '--help' || options.command === '-h') {
    console.log(usage());
    return;
  }
  if (options.command !== 'verify' || !options.evidence) throw new Error(usage());
  const result = verifyAdoptionEvidence(JSON.parse(await readFile(options.evidence, 'utf8')));
  console.log(options.json ? JSON.stringify(result, null, 2) : result.status);
  if (result.status !== 'pass') process.exitCode = 1;
};

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}` || process.argv[1]?.endsWith('provider-profile-adoption.mjs')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
