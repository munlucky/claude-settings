# Moon Relay Kernel Source Implementation Report

## Scope

This change implements the source-level contracts for phases 01 through 07 without mutating live account-root profiles.

## Implemented

- isolated product, promotion, runtime, workflow, context, state, evidence, proof, scheduler, and upstream policies
- Kernel-only CLI and package manifest
- adaptive router and state machine
- stage-scoped context compiler and deterministic receipts
- SQLite execution authority with one-way projections
- E0–E2 evidence packaging
- internal capability skills and managed upstream proposal flow
- T0–T3 proof routing and Safe Wave dry-run planning
- disposable Claude, Codex, and Qwen profile templates
- focused Kernel contract tests and a 30-case evaluation corpus

## Verification boundary

The focused Kernel test suite is designed to run with Node 22 and uses only Node built-ins. Full repository gates, package parity, provider routing, Harness Lab, and live profile adoption remain required before whole-plan completion can be accepted.
