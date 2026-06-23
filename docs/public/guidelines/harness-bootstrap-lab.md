# Harness Bootstrap Lab

The Harness Bootstrap Lab is the H0 control point for testing Moonshot Relay harness changes. It must stay smaller than the harness it tests and must not import candidate harness modules for its verdict.

## Trust Boundary

- H0 writes `lab-result.json`.
- H1 stable and H2 candidate harnesses only write their own command outputs.
- Candidate `verify.json`, `score.json`, runtime-state projections, or chat output are evidence inputs, not promotion authority.
- `lab-result.json` uses `authority: "external-bootstrap-lab"` to make that boundary machine-checkable.
- Lab run output lives outside the candidate repository by default under `.moonshot-relay/harness-lab-runs/<runId>/`.

## Default Gate

Run the current candidate checkout:

```bash
node tools/harness-lab/harness-lab.mjs run --candidate-root . --json
```

Run a stable checkout and candidate checkout with the same suite contract:

```bash
node tools/harness-lab/harness-lab.mjs run \
  --stable-root C:/path/to/stable/moonshot-relay \
  --candidate-root C:/path/to/candidate/moonshot-relay \
  --json
```

The built-in suite currently checks package materialization dry-run, the harness control-plane golden eval, and the lab contract tests. Use `npm run test:lab` for the candidate-only default gate.

## Stable Freeze

Freeze a known-good source snapshot as an npm package artifact and manifest:

```bash
node tools/harness-lab/harness-lab.mjs freeze \
  --source-root C:/path/to/moonshot-relay \
  --out C:/path/to/releases/stable/current \
  --version 2026-06-23
```

The freeze manifest records the Git source fingerprint, package tarball SHA-256, Node version, and platform. The tarball is the stable execution artifact equivalent for this Node-based harness.

## Custom Suites

Pass `--config <json>` with a suite list:

```json
{
  "schemaVersion": 1,
  "suites": [
    {
      "id": "contract",
      "command": ["<node>", "--test", "tests/harness-lab-contract.test.mjs"],
      "timeoutMs": 120000
    }
  ]
}
```

Use `<node>` and `<npm>` placeholders instead of hard-coded executable paths for Windows and POSIX portability.
