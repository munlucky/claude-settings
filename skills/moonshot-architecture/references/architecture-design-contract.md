# Architecture Design Contract

`moonshot-architecture` produces an architecture package before implementation planning.

Required architecture package signals:

- mode classification: `greenfield_prd`, `brownfield_codebase`, `hybrid_prd_plus_existing_repo`, or `meta_harness_design`
- requirement inventory
- ASR catalog
- quality attribute scenarios for non-trivial work
- domain model and capability map
- architecture options with rejected alternatives
- trade-off analysis
- ADRs for significant decisions
- C4 model when component/container boundaries matter
- `SPEC.md` or `SPEC_DELTA.md`
- `PLAN.md`
- `TRACEABILITY_MATRIX.md`

Hard stop:

- Do not hand off implementation until accepted requirements map to owners and verification signals.
