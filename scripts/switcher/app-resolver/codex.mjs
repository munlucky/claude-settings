import path from 'node:path';
import { resolveCommand, resolveExecutable, hashExecutable, baseDiscovery } from './common.mjs';

function packagedMetadata(executable) {
  const marker = `${path.sep}WindowsApps${path.sep}`.toLowerCase();
  const normalized = String(executable || '').replaceAll('/', path.sep);
  const index = normalized.toLowerCase().indexOf(marker);
  if (index < 0) return {};
  const packageDirectory = normalized.slice(index + marker.length).split(path.sep)[0];
  const [packageNamePart, publisherId] = packageDirectory.split('__');
  const packageName = packageNamePart?.replace(/_\d+(?:\.\d+)*_[^_]+$/, '') || null;
  return packageName && publisherId ? {
    packageFamily: `${packageName}_${publisherId}`,
    aumid: `${packageName}_${publisherId}!App`,
    launchKind: 'packaged_shell_activation',
    environmentInheritance: 'shell_broker_unknown',
  } : {};
}

export async function resolveCodexDesktop({ candidates = [], commandResolver = resolveCommand } = {}) {
  const defaults = [
    ...candidates,
    process.env.CODEX_DESKTOP_EXECUTABLE,
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'OpenAI', 'Codex', 'ChatGPT.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'WindowsApps', 'OpenAI.Codex', 'app', 'ChatGPT.exe'),
  ];
  const executable = await resolveExecutable(defaults) || await commandResolver('ChatGPT.exe');
  const result = baseDiscovery({ application: 'codex_desktop', executable, warnings: executable ? [] : ['current packaged app executable was not resolved without version pinning'] });
  if (executable) {
    Object.assign(result, packagedMetadata(executable));
    result.publisher = 'OpenAI'; result.appDataRootMode = 'process_argument';
    result.environmentInheritance ||= 'inherited'; result.appServerEffectiveHomeProbe = 'not_run'; result.executableSha256 = await hashExecutable(executable);
  }
  return result;
}
