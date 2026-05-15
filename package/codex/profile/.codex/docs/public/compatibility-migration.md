# Compatibility Migration

This migration separates source ownership from runtime compatibility.

## Source Of Truth

Canonical source belongs in root-level directories:

- `skills/`
- `agents/`
- `rules/`
- `scripts/`
- `bin/`
- `tools/`
- `schemas/`
- `templates/`
- `tests/`
- `docs/public/`

The `.claude/` tree in this repository is a development profile and compatibility surface. It may contain active runtime contracts, wrappers, and generated profile material, but it is not the durable source of truth for reusable workflow assets.

## Runtime Wrapper Summary

Compatibility wrappers keep legacy `.claude/scripts/...` and `.claude/agents/verification/verify-changes.sh` entrypoints available for existing users. Wrappers may call the installed runtime implementation when the executable source has not yet moved to a root-level canonical script.

Wrapper changes must document one of these targets:

- a canonical root script under `scripts/`
- an installed runtime path under `.claude/...`
- a generated package profile path declared by `package/package-contract.yaml`

## Deprecation Window

The compatibility window remains open until a later major version announces replacement commands and removes the legacy entrypoints. Until then:

- downstream installs still write `.claude/` payloads
- installed docs may mention `.claude/...` when they describe runtime paths
- repository docs must not tell contributors to edit `.claude/skills` or other generated profile trees as canonical source
- package payloads must exclude generated runtime state

## Migration Audit Classes

Allowed `.claude/` references are limited to active profile contracts, installed payload paths, compatibility wrappers, generated-state cleanup, and phase execution artifacts. Any durable-source instruction pointing at `.claude/skills`, `.claude/agents`, `.claude/scripts`, `.claude/bin`, `.claude/tools`, `.claude/schemas`, or `.claude/templates` must be replaced by a canonical root path or an explicit wrapper note.

## Residual Risks

Some skills and downstream docs may still mention `.claude/...` because installed projects continue to use that runtime shape. Treat those references as compatibility behavior, not repository source ownership. Re-audit before the later major version that removes compatibility wrappers.
