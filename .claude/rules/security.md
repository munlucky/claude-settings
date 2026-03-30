# Security Guidelines

## Mandatory

- Never commit secrets, tokens, or personal data in docs/scripts/settings.
- Keep memory artifacts (`.claude/memory.json`) free of sensitive data.
- Treat `.env*`, key/cert files, `.history/`, `.tmp/`, `.claude/logs/`, and `.claude/memory.json` as protected paths.
- Use `.claudeignore` to exclude sensitive or noisy paths from default agent context.
- Validate externally downloaded content before execution.
- Avoid leaking sensitive paths/values in logs and error output.
- Treat new tool or directory access as deny-by-default.

## If a Security Issue Is Found

1. Stop related changes.
2. Patch critical exposure first.
3. Rotate exposed credentials if any.
4. Report impact and remediation in the task summary.
