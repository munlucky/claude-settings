# Spec Delta

## Current Evidence

The current project architecture is evidenced by root source contracts, public docs, package contracts, runtime-state scripts, verification-plane scripts, workflow bundle routing, and active tests.

## Proposed Delta

| Delta ID | Requirement IDs | Existing Spec | Proposed Spec | Compatibility |
|---|---|---|---|---|
| DELTA-101 | REQ-101 | Source boundaries are distributed across `AGENTS.md`, README, and repository layout docs. | Treat root source directories as canonical and root `.claude`/`.codex` as generated/local runtime profiles in architecture handoffs. | backward compatible |
| DELTA-102 | REQ-102 | Runtime surface is defined by package contract and allowlist. | Treat `package/runtime-surface.json` as the single public profile discovery authority. | backward compatible |
| DELTA-103 | REQ-103 | Runtime-state documents DB-backed completion authority. | Treat projections and reports as read models/evidence, never as completion authority. | backward compatible |
| DELTA-104 | REQ-104 | Verification contract defines profile planes and completion planes. | Require structured verification-plane evidence before accepted completion claims. | backward compatible |
| DELTA-105 | REQ-105 | Workflow bundles and public entrypoints are documented. | Keep public workflow entrypoints small and route internal stages through bundle expansion. | backward compatible |
| DELTA-106 | REQ-106 | Knowledge plane lifecycle is documented. | Treat unconfigured or memory-derived facts as advisory until verified and promoted. | backward compatible |
| DELTA-107 | REQ-107 | Moonshot architecture skill and validators exist. | Use this package as current brownfield architecture evidence for follow-on planning. | backward compatible |

## Migration Notes

No runtime migration. Rollback is deleting or superseding this documentation package.
