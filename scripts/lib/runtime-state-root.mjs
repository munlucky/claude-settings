import path from 'node:path';

export const DEFAULT_RUNTIME_STATE_ROOT = '.moonshot-state';
export const LEGACY_CLAUDE_STATE_ROOT = '.claude';

export function resolveRuntimeStateRoot(cwd = process.cwd(), env = process.env) {
  const configured = String(env.MOONSHOT_STATE_ROOT || env.PHASE_RUNTIME_STATE_ROOT || DEFAULT_RUNTIME_STATE_ROOT).trim();
  return path.resolve(cwd, configured || DEFAULT_RUNTIME_STATE_ROOT);
}

export function resolveRuntimeStatePath(...segments) {
  return path.join(resolveRuntimeStateRoot(), ...segments);
}

export function resolveLegacyClaudeStatePath(...segments) {
  return path.resolve(process.cwd(), LEGACY_CLAUDE_STATE_ROOT, ...segments);
}

export function runtimeStateRelativePath(...segments) {
  return path.posix.join(DEFAULT_RUNTIME_STATE_ROOT, ...segments).replace(/\\/g, '/');
}
