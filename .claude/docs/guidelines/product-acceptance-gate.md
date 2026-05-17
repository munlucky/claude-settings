# Product Acceptance Gate

Use this gate before a phase or plan directory claims `clean_finish`.

## Purpose

Build, lint, and document conformance are necessary but not sufficient for user-facing work. A phase may only close when its critical product scenarios have fresh evidence that the intended behavior works in the generated runtime or artifact.

## Required Scenario Evidence

Every user-visible requirement in a phase plan must map to at least one `SCN-*` row in `## Critical Product Scenarios`.

Each scenario must declare:
- user-visible expectation
- verification command
- expected signal
- evidence path

Completion artifacts must record each critical scenario as `pass`, `passed`, `done`, or `verified`. Static review alone is not enough for rendered UI, generated content, static export output, or publishing workflows when executable evidence is available.

## Completion Rules

- `clean_finish` is blocked while any critical `SCN-*` lacks passing evidence.
- Alternative implementation, deferred scope, or workaround language is blocked unless `Spec Deviation Ledger` records explicit user approval.
- External account tasks such as production domains, Cloudflare project access, Search Console, AdSense approval, or other credentials are launch blockers, not local implementation blockers, when they are documented as external/account-gated.
- Master checklist state, `phase-status.yaml`, archived phase paths, execution artifacts, verifier verdicts, and scorecards must agree before a plan directory is treated as complete.

## Evidence Quality

Good evidence proves behavior:
- rendered DOM contains the expected component or content
- generated static output contains the expected route or asset
- search/feed/sitemap output includes and excludes the expected records
- guarded integrations are absent or present under the documented environment conditions

Weak evidence does not close a scenario by itself:
- file exists
- command exits 0 without checking the intended behavior
- prose says the behavior should work
- TODO, pending, deferred, or workaround notes without approved deviation
