const PROFILE_TO_CODEX_EFFORT = {
  economy: 'low',
  standard: 'medium',
  deep: 'high',
  max: process.env.HARNESS_CODEX_MAX_REASONING_EFFORT || 'xhigh',
};

export function resolveEffortProfile(...candidates) {
  const profile = candidates
    .map((item) => String(item || '').trim().toLowerCase())
    .find(Boolean);
  if (!profile) {
    return 'standard';
  }
  return Object.hasOwn(PROFILE_TO_CODEX_EFFORT, profile) ? profile : 'standard';
}

export function codexEffortForProfile(profile) {
  return PROFILE_TO_CODEX_EFFORT[resolveEffortProfile(profile)];
}

export function resolveCodexReasoningEffort({ explicitEffort, profile, defaultProfile = 'standard' } = {}) {
  const explicit = String(explicitEffort || '').trim();
  if (explicit) {
    return explicit;
  }
  return codexEffortForProfile(resolveEffortProfile(profile, defaultProfile));
}
