# Node Script Migration Work Plan

Last-Reviewed: 2026-04-08

## Execution Strategy

Ship the migration in small vertical slices. Each slice must leave the repository runnable on macOS/Linux/WSL while expanding Node-native coverage.

## Progress Snapshot

- Phase 1 is complete.
- Phase 2 is complete.
- Phase 3 and Phase 4 are substantially complete.
- Remaining work is Phase 5 plus Windows-native validation.

## Phase 1: Foundation

### Objectives

- establish shared Node utility modules
- prove the wrapper pattern
- set the primary execution policy to Node-first for new work

### Tasks

- create `.claude/scripts/lib/` module skeletons
- implement process, filesystem, logging, and platform helpers
- migrate one low-risk script first to validate the pattern
- add direct-execution examples to relevant docs

### Exit Criteria

- at least one existing shell script has a working `.mjs` implementation
- a `.sh` wrapper can delegate cleanly to the Node module
- no new npm dependency is required

### Status

- complete
- delivered shared Node utility modules and `verify-code-policy.mjs`

## Phase 2: Runtime Core

### Objectives

- move the phase entry chain to Node

### Tasks

- implement `runtime-cli.mjs`
- implement `moonshot-phase-dispatch.mjs`
- implement `agent-loop.mjs`
- split current sourced shell helpers into imported Node modules
- preserve runtime selection, watchdog, logging, and artifact update behavior

### Exit Criteria

- Node can run the phase dispatch path directly
- wrapper-based execution still works on macOS/Linux/WSL
- no regression in plan discovery, execution root handling, or runtime selection

### Status

- complete
- completed:
  - `runtime-cli.mjs`
  - `moonshot-phase-dispatch.mjs`
  - `agent-loop.mjs` public orchestration
  - Node helpers for phase plan/runtime/state/artifacts
  - `agent-loop-phase-attempt.mjs` decision and remediation-prompt module
  - `agent-loop-phase-plan-lib.mjs`
  - `agent-loop-phase-runner.mjs`
  - public `agent-loop.mjs` now executes the Node single-phase runner instead of the shell core

## Phase 3: Verification Core

### Objectives

- move parity and enforcement flows to Node

### Tasks

- implement `verify-phase-runtime-parity.mjs`
- implement `workflow-enforcement.mjs`
- replace shell pipelines and here-doc Python checks with in-process JS logic
- preserve render-only mode and smoke fixture generation

### Exit Criteria

- runtime parity render mode works through Node
- runtime probe and smoke checks preserve current verdict semantics
- workflow evidence recording still produces compatible artifacts

### Status

- substantially complete
- completed:
  - `workflow-enforcement.mjs`
  - `workflow-enforcement.sh` wrapper conversion
  - `verify-phase-runtime-parity.mjs`
  - `verify-phase-runtime-parity.sh` wrapper conversion
  - dispatch and bounded evidence recording smoke checks
  - parity render-only validation through the Node path
  - non-render parity validation deferred into the final Windows-native validation pass

## Phase 4: Audit Tooling

### Objectives

- move repository audit and policy checks to Node

### Tasks

- implement `knowledge-repo-audit.mjs`
- preserve report schema and artifact path
- replace shell-based token and link scanning with JS traversal

### Exit Criteria

- audit output remains schema-compatible
- known current failures reproduce accurately under the Node version

### Status

- substantially complete
- completed:
  - `knowledge-repo-audit.mjs`
  - `knowledge-repo-audit.sh` wrapper conversion
  - parity check for the current always-loaded token budget failure
  - no additional migration work required before install-layer review and Windows-native validation

## Phase 5: Install and Cleanup

### Objectives

- decide long-term compatibility posture and reduce maintenance duplication

### Tasks

- review whether `install-browser-runtime.sh` should become `install-browser-runtime.mjs`, a PowerShell pair, or remain shell-specific
- decide whether wrapper scripts stay indefinitely
- update skills and docs to prefer Node-first invocation examples
- mark any intentionally shell-only helper as such

### Exit Criteria

- primary docs reflect the real supported execution model
- shell wrappers are minimal and consistent
- unsupported OS-specific helpers are clearly labeled

### Status

- substantially complete
- completed:
  - `install-browser-runtime.mjs`
  - `install-browser-runtime.sh` wrapper conversion
  - install posture decision:
    POSIX keeps PATH helper/profile sourcing as best-effort
    Windows native uses generated `.cmd` / `.ps1` launchers without automatic profile or registry mutation
  - `windows-native-validation.mjs`
  - `windows-native-validation.ps1`
  - `windows-native-validation.md`
- remaining:
  - Windows-native execution validation

## Verification Matrix

Each completed phase should be checked against:

- macOS native
- Linux native
- WSL
- Windows native PowerShell or CMD

Minimum checks per phase:

- `node .claude/scripts/<entry>.mjs --help` or equivalent no-op path
- compatibility wrapper invocation where applicable
- artifact generation parity for the touched script

## Recommended Implementation Order

1. install-layer review
2. Windows-native validation

## Deliverables Checklist

- `context.md`
- `specification.md`
- `patch-design.md`
- `work-plan.md`
- `windows-native-validation.md`
- implementation patches per phase
- doc updates that switch examples from shell-first to Node-first where appropriate
