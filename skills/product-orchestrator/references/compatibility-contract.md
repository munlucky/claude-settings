# Compatibility Contract Reference

Machine-readable compatibility anchors. Load only for compatibility audit.

## Default Paths

- `{tasksRoot}/{feature-name}/product/`
- `ADR/*.md`
- `tasks/*.md`
- `execution/REQUIREMENTS_TRACEABILITY.md`
- `execution/SCENARIO_MATRIX.md`
- `execution/UAT_CHECKLIST.md`
- `docs/public/guidelines/research-evidence-policy.md`
- `docs/public/guidelines/skill-readiness-policy.md`
- `docs/public/guidelines/memorygraph-workflow.md`
- `.moonshot-relay/docs/ko/`
- `/moonshot-orchestrator`
- `docs/public/guidelines/product-definition-workflow.md`
- `docs/public/guidelines/demo-first-mvp-gate.md`
- `docs/public/guidelines/retrieval-and-recency-policy.md`
- `templates/product-definition/DISCOVERY_MAP.template.md`

## Hard Stops

- `execution/REQUIREMENTS_TRACEABILITY.md` when document-trace completion is required
- treat Discovery Map frontier output as advisory planning evidence only; it does not authorize execution, worker fanout, completion, or live adoption
- classify unresolved input as fact, decision, assumption, or blocker; do not self-resolve decisions that affect scope, security, data, package/runtime surface, or user-visible behavior
- gather available read-only context before asking the user unless a critical ambiguity would change scope, security, data shape, or user-visible behavior
- do not use `.moonshot-relay/docs/ko/` as a MemoryGraph source
- stop only for true blockers
- Do not introduce architecture
- Do not discuss stack, classes, or modules
- Demo-first plans must order each in-scope slice as `demo_ready_ui -> mock_functional_demo -> demo_evidence_capture -> user_demo_approval -> real_functional -> real_functional_verification -> production_hardening`.
- After execution begins, implementation -> review -> verify -> retry loops should continue without additional human checkpoints unless a true blocker or external dependency appears.
- Exception: `demo_first` MVP work must hard-stop after Mock Functional Demo evidence until `USER_DEMO_APPROVAL.md` is approved with non-empty approved scope.
