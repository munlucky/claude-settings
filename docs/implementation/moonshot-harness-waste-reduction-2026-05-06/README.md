# Moonshot Harness Waste Reduction Plan Package

This directory contains the execution-ready planning package for reducing waste found in the 2026-05-06 Moonshot harness run.

## Relationship to Existing Work

- `docs/implementation/harness-reliability-retro-2026-05-05/` is completed prior reliability work. Use it as background only; do not reopen those phase docs for this effort.
- `docs/implementation/harness-native-awtl-rsme-2026-05-06/` is completed AWTL/RSME implementation work. Use its runtime evidence and logs as input only; do not modify its closeout artifacts.
- This package owns the follow-up control-plane hardening work caused by the waste analysis: path authority failures, stale verdict handling, coordinator restart storms, closeout artifact churn, and noisy logs.

## Plan Files

- `00-master-plan-v1.md`
- `01-path-authority-fail-fast-v1.md`
- `02-active-verdict-evidence-contract-v1.md`
- `03-dispatch-lifecycle-retry-suppression-v1.md`
- `04-closeout-artifact-sync-v1.md`
- `05-waste-ledger-log-hygiene-v1.md`
- `06-regression-doc-sync-v1.md`
- `WASTE_REGISTER.md`

## Non-overlap Rule

Workers must treat the two completed implementation directories above as read-only source evidence. Code changes belong under `.claude/scripts/**`, `.claude/skills/**`, `.claude/docs/**`, and `.claude/verification.contract.yaml` as specified by each phase plan.

