# Downstream Bootstrap Reference

This directory is a concrete reference package for teams adopting the harness in a real project.

## Goal

Show the minimum document set and example values needed to bootstrap a downstream project without guessing from templates alone.

## Package

Use [`minimum-project/`](/Users/dev/claude-settings/.claude/docs/reference-downstream/minimum-project) as the reference baseline.

Included documents:
- `.claude/PROJECT.md`
- `.claude/verification.contract.yaml`
- `workflow/README.md`
- `TEST_GUIDE.md`
- `docs/design/README.md`
- `docs/glossary/README.md`
- `docs/daily/README.md`
- `docs/analysis/README.md`

## Usage Notes

- Copy the structure, then replace the example values with project-specific facts.
- Keep `.claude/` for reusable rules, skills, scripts, and contracts.
- Prefer git-tracked downstream docs outside `.claude/` for workflow, design, glossary, daily logs, testing, and analysis.
- Keep the planning boundary explicit: planning may be approved by a human, but execution loops should not depend on repeated checkpoints.

## Non-Goals

- This is not a full starter application.
- This package does not replace framework-specific docs.
- This package demonstrates minimum harness documents, not complete product specifications.
