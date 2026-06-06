# Moonshot Relay Harness Control Plane Modernization - Master Plan v2

## Status

Status: full-source-scope-final-plan-package

This v2 plan supersedes `00-master-plan-v1.md` as the final modernization scope. v1 is retained only as the Wave 1 foundation candidate and implementation trace.

## Non-Negotiables

- Do not reduce the source spec. Implementation waves are sequencing, not scope deletion.
- Keep public entrypoints stable: `product-orchestrator`, `moonshot-orchestrator`, `moonshot-phase-runner`.
- Do not add public skills by default. Existing owners absorb external harness patterns.
- Runtime state is authoritative; markdown reports, phase status, verdict JSON, QA reports, scorecards, and handoff documents are derived projections.
- Installed account-root runtime must either have working runtime-state support or expose a typed degraded status that blocks authority claims.
- Generated state, logs, traces, sqlite files, verdict JSON, caches, browser artifacts, and profile-local state are never package payload.
- GitHub settings such as branch protection are operational rollout work, not tracked source files; source docs must still name the required settings.

## Source Scope Preserved

The full plan preserves these source-report requirements:

- Runtime Control Plane backed by local SQLite with WAL, busy timeout, migrations, event ledger, decisions, snapshots, tool calls, eval results, and run identity.
- Completion authority cutover so only accepted DB decisions can cleanly finish work.
- Context State Engine for build, compaction, rehydration, resume brief, stale warnings, lineage, and prompt assembly.
- Tool Registry/Dispatcher with 10 to 12 public tool groups, lazy schema promotion, schema validation, and wrong-tool regression fixtures.
- Sandbox Compute Plane with leased worktree, shell/browser isolation, approval-required operation policy, artifact collection, and protected path enforcement.
- Verification Plane covering unit, package, installer, browser, security, and workflow contracts.
- Eval Regression Gate using current AWTL replay/promotion structures and trace-to-testcase conversion.
- Memory Plane with promotion review, evidence, rollback, stale warning, and decision ledger.
- CI/security gate with `npm ci`, `npm test`, package test, dry-runs, CodeQL, Dependabot, CODEOWNERS, required checks, and branch protection documentation.
- Packaging and account-root rollout with native dependency materialization proof.
- Observability metrics for false completion, resume success, invalid tool calls, prompt cache hit, compaction ratio, DB busy/lock behavior, flaky browser trace rate, security alert status, and eval regression.

## Wave Map

| Wave | Scope | Status | Exit criteria |
|---|---|---|---|
| 0 | Plan correction and source-scope restoration | This document set | v1 relabeled, gap analysis written, iter-02 review rejects scope shrink, v2 phase docs exist. |
| 1 | Runtime control-plane foundation | Partially implemented in current staged work | Runtime DB, completion authority, read model, run identity, package exclusion, CI source config, and foundation tests pass. |
| 2 | Installed runtime and dependency hardening | Not complete | `better-sqlite3` works or degrades correctly in source, package, account-root, temp install, and OS/Node CI matrix. |
| 3 | Context engine, prompt assembly, tool registry, sandbox core | Not started | Context rehydration and tool/sandbox dispatcher contracts are executable and regression-tested. |
| 4 | Verification, eval, browser trace, memory promotion | Not started | AWTL replay gate, trace-to-testcase loop, memory promotion ledger, and browser trace artifacts are active. |
| 5 | CI/security/release/downstream rollout | Source config partial | Required checks, branch protection operation, CodeQL/dependency review behavior, release runbook, and downstream adoption evidence exist. |
| 6 | Observability and operations hardening | Not started | Runtime status exposes metrics and operations views; stale/degraded states block completion claims. |

## Phase Map

| Phase | Document | Dependencies | Primary outcome |
|---|---|---|---|
| 01 | `01-current-truth-baseline-and-source-preservation-v2.md` | none | Source reports, current implementation, generated-state boundaries, and drift are frozen. |
| 02 | `02-runtime-control-plane-dependency-and-state-authority-v2.md` | 01 | Runtime state, native dependency delivery, DB schema, and completion authority foundation are production-ready. |
| 03 | `03-run-identity-lease-and-resume-lifecycle-v2.md` | 02 | N projects and N runs/goals are safe through identity, leases, heartbeat/TTL, and resume lifecycle. |
| 04 | `04-context-state-engine-compaction-and-prompt-assembly-v2.md` | 02, 03 | Long-running work resumes from compact read models and stable prompt prefixes. |
| 05 | `05-tool-registry-dispatcher-and-lazy-schema-v2.md` | 02, 04 | Public tool surface is bounded; full schemas are promoted lazily through a dispatcher. |
| 06 | `06-sandbox-compute-plane-and-workspace-isolation-v2.md` | 02, 03, 05 | Worktree, shell, browser, network, dependency install, and external writes follow enforced policies. |
| 07 | `07-verification-plane-browser-security-quality-v2.md` | 02, 06 | Unit/package/installer/browser/security gates are evidence-producing verification planes. |
| 08 | `08-eval-regression-awtl-trace-to-testcase-v2.md` | 02, 05, 06, 07 | Harness changes are blocked by golden eval regressions and trace replay failures. |
| 09 | `09-memory-promotion-knowledge-and-decision-ledger-v2.md` | 04, 08 | Durable knowledge is promoted only through evidence, replay, rollback, and stale-warning gates. |
| 10 | `10-ci-security-release-and-branch-protection-v2.md` | 02, 07, 08 | GitHub source config and operational branch protection requirements are release gates. |
| 11 | `11-packaging-account-root-native-dependency-rollout-v2.md` | 02, 03, 10 | Package/install/account-root/downstream runtime parity is proven. |
| 12 | `12-observability-metrics-and-operations-v2.md` | 03, 04, 05, 08, 09, 11 | Runtime control plane exposes metrics and operations states for continuous improvement. |

