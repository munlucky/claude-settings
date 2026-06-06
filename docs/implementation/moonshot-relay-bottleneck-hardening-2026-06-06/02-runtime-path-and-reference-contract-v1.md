# 02 Runtime Path And Reference Contract v1

## Goal

Prevent `.claude/.codex` profile paths from being treated as durable canonical source.

## Owned Paths

- `rules/workflow-bundles.yaml`
- `skills/moonshot-decide-sequence/SKILL.md`
- `skills/moonshot-decide-sequence/SKILL.ko.md`
- `skills/browser-verifier/SKILL.md`
- `skills/browser-verifier/SKILL.ko.md`
- `skills/moonshot-*/references/*.md`
- `tests/package-layout.test.mjs`

## Work

- Establish `rules/workflow-bundles.yaml` as the source workflow bundle registry.
- Point installed runtime reads at `<MOONSHOT_RELAY_HOME>/rules/workflow-bundles.yaml`.
- Describe `agents/verification/verify-runtime.sh` as canonical source and `.claude/agents/verification/verify-runtime.sh` as installed/local profile entrypoint.
- Add missing `moonshot-*` source-local reference files.

## Acceptance

- Active path-contract tests reject `.claude/config` canonical references.
- Browser verifier docs distinguish canonical source from installed entrypoint.
- All `moonshot-*` `deepReferences` resolve.
