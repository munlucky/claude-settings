# Gap Analysis - v1 Foundation Plan vs Source Reports

## Purpose

This document records why the current `v1` plan package is insufficient as the final modernization plan. It preserves the original source scope and turns the scope-reduction issue into an explicit planning regression.

## Source Inventory

| Source | Role in v2 scope | Notes |
|---|---|---|
| `C:\Users\moon\Downloads\moonshot-relay 적용 및 고도화 작업계획1.md` | Broad research roadmap | Full Runtime Control Plane, Context State Engine, Tool Registry/Dispatcher, Sandbox Compute Plane, CI/security, eval regression, trace loop, prompt caching, memory promotion, observability, 6.5 to 12 week execution horizon. |
| `C:\Users\moon\Downloads\moonshot-relay 적용 및 고도화 작업계획2.md` | Application roadmap | Confirms control-plane first order while retaining context compaction/rehydration, lazy schema, sandbox, eval gate, trace improvement loop, prompt caching, branch protection, CodeQL, Dependabot, benchmark metrics. |
| `C:\Users\moon\.codex\attachments\03cce362-2a12-4d75-8baa-6312a6a32764\pasted-text.txt` | Full-spec implementation draft | Explicitly says the target is not scope reduction and includes runtime DB, read model, tool/sandbox, eval, CI/security, and package/account-root validation. |
| Current `v1` package | Foundation implementation package | Useful for Wave 1 runtime-state/completion authority work, but too narrow if treated as final modernization completion. |

The other two uploaded attachments are retained as session evidence, but the tracked plan uses the two download reports and the full-spec pasted implementation draft as the normalized source set.

## What v1 Got Right

- It moved the planning package into a tracked public roadmap location.
- It preserved public entrypoints: `product-orchestrator`, `moonshot-orchestrator`, and `moonshot-phase-runner`.
- It established `runtime-state.sqlite` and `completion_decisions.status = accepted` as the intended clean-finish authority.
- It treated `phase-status.yaml`, verdict JSON, QA report, and handoff files as derived compatibility artifacts.
- It added the right first regression contracts for false completion, stale verdicts, runtime read model fields, package exclusion, CI source config, and installer dry-run.
- It recorded external harness transfer policy as pattern adoption rather than wholesale import.

## Scope Reduction Findings

| Finding | Source expectation | v1 state | Required v2 correction |
|---|---|---|---|
| Runtime foundation was treated as the practical closure target | Runtime Control Plane is only the first dependency layer | v1 can be read as complete once DB/completion/CI foundation passes | Mark v1 as Wave 1 only and add v2 waves through operations hardening. |
| Context State Engine is under-specified | Build, compact, rehydrate, stale warning, stable/volatile prompt split, prompt cache metrics | v1 mostly closes the read model fields; it does not plan full context object lifecycle | Add dedicated v2 phase for context engine, compaction policy, rehydration tests, and prompt assembly. |
| Tool Registry/Dispatcher is reduced to metadata | 10 to 12 public tool groups, dispatcher, schema validation, lazy full-schema promotion, wrong-tool regression | v1 records tool calls and approval flags but does not build the dispatcher contract | Add v2 tool registry phase with schema budget, registry YAML, dispatcher API, and tool-selection eval. |
| Sandbox Compute Plane is mostly policy text | Leased worktree, command policy, shell/browser isolation, artifact collector, protected path enforcement | v1 blocks unauthorized approval-required operations but does not implement sandbox compute plane ownership | Add v2 sandbox phase with lease lifecycle, path boundary enforcement, browser trace isolation, and destructive/network policy. |
| Eval gate is too narrow | Golden task suite, AWTL replay, behavioral fingerprint, trace-to-testcase improvement loop | v1 adds completion false-positive and event blockers, but not full replay/promotion loop | Add v2 eval/trace phase with fixtures, scorecard thresholds, replay runner, and low-score trace promotion. |
| CI/security is source-only | Required branch checks, CodeQL, Dependabot, dependency review, secret scanning policy, branch protection operations | v1 adds source config but cannot set GitHub settings | Add v2 release/security phase distinguishing tracked config from GitHub settings and requiring operational evidence. |
| Native dependency availability is incomplete | `better-sqlite3` must work in source, package materialization, account-root, temp install, and CI matrix | Current installed runtime can still be typed degraded when native module is missing | Add v2 package/account-root phase requiring dependency materialization or documented supported degraded mode. |
| Observability and metrics are not a first-class phase | completion false positive, resume success, invalid tool rate, prompt cache hit, compaction ratio, DB busy count, flaky trace rate, security alerts, eval regression | v1 records some data but lacks metrics collection and operations views | Add v2 observability phase with metric names, collection points, and status output. |
| Memory promotion remains advisory | Memory promotion workflow and rollback prevent contaminated long-term knowledge | v1 does not own memory promotion beyond public guideline references | Add v2 memory phase with promotion ledger, replay evidence, rollback, and stale knowledge warnings. |

## Decision

`v1` remains useful as the first implementation slice, but it is rejected as the final modernization plan. `00-master-plan-v2.md` is the new execution authority for the full scope. Completion of the full modernization requires all v2 phases to pass, not only the current runtime-state foundation.
