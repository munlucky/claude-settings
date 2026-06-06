# Phase 05 - Public Guideline Depth Policy v1

## Goal

Document `docs/public/guidelines/**` as intentionally compact public policy anchors unless an individual file is classified as an operational procedure, and record that classification in durable public docs.

## Owned Paths

- `docs/public/guidelines/**`
- `docs/public/reference/**`
- `docs/public/repository-layout.md`
- `tests/active-contracts.test.mjs` only if a public guideline quality guard is added

## Read-Only Paths

- `.claude/docs/guidelines/**` generated/profile copies
- downstream project profile docs

## Required Changes

1. Inventory guideline files and classify each as `policy-anchor`, `operational-procedure`, or `reference-index`.
2. Record the classification table in `docs/public/repository-layout.md`; do not create a new `docs/public/guidelines/README.md` for this package unless repository-layout becomes too large.
3. If files are intentionally short anchors, add a public doc note explaining that authoritative operational details live in durable source such as `docs/public/reference/**`, `package/package-contract.yaml`, `skills/**`, `agents/**`, or `scripts/**`. Phase plans may record execution decisions and evidence, but are not the durable operational source of truth.
4. If a file is classified as `operational-procedure`, expand it enough to include trigger, canonical path, verification evidence, and forbidden/generated-state boundaries.
5. Keep the existing line-count guard only as a placeholder detector. Add semantic required-field checks only for docs classified as `operational-procedure`.

## Acceptance Criteria

- The plan records a deliberate decision instead of treating short docs as accidental drift.
- Classification is recorded in `docs/public/repository-layout.md`.
- Public guideline docs do not point back to `.claude/docs/guidelines` as canonical.
- Any new quality guard checks semantic fields, not document length.
- `.ko.md` pairs are recorded in the same classification row as their English counterpart unless the Korean file intentionally diverges in role.
- `tests/active-contracts.test.mjs` may contain `.claude/docs/guidelines` only as a forbidden-pattern assertion; human-facing docs and package metadata must not.

## Verification Commands

```powershell
rg -n "\\.claude/docs/guidelines" docs/public README.md AGENTS.md package skills agents
rg -n "docs/public/guidelines" docs/public README.md AGENTS.md package skills agents tests
node --test --test-name-pattern "public guidelines are resolved from docs/public and classified" tests/active-contracts.test.mjs
```

## Non-Goals

- Do not expand all guideline docs merely for length.
- Do not move runtime profile docs back under `.claude/docs/guidelines`.
