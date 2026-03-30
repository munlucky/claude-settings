# Solution Asset: Contract Remediation Pattern

Last-Reviewed: 2026-03-30

## Metadata

- Problem Type: verification contract drift
- Severity: medium
- Source Artifacts: `QA_REPORT.md`, `HANDOFF.md`, `verification-result.json`
- Reusable Paths: `.claude/verification.contract.yaml`, `.claude/docs/guidelines/verification-contract.md`

## Symptom

Verification passes are inconsistent because the planned work and the required checks are not aligned.

## Root Cause

The execution slice began before round-level done criteria and verification commands were explicit.

## Fix Pattern

1. update `SPRINT_CONTRACT.md` with the round goal and required checks
2. align `QA_REPORT.md` failure categories with the contract
3. rerun the missing required checks with fresh evidence

## Verification Recipe

- confirm required checks are named in the contract
- confirm the active slice has fresh verification evidence
- confirm remediation input is captured in `QA_REPORT.md`

## Anti-Pattern

Do not treat a green local command as sufficient if the contract still has missing required checks.

## When To Reuse

Reuse when verification drift appears between plan artifacts and actual closeout evidence.
