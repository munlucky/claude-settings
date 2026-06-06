# Review And Verification

Non-trivial code, harness, or contract changes need fresh review and verification evidence before completion.

## Review Boundary

- Use review to find regressions, missing tests, and contract drift.
- Do not use review as a substitute for deterministic verifier evidence.
- Keep re-review bounded to blocker confirmation after accepted fixes.

## Failure Taxonomy

Classify failures as implementation, verification environment, operator command error, or carried-forward repository hygiene. Only implementation-owned failures block the current bounded slice.
