import path from 'node:path';
import os from 'node:os';
import { resolveCommand, resolveExecutable, resolveLatestWindowsAppsExecutable, resolveMacOsAppExecutable, hashExecutable, baseDiscovery } from './common.mjs';

function packagedMetadata(executable) {
  const marker = `${path.sep}WindowsApps${path.sep}`.toLowerCase();
  const normalized = String(executable || '').replaceAll('/', path.sep);
  const index = normalized.toLowerCase().indexOf(marker);
  if (index < 0) {
    const macMarker = `${path.sep}Contents${path.sep}MacOS${path.sep}`.toLowerCase();
    if (normalized.toLowerCase().includes(macMarker) && normalized.toLowerCase().includes('.app')) return { launchKind: 'macos_app_bundle', environmentInheritance: 'inherited' };
    return {};
  }
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

export async function resolveCodexDesktop({ candidates = [], commandResolver = resolveCommand, windowsAppsResolver = resolveLatestWindowsAppsExecutable, windowsAppsRoot = path.join(process.env.ProgramFiles || 'C:\\Program Files', 'WindowsApps'), macOsResolver = resolveMacOsAppExecutable, macOsAppRoots = [path.join('/', 'Applications'), path.join(os.homedir(), 'Applications')], platform = process.platform } = {}) {
  const stableDefaults = [
    process.env.CODEX_DESKTOP_EXECUTABLE,
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'OpenAI', 'Codex', 'ChatGPT.exe'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'WindowsApps', 'OpenAI.Codex', 'app', 'ChatGPT.exe'),
  ];
  const executable = await resolveExecutable(candidates)
    || (platform === 'win32' && await windowsAppsResolver({ root: windowsAppsRoot, packagePrefix: 'OpenAI.Codex_', executableRelativePath: path.join('app', 'ChatGPT.exe'), platform }))
    || (platform === 'darwin' && await macOsResolver({ roots: macOsAppRoots, appNames: ['Codex.app', 'ChatGPT.app'], executableNames: ['Codex', 'ChatGPT'], platform }))
    || await resolveExecutable(stableDefaults)
    || await commandResolver('ChatGPT.exe');
  const result = baseDiscovery({ application: 'codex_desktop', executable, warnings: executable ? [] : ['Codex Desktop executable was not resolved'] });
  if (executable) {
    Object.assign(result, packagedMetadata(executable));
    result.publisher = 'OpenAI'; result.appDataRootMode = 'process_argument';
    result.environmentInheritance ||= 'inherited'; result.appServerEffectiveHomeProbe = 'not_run'; result.executableSha256 = await hashExecutable(executable);
  }
  return result;
}
