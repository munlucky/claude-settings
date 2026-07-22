import { resolveCodexDesktop } from './codex.mjs';
import { resolveAntigravity } from './antigravity.mjs';
export async function resolveApplication(surface, options = {}) {
  if (surface === 'codex_desktop') return resolveCodexDesktop(options);
  if (surface === 'antigravity_desktop') return resolveAntigravity(options);
  return { schemaVersion: 1, application: surface, status: 'not_required', launchKind: 'unknown', appDataRootMode: 'environment', appServerEffectiveHomeProbe: 'not_run', processSet: [], warnings: [] };
}
