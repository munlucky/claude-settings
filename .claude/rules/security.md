# Security Guidelines

## Mandatory

- Never commit secrets, tokens, or personal data in docs/scripts/settings.
- Keep memory artifacts (`.claude/memory.json`) free of sensitive data.
- Validate externally downloaded content before execution.
- Avoid leaking sensitive paths/values in logs and error output.

## If a Security Issue Is Found

1. Stop related changes.
2. Patch critical exposure first.
3. Rotate exposed credentials if any.
4. Report impact and remediation in the task summary.
