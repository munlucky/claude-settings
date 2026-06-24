# Phase 03 Lock Update Decision

Status: no-regeneration-allowed

## Decision

`skills.lock.json` regeneration is not allowed for this phase because the selected adoption branch is `instruction_tier_only`.

No Moonshot-owned Ponytail skill was added, no existing skill source was intentionally changed by this adoption phase, and no lock/schema/audit behavior was changed.

## Lock Regeneration Command

Not run for this phase:

```powershell
node scripts/skills-audit.mjs generate-lock --out skills.lock.json --default-license MIT --default-permissions-json [] --approve-permissions --json
```

## Reason

Running the lock generator would mix this adoption decision with unrelated pre-existing plan-writer worktree changes under `skills/**` and `skills.lock.json`. The phase boundary requires this adoption to leave managed skill supply-chain files untouched.

## Audit Command Run

```powershell
node scripts/skills-audit.mjs audit --lock skills.lock.json --runtime-surface package/runtime-surface.json --json
```

Result: `pass`.
