# Minimal Correct Implementation

Canonical source guideline for applying minimal implementation pressure without weakening Moonshot Relay evidence, safety, or runtime authority.

Use this guideline when a harness change, skill change, or plan phase risks adding a new abstraction, public surface, dependency, or runtime behavior before the current code proves it is needed.

## Ladder

Apply the ladder only after reading the affected code and tracing the real flow.

1. Do not build it if the requirement is speculative.
2. Reuse an existing Moonshot Relay helper, script, schema, template, guideline, or skill before adding a new one.
3. Prefer Node, PowerShell, shell, browser, database, or platform behavior already present in the repository before adding dependencies.
4. Prefer an already installed dependency over a new dependency.
5. Prefer the smallest source change that preserves the existing authority and evidence model.
6. Add a new public skill, runtime surface entry, hook, package path, or installer behavior only when a lower rung cannot satisfy the current task.

## Non-Negotiables

Minimal code must not remove or soften:

- runtime-state completion authority
- phase closeout evidence
- verification commands and fresh evidence
- input validation at trust boundaries
- security checks
- accessibility basics
- data-loss-preventing error handling
- explicit user requirements
- rollback evidence for live or package adoption

## Review Use

Minimality findings are complexity-only findings. They can recommend deletion, reuse, or a narrower path, but they do not replace correctness, security, architecture, package, or operational adoption review.

When a minimality review recommends skipping work, it must name the lower-rung alternative and the evidence that makes the skipped work unnecessary.

## Source Note

This guideline is a Moonshot-specific rewrite informed by Ponytail source pinned in `docs/implementation/ponytail-harness-adoption-2026-06-24/source-intake/source-pin.json`. Ponytail remains an external reference; this file is the local policy surface.
