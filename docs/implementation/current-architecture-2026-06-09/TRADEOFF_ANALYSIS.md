# Tradeoff Analysis

| Driver ID | Driver | Weight | Source |
|---|---|---|---|
| DRV-101 | Preserve source/profile/runtime-state boundaries. | high | ASR-101 |
| DRV-102 | Keep profile-local public discovery small while preserving internal support skills in common payload. | high | ASR-102, ASR-105 |
| DRV-103 | Prevent false completion by keeping runtime-state and verification-plane authority explicit. | high | ASR-103, ASR-104 |
| DRV-104 | Keep knowledge useful but non-authoritative until verified. | medium | ASR-106 |
| DRV-105 | Make architecture handoff consumable by planning and execution tools. | medium | ASR-107 |

## Options

| Option ID | Summary | Benefits | Costs | Decision |
|---|---|---|---|---|
| OPT-101 | Preserve the current source-first, account-root runtime architecture and document it as a brownfield recovery package. | Lowest behavioral risk; matches current tests and docs; supports direct handoff. | Does not simplify runtime control-plane complexity. | accepted |
| OPT-102 | Collapse runtime profiles and common payload into one profile-local install. | Simpler mental model for one runtime. | Breaks Claude/Codex parity, increases profile drift, risks user state. | rejected |
| OPT-103 | Treat docs/status projections as completion authority for simpler closeout. | Easier manual reporting. | Reintroduces false completion risk and conflicts with runtime-state contract. | rejected |
| OPT-104 | Expose all canonical skills in profile-local discovery. | Easier direct access to internals. | Bloats prompt surface and bypasses orchestrator boundaries. | rejected |

## Recommendation

Selected option: OPT-101.

The current architecture is coherent if its boundaries stay explicit: root source is canonical, package/install materializes runtime payloads, runtime-state owns workflow authority, verification-plane owns fresh evidence, and profile-local discovery remains allowlisted.
