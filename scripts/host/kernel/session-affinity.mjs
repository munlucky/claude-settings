// Session affinity (Wave 4.6 / Wave 7). Analysis → implementation → test → fix
// on one work unit should stay in one session so the provider keeps its warm
// prefix. Anything that changes what the model *is* — role, model, effort,
// speed mode — or what it was told before the volatile tail starts a new
// lineage instead, because reusing a session across those boundaries reuses
// context that no longer applies.

import { createHash } from 'node:crypto';
import { canonicalJson } from '../../kernel/canonical-digest.mjs';

export const SESSION_KEY_FIELDS = Object.freeze([
  'provider', 'surface', 'resolvedModel', 'resolvedEffort', 'speedMode', 'role',
  'toolSchemaDigest', 'commonHostStableDigest', 'providerStableDigest',
  'projectStableDigest', 'runStableDigest',
]);

// One reset reason per SESSION_KEY_FIELDS entry. A field present in the key
// but missing here would change the key silently while `resolveSessionLineage`
// kept reporting `continued: true` for it — the shape of bug this map guards
// against, so the two are asserted to cover each other below rather than
// trusted to stay in sync by hand.
const FIELD_RESET_REASON = Object.freeze({
  provider: 'provider-changed',
  surface: 'surface-changed',
  role: 'role-changed',
  resolvedModel: 'model-changed',
  resolvedEffort: 'effort-changed',
  speedMode: 'speed-mode-changed',
  toolSchemaDigest: 'tool-schema-changed',
  commonHostStableDigest: 'common-host-stable-changed',
  providerStableDigest: 'provider-stable-changed',
  projectStableDigest: 'project-stable-changed',
  runStableDigest: 'run-stable-changed',
});

for (const field of SESSION_KEY_FIELDS) {
  if (!Object.hasOwn(FIELD_RESET_REASON, field)) {
    throw new Error(`session-affinity: SESSION_KEY_FIELDS entry "${field}" has no FIELD_RESET_REASON`);
  }
}

export const LINEAGE_RESET_REASONS = Object.freeze([
  ...Object.values(FIELD_RESET_REASON),
  'independent-context-required', 'reviewer-turn', 'explicit-reset',
].sort());

const pick = (identity = {}) => Object.fromEntries(SESSION_KEY_FIELDS.map((field) => [field, identity[field] ?? null]));

export const buildSessionAffinityKey = (identity = {}) =>
  `session-${createHash('sha256').update(canonicalJson(pick(identity))).digest('hex').slice(0, 32)}`;

// Returns every reason the lineage must restart, not just the first: a receipt
// that says only "model-changed" when the run contract also moved would make a
// later cache-miss analysis point at the wrong cause.
export const resolveSessionLineage = ({
  previous = null,
  current = {},
  independentContextRequired = false,
  role = null,
  explicitReset = false,
} = {}) => {
  const key = buildSessionAffinityKey(current);
  const reasons = [];
  if (previous) {
    for (const [field, reason] of Object.entries(FIELD_RESET_REASON)) {
      if ((previous[field] ?? null) !== (current[field] ?? null)) reasons.push(reason);
    }
  }
  if (independentContextRequired) reasons.push('independent-context-required');
  if ((role || current.role) === 'reviewer') reasons.push('reviewer-turn');
  if (explicitReset) reasons.push('explicit-reset');
  const unique = [...new Set(reasons)].sort();
  const continued = Boolean(previous) && unique.length === 0;
  return Object.freeze({
    schemaVersion: 1,
    sessionAffinityKey: key,
    sessionLineageId: continued ? previous.sessionLineageId || key : key,
    continued,
    resetReasons: Object.freeze(unique),
  });
};
