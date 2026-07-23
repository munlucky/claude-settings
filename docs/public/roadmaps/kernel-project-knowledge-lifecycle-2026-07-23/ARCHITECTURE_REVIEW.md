# Kernel Project Knowledge Lifecycle Architecture Review

## Review Decision

`conditional_pass`

The architecture is suitable for implementation after Phase 01 preflight confirms current Kernel DB migration conventions, package surface ownership, and project identity compatibility. No design-level blocker remains.

## Reviewed Scope

- project identity and Kernel-only namespace
- typed project knowledge records
- stage-scoped context retrieval
- architecture/ontology/tacit knowledge resolution
- post-work candidate review
- accepted-completion-gated knowledge commit
- supersession/revision/provenance
- `commit-moonshot` Kernel Git closeout integration
- package/profile/account-root adoption

## Perspective 1 — State Authority and Architecture

### Findings

1. **Accepted:** Runtime completion authority remains in Kernel SQLite. Knowledge and Git receipts are evidence/lineage only.
2. **Accepted:** JSONL portable records plus SQLite run/receipt index provide a reasonable authority split.
3. **Accepted:** Knowledge writes occur after accepted completion, avoiding circular authority where memory determines its own correctness.
4. **Accepted change:** Concurrent revision conflicts must re-review candidates rather than last-write-wins.
5. **Accepted change:** Context receipt must bind `projectId`, knowledge revision, source identity, stage, digest, and omission metadata.

### Remaining checks

- Confirm additive migration style against current `scripts/kernel/state-store.mjs` fixtures.
- Ensure state projection reads an atomic bundle and never reconstructs authority from loose files.

## Perspective 2 — Security, Prompt Safety, Data Integrity

### Findings

1. **Accepted:** Raw graph/ontology/log/transcript/tool bodies and secret-like values are excluded from prompt-facing context.
2. **Accepted:** External/tool/transcript-only candidates remain quarantined until trusted re-authoring and verification.
3. **Accepted:** Cross-project supersession is denied by default.
4. **Accepted change:** Account-root knowledge and runtime state are hard staging denylist entries even when broad Git closeout is requested.
5. **Accepted change:** Purging project knowledge during uninstall requires separate explicit approval and receipt.

### Remaining checks

- Add path traversal/symlink/junction escape fixtures for project knowledge root and staging selection.
- Add malicious JSONL and oversized-record prompt purity tests.

## Perspective 3 — Operations and Git Closeout

### Findings

1. **Accepted:** Git closeout is explicit and follows knowledge closeout.
2. **Accepted:** `git add -A` is not the default; reviewed path allowlist is required.
3. **Accepted:** Push success requires remote parity, not only process exit code.
4. **Accepted change:** Commit failure and push failure must not roll back accepted completion or verified project knowledge.
5. **Accepted change:** Retry must detect an existing commit/receipt and avoid duplicate commits.

### Remaining checks

- Confirm branch protection/detached HEAD behavior in disposable repositories.
- Define closeout behavior when upstream remote is absent or branch has no tracking ref.

## Tradeoff Assessment

| Decision | Benefit | Cost | Review outcome |
|---|---|---|---|
| Separate Kernel knowledge namespace | isolation and rollback safety | duplicate knowledge across tracks | accept |
| Completion-gated writes | prevents false memory promotion | later availability of lessons | accept |
| Typed JSONL + SQLite receipts | portability plus authority lineage | dual-store coordination | accept with atomic transaction design |
| Stage/path scoped retrieval | lower context contamination | ranking complexity | accept |
| Explicit Git closeout | user-intent safety | extra request metadata | accept |
| Preserve knowledge on uninstall | protects user state | orphaned state possible | accept with purge command later |

## Required Pre-implementation Actions

- Verify exact Kernel package include/exclude ownership for new modules.
- Add schema names to the Kernel package manifest and lock design before implementation.
- Confirm whether `runs` additive columns or normalized link tables are preferable after inspecting migration fixtures; preserve the plan's external contract either way.
- Build RED tests for no-approval Git closeout and pre-completion knowledge write before implementing the green path.

## Final Review Statement

The plan preserves the core Kernel principle that fresh runtime evidence controls completion while adding a separate, evidence-bound project knowledge lifecycle. The `commit-moonshot` integration is correctly positioned as optional delivery closeout rather than completion or memory authority. Implementation may proceed phase-by-phase after Phase 01 preflight.