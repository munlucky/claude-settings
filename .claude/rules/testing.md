# Testing Guidelines

## Runtime Rule

Detect test environment before writing or running tests.

## When Environment Exists

- Run the smallest relevant test scope first, then expand if needed.
- Bug fixes should include a regression test when practical.
- Do not delete existing tests without an explicit reason.

## When Environment Does Not Exist

- Do not block implementation.
- Run self-audit/manual verification and report why tests were skipped.
- For this repository, prioritize:
  - `.claude/scripts/knowledge-repo-audit.sh`
  - `bash -n` checks for changed shell scripts

## Workflow Integration

- `implementation-runner`: writes tests only when environment exists.
- `completion-verifier`: runs tests when available; otherwise performs self-audit.
