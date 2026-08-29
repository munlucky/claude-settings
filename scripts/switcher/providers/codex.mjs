import { resolveCodexDesktop } from '../app-resolver/codex.mjs';
import { buildLaunchSpec } from '../launch-adapter.mjs';

export async function characterizeCodexDesktop(options = {}) {
  const discovery = await resolveCodexDesktop(options);
  return { ...discovery, processSpecificHome: true, appServerChild: { expectedEnv: 'CODEX_HOME', observed: 'not_run' }, sensitiveContentRead: false };
}

export function buildCodexDesktopLaunch({ track, sourceRoot, workspaceRoot = null, roots, executable, extraArgs = [] } = {}) {
  const args = track === 'kernel'
    ? [...extraArgs]
    : (roots?.appDataRoot ? ['--user-data-dir', roots.appDataRoot, ...extraArgs] : [...extraArgs]);
  return buildLaunchSpec({
    surface: 'codex_desktop',
    track,
    sourceRoot,
    workspaceRoot: workspaceRoot || (track === 'kernel' ? sourceRoot : null),
    roots,
    command: executable || 'ChatGPT.exe',
    args,
  });
}

export function verifyCodexChild({ expectedProviderHome, expectedWorkspaceRoot = null, childEnvironment = {}, childExecutable = null, expectedExecutable = null } = {}) {
  const home = childEnvironment.CODEX_HOME;
  const executableMatch = !expectedExecutable || childExecutable === expectedExecutable;
  const workspaceMatch = !expectedWorkspaceRoot || childEnvironment.MOON_RELAY_WORKSPACE_ROOT === expectedWorkspaceRoot || childEnvironment.PWD === expectedWorkspaceRoot;
  let status = 'shared_mutable_surface';
  if (home === expectedProviderHome && executableMatch) {
    status = expectedWorkspaceRoot && !workspaceMatch ? 'effective_track_mismatch' : 'verified';
  }
  return {
    status,
    effectiveHome: home || null,
    executableMatch,
    workspaceMatch: expectedWorkspaceRoot ? workspaceMatch : true,
    sensitiveContentRead: false,
  };
}

export function verifyCodexAppDiscovery({ expectedProviderHome, expectedWorkspaceRoot = null, childEnvironment = {}, discoveredSkills = [] } = {}) {
  const childVerify = verifyCodexChild({ expectedProviderHome, expectedWorkspaceRoot, childEnvironment });
  if (childVerify.status !== 'verified') {
    return childVerify;
  }
  const CONFLICTING_RELAY_WORKFLOW_SKILLS = new Set(['moonshot-orchestrator', 'moonshot-phase-runner', 'moonshot-relay-setup']);
  const hasConflict = discoveredSkills.some((s) => CONFLICTING_RELAY_WORKFLOW_SKILLS.has(s));
  if (hasConflict) {
    return { status: 'conflicting_workflow_surface', discoveredSkills, sensitiveContentRead: false };
  }
  const hasKernelSkill = discoveredSkills.includes('moon-relay-kernel');
  if (!hasKernelSkill) {
    return { status: 'skill_discovery_missing', discoveredSkills, sensitiveContentRead: false };
  }
  return { status: 'verified', effectiveTrack: 'kernel', discoveredSkills, sensitiveContentRead: false };
}
