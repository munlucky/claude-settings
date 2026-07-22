import { inspectProfile } from './profile-install.mjs';

export async function doctorKernelProfile({ targetRoot, runtime = null } = {}) {
  const result = await inspectProfile(targetRoot);
  if (result.status === 'not_installed') return { status: 'not_installed', effective: 'unknown', targetRoot: result.targetRoot, recovery: 'install Kernel profile before launch' };
  if (runtime && result.manifest.runtime !== runtime) return { status: 'wrong_harness', effective: 'unknown', targetRoot: result.targetRoot, expectedRuntime: runtime, actualRuntime: result.manifest.runtime };
  if (result.status !== 'ready') return { status: 'drift', effective: 'unknown', targetRoot: result.targetRoot, recovery: 'rollback or reinstall manifest-owned static files', checks: result.checks };
  return { status: 'ready', effective: 'kernel', targetRoot: result.targetRoot, runtime: result.manifest.runtime, managedFileCount: result.manifest.files.length, authContentRead: false, sessionContentRead: false };
}
