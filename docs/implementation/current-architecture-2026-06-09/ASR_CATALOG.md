# Architecturally Significant Requirement Catalog

| ASR ID | Requirement IDs | Quality Attribute | Architectural Impact | Verification Signal |
|---|---|---|---|---|
| ASR-101 | REQ-101 | modifiability | Source ownership must remain unambiguous so contributors edit root source first and regenerate runtime profiles through materialization. | package/layout/materialization contracts pass |
| ASR-102 | REQ-102 | compatibility | Account-root install must preserve user runtime files while pruning previously managed profile skills absent from the current allowlist. | package and runtime-surface contract tests pass |
| ASR-103 | REQ-103 | correctness | Completion, blocker, and resume decisions must be DB-backed and must not be inferred from projection files or narrative reports. | runtime-control-plane and completion-authority contract tests pass |
| ASR-104 | REQ-104 | auditability | Completion evidence must carry plane status, freshness, identity, and security assessment data. | verification-plane contract tests pass |
| ASR-105 | REQ-105 | operability | Routing must separate read-only, product-project, and meta-harness workflows without exposing every internal skill as a public entrypoint. | workflow-e2e and runtime-surface tests pass |
| ASR-106 | REQ-106 | safety | Knowledge and memory promotion must be evidence-gated and rollback-aware, not transcript-only. | memory-promotion contract tests pass |
| ASR-107 | REQ-107 | traceability | Architecture handoff must link requirements to ASRs, ADRs, tasks, owners, and verification signals. | architecture artifact validation passes |

| ASR ID | Scenario IDs |
|---|---|
| ASR-101 | QAS-101 |
| ASR-102 | QAS-102 |
| ASR-103 | QAS-103 |
| ASR-104 | QAS-104 |
| ASR-105 | QAS-105 |
| ASR-106 | QAS-106 |
| ASR-107 | QAS-107 |

## Quality Attribute Scenarios

| Scenario ID | Stimulus | Environment | Response | Measure |
|---|---|---|---|---|
| QAS-101 | A contributor changes a skill or script. | Source checkout. | The durable edit lands in the canonical root directory, not in profile-local output. | Package/layout tests pass. |
| QAS-102 | Account-root install runs on a live machine. | Existing Claude/Codex homes contain sessions and auth. | Installer writes managed payload and preserves protected runtime entries. | Dry-run/live smoke evidence shows protected entries preserved. |
| QAS-103 | A phase closeout report claims done. | Runtime-state contains missing planes or blockers. | Completion authority rejects or needs more evidence. | `assess-completion` is not accepted. |
| QAS-104 | A task records verification evidence. | Verification planes have mixed pass/fail or stale results. | Completion remains blocked until required planes are fresh and passed. | Verification-plane summary exposes missing or failed planes. |
| QAS-105 | A user invokes a workflow skill. | Public profile discovery is allowlist-only. | Only public entrypoints/utilities appear profile-local; internal skills remain in common payload. | Runtime-surface tests pass. |
| QAS-106 | A session yields useful memory. | Knowledge records are unconfigured or unverified. | The fact remains advisory until verification/promotion evidence exists. | Memory promotion ledger rejects unsafe promotion. |
| QAS-107 | Architecture work precedes implementation. | Brownfield repo evidence exists. | Package records current evidence, options, ADR, traceability, owners, and verification. | Architecture validator passes. |
