# 03 Runtime Asset Contract v2

## Goal

Make the browser-flow runner contract explicit so verifier/runtime checks do not fail through an accidental missing asset.

## Dependencies

- Phase 1 guard rules.

## Owned Paths

- `agents/verification/verify-runtime.sh`
- `skills/browser-verifier/SKILL.md`
- `skills/browser-verifier/SKILL.ko.md`
- `scripts/browser-flow-runner.mjs` if restored
- active runtime/verifier tests under `tests/`

## Work

- Implement the chosen contract: browser-flow execution is optional-only.
- Require `BROWSER_FLOW_RUNNER_PATH` or an explicit runner path when a browser-flow script is requested.
- `--browser-flow --browser-only` without a runner must return a structured `setup_gap` verdict instead of an ambiguous shell failure.
- The verdict must name whether the setup gap is blocking for the requested mode and include the expected runner path input.
- Update browser-verifier skill docs to match the chosen contract.

## Acceptance Evidence

- A test covers `--url=data:text/html,ok --browser-flow=smoke --browser-only`.
- The test asserts the expected structured `setup_gap` verdict when no runner path is configured.
- `npm test` includes the contract.

## Phase Boundary

Do not add a placeholder runner that reports success without executing or explicitly reporting unsupported setup.
