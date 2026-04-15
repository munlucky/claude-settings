# Node Script Migration

Last-Reviewed: 2026-04-08

## Goal

Move the core `.claude/scripts` execution chain from shell-first to Node-first so the same workflow can run on macOS, Linux, WSL, and Windows native environments with a narrower portability gap.

## Why This Exists

The current script layer is operational on macOS and Linux, and usually workable in WSL, but it is not a true cross-platform runtime surface.

Current blockers:

- most phase entrypoints are `bash` scripts
- key flows depend on `grep`, `awk`, `sed`, `find`, `mktemp`, `shasum`, `tar`, and POSIX process control
- several scripts embed `python3` via here-docs for parsing and artifact generation
- Windows handling is partial and isolated rather than end-to-end

This means "Claude Code support" currently implies "Claude Code in a POSIX-capable shell environment", not "native cross-platform support".

## Current State

Implementation progress as of 2026-04-08:

- shared Node utility modules exist under `.claude/scripts/lib/`
- `verify-code-policy`, `runtime-cli`, `moonshot-phase-dispatch`, and `agent-loop` now have `.mjs` implementations
- `agent-loop-phase-plan`, `agent-loop-phase-runtime`, `agent-loop-phase-state`, and `agent-loop-phase-artifacts` have Node helper modules and shell shims
- `agent-loop.sh` is now a wrapper to `agent-loop.mjs`
- `agent-loop.mjs` owns loop-level control such as stale-phase cleanup, loop logging, summary generation, and explicit phase selection
- `agent-loop-phase-plan-lib.mjs` and `agent-loop-phase-runner.mjs` now own the primary single-phase execution path
- `agent-loop-shell-core.sh` remains only as a legacy compatibility bridge
- `install-browser-runtime.mjs` now owns browserctl install posture across POSIX and Windows-native launchers
- `windows-native-validation.mjs` and `windows-native-validation.ps1` now provide a prepared Windows validation entrypoint

Primary shell-based runtime entrypoints:

- `.claude/scripts/runtime-cli.sh`
- `.claude/scripts/moonshot-phase-dispatch.sh`
- `.claude/scripts/agent-loop.sh`
- `.claude/scripts/verify-phase-runtime-parity.sh`
- `.claude/scripts/workflow-enforcement.sh`
- `.claude/scripts/knowledge-repo-audit.sh`

Mixed-runtime helpers:

- `.claude/scripts/check-mcp.sh`
- `.claude/scripts/install-browser-runtime.sh`
- `.claude/scripts/agent-loop-phase-*.sh`

Existing Node usage already present in the repository:

- `.claude/scripts/memory-mcp-wrapper.js`
- `.claude/scripts/notify.cjs`
- `.claude/tools/browserd/package.json`

## Target State

The runtime contract should look like this:

- core workflow logic lives in `.claude/scripts/*.mjs`
- shell entrypoints remain only as thin compatibility wrappers
- Node standard library handles file I/O, hashing, process control, temp dirs, and platform branching
- Windows native can run the core workflow chain with `node` and the required external CLIs
- parity and policy tooling validate the Node path as the primary implementation

## Non-Goals

- rewriting every utility script in one pass
- converting documentation-only helpers that do not affect workflow execution
- introducing a heavy build toolchain before the migration is proven
- changing Moonshot workflow contracts or artifact semantics unless required for portability

## Design Constraints

1. Existing script entrypoint names must remain callable during the migration window.
2. Current artifact paths and filenames must remain stable unless a compatibility layer is added.
3. The migration should prefer plain `.mjs` over TypeScript for the first pass.
4. The first release must avoid unnecessary npm package dependencies.
5. macOS/Linux/WSL behavior must not regress while Windows native support is being added.

## Working Assumptions

- `node` is a more realistic cross-platform baseline for this repository than `bash` or `python3`.
- External CLIs such as `git`, `claude`, and `codex` will still be required.
- Some install-time flows may still need OS-specific helpers even after runtime logic moves to Node.
- YAML handling can start with a narrow project-specific parser or a compatibility shim before a fuller abstraction is justified.

## Open Questions

- whether to keep `python3` helper scripts as-is for the first migration pass or absorb them into Node immediately
- whether thin `.sh` wrappers should remain indefinitely or only during a staged deprecation window
- whether Windows install helpers should be Node-driven or split into dedicated PowerShell scripts
- whether a root-level `package.json` is needed, or if script execution should stay dependency-free

## Immediate Deliverables

1. Node migration specification for `.claude/scripts`
2. Patch design mapping current shell files to Node modules
3. Phase-by-phase work plan with execution order and acceptance gates

## Remaining Focus

1. validate Windows-native execution on the Node-first path
