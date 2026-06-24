```yaml
reviewer: independent_reviewer_A
mode: review_only
package: docs/implementation/ponytail-harness-adoption-2026-06-24

files:
  00-master-plan-v1.md:
    blockers:
      - category: cross_doc_inconsistency
        evidence: "Phase 05 is listed as depending on Phase 04 unconditionally, while Phase 05 says Phase 04 is required only if managed adoption was selected."
        suggested_edit: "Choose one execution contract: either make Phase 04 an always-required no-op/skip gate, or model Phase 05 dependency on Phase 04 as conditional in both master and phase metadata."
      - category: weak_source_metadata
        evidence: "External Source Snapshot records upstream version/license roles before Phase 01 pin evidence exists."
        suggested_edit: "Add observedAt, observedRef, observedCommit, licenseEvidencePath, and status fields; mark version/license as unverified_until_phase_01 unless already pinned."
      - category: path_boundary_gap
        evidence: "Phase boundary summary says Phase 04 writes package/runtime-surface source and tests, but Phase 04 also owns installer and doctor scripts."
        suggested_edit: "Update the master Phase 04 boundary to include installer/doctor write authority conditionally, or narrow Phase 04 owned paths to match the master summary."

  01-source-intake-and-policy-mapping-v1.md:
    blockers:
      - category: staged_path_gap
        evidence: "Owned Paths allow a future source-pin manifest path selected by the phase, but the path is not fixed."
        suggested_edit: "Define a concrete package-local path such as docs/implementation/ponytail-harness-adoption-2026-06-24/source-intake/source-pin.yaml and add it to owned, staged, and acceptance evidence."
      - category: weak_acceptance_evidence
        evidence: "Acceptance requires pin/license/hash records, but does not require where the evidence is recorded."
        suggested_edit: "Require the closeout to record commit/tag, license text/source, copied-file hashes, and command output path in the source-intake manifest."

  02-instruction-tier-poc-v1.md:
    blockers:
      - category: staged_path_gap
        evidence: "Staged Paths use 'Candidate guideline or rule path selected by Phase 01' without a default target."
        suggested_edit: "Add default candidate paths and require Phase 01 closeout to select one exact path before Phase 02 starts."
      - category: weak_acceptance_evidence
        evidence: "P02-4 allows a test or documented static check, but acceptance does not define the minimum check or evidence path."
        suggested_edit: "Define a mandatory minimum static check and evidence file; make targeted tests required when rules/** or shared guidelines change."

  03-skill-and-plugin-supply-chain-v1.md:
    blockers:
      - category: adoption_boundary_gap
        evidence: "Phase 03 forbidden paths say package/runtime-surface.json is forbidden unless Phase 04 explicitly approves runtime-surface adoption."
        suggested_edit: "Make package/runtime-surface.json unconditionally forbidden in Phase 03; move all runtime-surface changes to Phase 04."
      - category: staged_path_gap
        evidence: "Staged Paths only says selected supply-chain files and tests."
        suggested_edit: "List conditional staged path groups for each adoption shape: instruction-tier skip, Moonshot-owned skill, user-managed plugin note, and schema/audit changes."

  04-runtime-package-adoption-gate-v1.md:
    blockers:
      - category: weak_acceptance_evidence
        evidence: "Acceptance requires hook commands to degrade cleanly if Node is unavailable, but verification signals do not include an isolated hook smoke or Node-unavailable check."
        suggested_edit: "Add explicit hook dry-run/smoke verification, or state that managed hook adoption is blocked unless that test command and evidence artifact are added."
      - category: dependency_ambiguity
        evidence: "Phase can edit installer/doctor/package contracts, but approval source and approval artifact are not named."
        suggested_edit: "Name the approval artifact inside the package and require it before package/runtime-surface, installer, or hook-related writes."

  05-validation-metrics-and-rollout-v1.md:
    blockers:
      - category: cross_doc_inconsistency
        evidence: "Dependencies text makes Phase 04 conditional, but execution metadata dependsOn includes 04 unconditionally."
        suggested_edit: "Align the dependency model with the master plan: either require Phase 04 skip evidence for all paths or make the metadata conditional."
      - category: write_boundary_gap
        evidence: "Conditional write boundary permits .moonshot-relay/harness-lab-runs/** generated evidence, but allowed paths do not include it."
        suggested_edit: "Add the generated lab artifact path to allowed/conditional write boundaries and staged paths, or keep it read-only and require evidence to be copied into the package."
      - category: weak_metrics_acceptance
        evidence: "Local evidence criteria do not define baseline tasks, threshold, report path, or pass/fail decision format."
        suggested_edit: "Require a validation report path with selected task IDs, baseline vs Ponytail-influenced metrics, safety-gate checklist, and explicit rollout decision."

non_blocking_polish:
  - "Use the same wording for 'instruction-tier only', 'source-only', and 'managed adoption skipped' across all closeout sections."
  - "Consider adding one compact decision-state enum shared by Phases 03-05."
```

