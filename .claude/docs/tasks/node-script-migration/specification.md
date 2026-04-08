# Node Script Migration Specification

Last-Reviewed: 2026-04-08

## Summary

This specification defines a staged migration of the `.claude/scripts` runtime layer from shell-first orchestration to Node-first orchestration. The migration keeps the current public entrypoints stable while moving implementation logic into portable `.mjs` modules.

## Migration Outcome

The desired execution model is:

- users and existing docs may continue calling `.sh` entrypoints during migration
- each `.sh` entrypoint delegates to a same-name `.mjs` implementation
- new direct execution guidance prefers `node .claude/scripts/<name>.mjs`
- platform-sensitive logic is centralized in shared Node modules rather than repeated per script

Current implementation status:

- achieved for `verify-code-policy`, `runtime-cli`, `moonshot-phase-dispatch`, `knowledge-repo-audit`, `workflow-enforcement`, `verify-phase-runtime-parity`, and the public `agent-loop` entry
- achieved for the active `agent-loop` runtime path, where loop orchestration, phase-attempt decisioning, prompt rendering, artifact seeding, and single-phase execution are now Node-first
- install tooling is now Node-first
- Windows-native runtime validation is still pending

## Supported Runtime Contract

### Required baseline

- `node` available in `PATH`
- `git` available in `PATH`
- `claude` and/or `codex` available depending on the selected runtime

### Supported environments after migration

- macOS native
- Linux native
- WSL
- Windows native PowerShell/CMD with Node installed

### Still OS-specific after migration

- POSIX shell profile sourcing remains best-effort
- Windows launcher installation uses `.cmd` / `.ps1` wrappers and avoids automatic profile or registry mutation
- optional browser/runtime installation helpers still have OS-specific UX

## Proposed File Layout

### Shared libraries

- `.claude/scripts/lib/runtime-platform.mjs`
- `.claude/scripts/lib/process-utils.mjs`
- `.claude/scripts/lib/fs-utils.mjs`
- `.claude/scripts/lib/git-utils.mjs`
- `.claude/scripts/lib/yaml-lite.mjs`
- `.claude/scripts/lib/logging.mjs`

### Entry modules

- `.claude/scripts/runtime-cli.mjs`
- `.claude/scripts/moonshot-phase-dispatch.mjs`
- `.claude/scripts/agent-loop.mjs`
- `.claude/scripts/verify-code-policy.mjs`
- `.claude/scripts/verify-phase-runtime-parity.mjs`
- `.claude/scripts/workflow-enforcement.mjs`
- `.claude/scripts/knowledge-repo-audit.mjs`
- `.claude/scripts/install-browser-runtime.mjs`
- `.claude/scripts/windows-native-validation.mjs`

### Compatibility wrappers

- `.claude/scripts/runtime-cli.sh`
- `.claude/scripts/moonshot-phase-dispatch.sh`
- `.claude/scripts/agent-loop.sh`
- `.claude/scripts/verify-phase-runtime-parity.sh`
- `.claude/scripts/workflow-enforcement.sh`
- `.claude/scripts/knowledge-repo-audit.sh`

Wrapper policy:

- validate `node` exists
- `exec node "<peer-module>.mjs" "$@"`
- avoid new business logic in wrapper files

## Functional Requirements

### 1. Runtime utilities

The shared runtime layer must provide:

- OS detection
- WSL detection
- temp directory creation
- checksum helpers
- safe recursive file listing
- process spawn with timeout and signal escalation
- pid lookup by command pattern
- JSON and text file helpers

### 2. Dispatch and loop execution

The Node path must preserve current behavior for:

- runtime selection between Claude and Codex
- watchdog timing
- restart counting
- bridge artifact updates
- phase status transitions
- log file routing

Current status:

- runtime selection, dispatch routing, stale-phase cleanup, loop summary creation, and explicit phase selection are already handled from Node
- watchdog timing, stop-reason classification, retry/advance/stop decisioning, remediation prompt generation, artifact seeding, and single-phase worker execution are handled from Node
- the remaining shell core exists only as a legacy compatibility path, not the primary runtime path

### 3. Verification and parity

The Node parity runner must preserve:

- render-only mode
- selected runtime targeting
- runtime probe behavior
- actual smoke execution
- artifact assertions
- allowed-change checks

### 4. Policy and audit tooling

The Node policy tooling must preserve:

- always-loaded budget checks
- stale document detection
- reference link checks
- workflow evidence recording and verification

## Module Boundaries

### `runtime-platform.mjs`

Responsibility:

- OS and shell environment detection
- workspace contract resolution
- Windows and WSL-specific auth or path handling

### `process-utils.mjs`

Responsibility:

- spawn external commands without shell pipelines
- timeout control
- signal escalation
- stdout/stderr capture
- process search utilities

### `fs-utils.mjs`

Responsibility:

- temp directories
- checksum helpers
- recursive file walking
- copy/symlink fallback behavior

### `yaml-lite.mjs`

Responsibility:

- project-scoped parsing and mutation for the limited YAML structures used by phase status and related artifacts

This is intentionally not a general-purpose YAML engine unless later evidence justifies one.

## Migration Sequence

### Phase 1: Foundation

- create shared Node utility modules
- add wrapper pattern for one low-risk script
- document direct Node execution contract

### Phase 2: Runtime core

- migrate `runtime-cli`
- migrate `moonshot-phase-dispatch`
- migrate `agent-loop`

### Phase 3: Verification core

- migrate `verify-phase-runtime-parity`
- migrate `workflow-enforcement`
- migrate helper logic currently embedded through shell + Python mixes where needed

### Phase 4: Policy tooling

- migrate `knowledge-repo-audit`
- migrate secondary helpers used by audit and verification flows

### Phase 5: Install and cleanup

- review `install-browser-runtime`
- decide permanent wrapper policy
- update docs to prefer Node-native entrypoints

## Acceptance Criteria

1. Core workflow entrypoints can run through Node on macOS and Windows native without requiring Git Bash or WSL.
2. Existing `.sh` entrypoints still function as compatibility wrappers on macOS/Linux/WSL.
3. Artifact paths and key runtime semantics remain compatible with current Moonshot skills.
4. Phase runtime parity can exercise the Node path as the canonical implementation.
5. Repository docs clearly distinguish primary Node entrypoints from legacy shell wrappers.

## Interim Acceptance State

- Criteria 2 is substantially met for the migrated entrypoints.
- Criterion 3 is being preserved so far through shim-based migration.
- Criteria 1, 4, and 5 are not complete until parity, enforcement, audit, and Windows-native validation are finished.
