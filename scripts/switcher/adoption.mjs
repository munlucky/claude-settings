import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveTrackRoots, physicalTargetIdentity } from './paths.mjs';
import { listProviderProcesses } from './process-guard.mjs';
import { installKernelProfile } from '../kernel/profile-install.mjs';
import { installSwitcher } from './installer.mjs';
const execFileAsync = promisify(execFile);

export const LIVE_APPROVAL_TOKEN = 'APPROVE_LIVE_HARNESS_SWITCHER';
const userHome = process.env.USERPROFILE || process.env.HOME || '';
export async function buildLivePreflight({ sourceRoot = process.cwd(), processProvider } = {}) {
  const relayHome = process.env.MOONSHOT_RELAY_HOME || path.join(userHome, '.moonshot-relay');
  const kernelHome = process.env.MOON_RELAY_KERNEL_HOME || path.join(userHome, '.moon-relay-kernel');
  const switcherHome = process.env.MOON_HARNESS_SWITCHER_HOME || path.join(userHome, '.moon-harness-switcher');
  const protectedRoots = [relayHome, process.env.CODEX_HOME || path.join(userHome, '.codex'), process.env.CLAUDE_CONFIG_DIR || path.join(userHome, '.claude'), process.env.QWEN_HOME || path.join(userHome, '.qwen'), process.env.ANTIGRAVITY_HOME || path.join(userHome, '.gemini', 'antigravity')];
  const targets = [];
  for (const surface of ['claude_cli', 'codex_cli', 'qwen_cli', 'codex_desktop', 'antigravity_desktop']) {
    const roots = resolveTrackRoots({ track: 'kernel', surface, sourceRoot, relayHome, kernelHome });
    for (const [kind, target] of Object.entries(roots)) if (['runtimeHome', 'providerHome', 'appDataRoot'].includes(kind) && target) targets.push({ surface, kind, target, identity: await physicalTargetIdentity(target, { protectedRoots }) });
  }
  const processes = {};
  for (const surface of ['codex_desktop', 'antigravity_desktop']) processes[surface] = await listProviderProcesses({ surface, processProvider });
  let head = null; let status = 'scoped_dirty_worktree';
  try { head = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: sourceRoot, windowsHide: true })).stdout.trim(); if (process.env.MOON_HARNESS_PREFLIGHT_CLEAN === '1') status = 'ready'; } catch { status = 'source_identity_unavailable'; }
  return { schemaVersion: 1, status, sourceRoot: path.resolve(sourceRoot), sourceHead: head, targets, processes, approvalRequired: true, liveMutationCount: 0, sensitiveContentRead: false, credentialContentRead: false, protectedRootsPreserved: true };
}

export async function adoptLive({ sourceRoot = process.cwd(), approved = false, approvalToken = '', processProvider } = {}) {
  const preflight = await buildLivePreflight({ sourceRoot, processProvider });
  if (!approved || approvalToken !== LIVE_APPROVAL_TOKEN) return { status: 'operator_approval_missing', errorCode: 'operator_approval_missing', preflight, liveMutationCount: 0 };
  if (Object.values(preflight.processes).some((items) => items.length)) return { status: 'process_active', errorCode: 'process_active', preflight, liveMutationCount: 0 };
  const user = process.env.USERPROFILE || process.env.HOME || '';
  const kernelHome = process.env.MOON_RELAY_KERNEL_HOME || path.join(user, '.moon-relay-kernel');
  const switcherHome = process.env.MOON_HARNESS_SWITCHER_HOME || path.join(user, '.moon-harness-switcher');
  const installed = [];
  for (const [runtime, target] of [['claude', path.join(kernelHome, 'providers', 'claude')], ['codex', path.join(kernelHome, 'providers', 'codex')], ['qwen', path.join(kernelHome, 'providers', 'qwen')], ['antigravity', path.join(kernelHome, 'providers', 'antigravity')]]) installed.push(await installKernelProfile({ sourceRoot, runtime, targetRoot: target }));
  installed.push(await installSwitcher({ sourceRoot, targetRoot: switcherHome }));
  return { status: 'adopted', installId: `${Date.now()}-${process.pid}`, installed, preflight, liveMutationCount: installed.length, rollback: 'metadata/profile manifest rollback only; provider-created data preserved' };
}
