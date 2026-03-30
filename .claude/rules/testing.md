# Testing Guidelines

Detect test environment before writing or running tests.
- Classify changes as `docs_only`, `local_policy`, or `behavior_change`.
- Run the smallest relevant test scope first, then expand if needed.
- `behavior_change` work should start from a failing test or deterministic proof when practical.
- Bug fixes should include a regression test or equivalent verifier evidence.
- Do not delete existing tests without an explicit reason.
- `docs_only` and most `local_policy` work may finish with audit plus syntax/evidence checks.
- `behavior_change` work must report missing executable verification and stay conservative.
- For this repository, prioritize knowledge audit and `bash -n` for changed shell scripts.
- `implementation-runner` should flag behavior-changing work with no test or verifier plan.
- `completion-verifier` stays conservative when executable verification is missing.