## Execution Metadata Contract

Every v2 phase document is runnable only when it names:

- `Dependencies`: earlier phase documents or gates that must be complete.
- `Owned paths`: source files, docs, tests, or planned new paths the phase may change.
- `Read-only paths`: runtime/profile/generated/account-root surfaces the phase may inspect but not mutate.
- `Adoption targets`: source, package, temp-home install, live account-root, or downstream rollout boundaries.
- `Live mutation policy`: whether live `.claude`, `.codex`, `.moonshot-relay`, or downstream profiles may be changed.
- `Required evidence`: commands, fixtures, smoke checks, or operational proofs needed before the phase can be closed.

Default read-only boundaries for all phases are `.claude/**`, `.codex/**`, `.moonshot-relay/**`, `.moonshot-state/**`, runtime DB/WAL/SHM files, traces, logs, caches, verdict JSON, browser artifacts, and live account-root homes. A phase can write to temp homes only when it explicitly owns temp-home installer or smoke evidence.

## Final Plan Readiness

Status: final-plan-execution-ready-after-iter-03

The plan is source-scope complete after v2, but execution readiness depends on the phase metadata and review loop in `planning-loop/plan-quality-review-iter-03.yaml`. Phase execution must use v2 documents, not v1. v1 remains a historical foundation slice.

## Current Implementation Mapping

Completed or currently staged as Wave 1 foundation:

- `better-sqlite3` dependency and lockfile.
- Runtime state store/CLI with migrations, WAL, busy timeout, events, decisions, snapshots, tool calls, eval results, runs, and goals.
- Completion authority regressions for phase-status-only, stale/superseded verdicts, missing identity, approval-required blockers, and worsened eval blockers.
- Runtime read model fields required by the verification contract.
- `prepare-phase-runner-state.mjs` run/goal/workspace identity and non-dry-run resume snapshot recording.
- CI, CodeQL, Dependabot, and CODEOWNERS source config.
- Package and installer dry-run coverage for source scripts and generated-state exclusion.

Partial and not yet full v2 completion:

- Installed account-root runtime-state can still be typed degraded if the native module is absent from the materialized support root.
- Active run lease lacks full heartbeat, TTL expiry, recovery, and stale lease cleanup semantics.
- Eval recording exists, but AWTL replay, scorecard thresholding, promotion, and trace-to-testcase automation are not complete.
- Tool calls are recorded, but the bounded Tool Registry/Dispatcher and lazy schema promotion path are not implemented.
- Approval-required operations can block completion, but full Sandbox Compute Plane isolation is not implemented.
- Runtime status exposes contract fields, but full context compaction, prompt assembly, prompt cache metrics, and stale projection lifecycle are not implemented.
- CI source exists, but remote branch protection/required check settings need operational application.

Not started in v2 terms:

- Context State Engine object model, compactor, rehydrator, and prompt builder.
- Public tool group registry, schema summary/full promotion, dispatcher, and tool budget tests.
- Leased worktree/shell/browser sandbox compute plane with artifact collector.
- Browser trace standardization as a first-class verification plane.
- Memory promotion ledger with replay/rollback/stale-warning enforcement.
- Runtime observability dashboards or status metrics beyond foundation read model.

## Full Completion Criteria

The modernization is complete only when all of the following are true:

- Source and installed runtime both pass runtime-state authority smoke without unhandled native dependency failures.
- Completion false-positive fixtures stay at zero accepted false completions.
- Phase runner can resume long work from DB read model and compact context without relying on chat transcript continuity.
- Tool dispatcher reduces public tool surface and records selected/skipped/schema mode decisions.
- Sandbox boundary blocks out-of-scope writes, destructive operations, unapproved network/dependency install, and external writes.
- AWTL replay/promotion includes harness-control-plane regression fixtures and blocks worsened results.
- Browser verification emits isolated traces and stores them as evidence without promoting generated artifacts into source.
- Memory promotion requires evidence, review, replay, rollback plan, and stale-warning behavior.
- CI source config and GitHub branch protection settings enforce required checks.
- Package build and account-root installer include source support scripts, exclude runtime state, and preserve existing user/project state.
- Runtime status reports operations metrics and degraded/stale states block completion claims.

## Execution Rule

When a phase has remaining work, execution continues to the next unblocked phase after recording failures as runtime/eval facts. A failed fixture blocks completion claims, not the existence of later-phase implementation. The only stop condition is a dependency gate that would make later work invalid or destructive, such as an unresolved native dependency rollout decision for installed runtime authority.

### Dependency Failure Semantics

Failures are classified before deciding whether to stop:

- `carry_forward_blocker`: a failed fixture or degraded capability that must remain visible, but later phases can proceed when they do not depend on the missing capability.
- `rollout_blocker`: a failure that blocks package, account-root, downstream, or release claims but does not block source-only design phases.
- `authority_blocker`: a failure that prevents clean completion decisions from being accepted.
- `hard_stop`: a failure that would make later implementation destructive or invalid, such as unsafe state migration, unresolved DB path authority, or native dependency behavior that cannot even produce typed degraded status.
