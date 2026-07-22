import path from 'node:path';
import { resolveCommand, resolveExecutable, hashExecutable, baseDiscovery } from './common.mjs';
export async function resolveAntigravity({ candidates = [], commandResolver = resolveCommand } = {}) {
  const defaults = [...candidates, process.env.ANTIGRAVITY_EXECUTABLE, path.join(process.env.LOCALAPPDATA || '', 'Programs', 'antigravity', 'Antigravity.exe')];
  const executable = await resolveExecutable(defaults) || await commandResolver('Antigravity.exe');
  const result = baseDiscovery({ application: 'antigravity_desktop', executable, warnings: executable ? [] : ['Antigravity executable was not resolved'] });
  if (executable) { result.publisher = 'Google'; result.appDataRootMode = 'process_argument'; result.environmentInheritance = 'inherited'; result.executableSha256 = await hashExecutable(executable); }
  return result;
}
