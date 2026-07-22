import path from 'node:path';
import { resolveCommand, resolveExecutable, hashExecutable, baseDiscovery } from './common.mjs';
export async function resolveCodexDesktop({ candidates = [], commandResolver = resolveCommand } = {}) {
  const defaults = [
    ...candidates,
    process.env.CODEX_DESKTOP_EXECUTABLE,
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'OpenAI', 'Codex', 'ChatGPT.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'WindowsApps', 'OpenAI.Codex', 'app', 'ChatGPT.exe'),
  ];
  const executable = await resolveExecutable(defaults) || await commandResolver('ChatGPT.exe');
  const result = baseDiscovery({ application: 'codex_desktop', executable, warnings: executable ? [] : ['current packaged app executable was not resolved without version pinning'] });
  if (executable) { result.publisher = 'OpenAI'; result.appDataRootMode = 'process_argument'; result.environmentInheritance = 'inherited'; result.appServerEffectiveHomeProbe = 'not_run'; result.executableSha256 = await hashExecutable(executable); }
  return result;
}
