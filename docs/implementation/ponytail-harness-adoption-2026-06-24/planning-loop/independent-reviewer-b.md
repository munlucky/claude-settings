```yaml
00-master-plan-v1.md:
  - blocker: "Package is marked markdown_only_not_dag_validated, but phase docs are presented as executable phases; runner cannot know whether to execute only Phase 01 or the full 01-05 chain."
    evidence: "lines 62-64, 67-85"
    suggested_edit: "Add runnerContract with mode: preparation_only, activePhase: '01', runnablePhases: ['01'], blockedPhases: ['02','03','04','05'] until named prerequisite artifacts exist."
  - blocker: "Final closeout lacks phase-local evidence artifact names required for cursor advancement."
    evidence: "lines 118-133"
    suggested_edit: "Require each phase to produce SCORECARD.md, QA_REPORT.md, HANDOFF.md, and phase-decision.yaml under a fixed phase evidence directory; completion requires Status: complete plus those artifacts."

01-source-intake-and-policy-mapping-v1.md:
  - blocker: "Source-pin output is optional/ambiguous: 'manifest or plan appendix' lets runner guess where commit, license, hashes, and policy decision live."
    evidence: "lines 14, 63, 68-88"
    suggested_edit: "Make exact required outputs: source-intake/source-pin.yaml, planning-loop/source-intake-artifact-classification.md, source-intake/policy-compatibility-matrix.md, planning-loop/source-intake-adoption-shape-decision.yaml."
  - blocker: "Closeout decision gates Phase 02/03 on records that have no schema or required path."
    evidence: "lines 86-88"
    suggested_edit: "Define adoption-shape-decision.yaml fields: source_pin_status, policy_mapping_status, recommended_next_phase, phase03_blocked_reason."

02-instruction-tier-poc-v1.md:
  - blocker: "Runner must infer the selected guideline/rule path and targeted test path from Phase 01."
    evidence: "lines 29-31, 82-86"
    suggested_edit: "Consume planning-loop/source-intake-adoption-shape-decision.yaml and require exact fields selected_guideline_path, selected_rule_path|null, selected_test_path|null."
  - blocker: "Closeout can skip Phase 03, but no machine-readable skip decision is required."
    evidence: "lines 92-93"
    suggested_edit: "Require phase-decision.yaml with next: phase03 | close_instruction_tier_only and evidence.no_runtime_surface_changed: true."

03-skill-and-plugin-supply-chain-v1.md:
  - blocker: "Write boundary allows skills.lock.json and skills/** broadly even when adoption is instruction-tier-only or user-managed plugin."
    evidence: "lines 12-17, 42-57"
    suggested_edit: "Split allowed writes by adoption_shape; for instruction_tier_only/user_managed_plugin, make skills/** and skills.lock.json forbidden."
  - blocker: "Supply-chain decision, hook permission review, and external plugin note have no exact artifact paths."
    evidence: "lines 73-85, 88-98"
    suggested_edit: "Require supply-chain/adoption-decision.yaml, supply-chain/hook-permission-review.md, and supply-chain/skills-audit.json before Phase 04 eligibility."

04-runtime-package-adoption-gate-v1.md:
  - blocker: "Rollback says regenerate lock, but skills.lock.json is read-only in this phase."
    evidence: "lines 23-25, 78-79"
    suggested_edit: "Either move lock rollback to Phase 03 or make skills.lock.json conditionally writable only when managed skill rollback is approved."
  - blocker: "Live-adoption rollback is not executable: previous payload/hash/install target is not captured."
    evidence: "lines 69-87, 100-102"
    suggested_edit: "Require rollback-manifest.yaml with prior runtime-surface hash, prior skills.lock hash, package dry-run artifact path, reinstall command, and verification commands."

05-validation-metrics-and-rollout-v1.md:
  - blocker: "Phase 04 is unconditional even when Phase 03 selects instruction-tier-only or user-managed plugin."
    evidence: "lines 7-11, 95-102"
    suggested_edit: "Change dependsOn to conditional and consume Phase 03 decision: require_phase04: true|false."
  - blocker: "Live install approval and final adoption decision are prose-only; runner cannot prove approval, parity, rollback readiness, or runtime-state authority."
    evidence: "lines 46-52, 62-89, 95-102"
    suggested_edit: "Require rollout/live-approval.yaml, rollout/local-evidence-report.md, rollout/installed-parity.json, rollout/rollback-manifest.yaml, and rollout/final-decision.yaml; final closeout must include accepted runtime-state completion evidence or explicit live_adoption_skipped."

non_blocking_polish:
  - "Use one consistent token for graph readiness, e.g. markdown_only_not_dag_validated."
  - "Name generated lab artifact directories with date/run id to avoid staging ambiguity."
```

