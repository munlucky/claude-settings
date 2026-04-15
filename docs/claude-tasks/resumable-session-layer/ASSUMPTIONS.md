# Resumable Session Layer Assumptions

Last-Reviewed: 2026-04-09

1. The first milestone is a task-local planning and execution package, not a full runtime implementation.
2. A separate `SPEC.md` is not required until more than one concrete code path consumes the same schema contract.
3. The active phase status for this initiative should be routed explicitly through the task-local `phase-status.yaml` rather than relying on the global default path.
4. Runtime data will be treated as mutable operational state; git-tracking and ignore policy are defined during the integration phase, not assumed upfront.
5. Phase execution can start in `in-session-coordinator` mode once the plan package is accepted.
