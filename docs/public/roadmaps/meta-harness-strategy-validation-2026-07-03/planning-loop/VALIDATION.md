# Validation

Date: 2026-07-03

## Commands Run In Main Workspace

```bash
npm run test:package
node --test tests/package-layout.test.mjs tests/moonshot-architecture-template-contract.test.mjs tests/moonshot-architecture-schema-contract.test.mjs
```

Results:

- `npm run test:package`: passed, 54 tests.
- targeted package/layout + architecture schema/template tests: passed, 22 tests.

## Commands Run By Independent Codebase Reviewer

```bash
node --test tests/harness-lab-contract.test.mjs tests/research-fixture-scorer-contract.test.mjs
npm run test:eval
```

Reported results:

- harness lab + research fixture scorer tests: passed, 70/70.
- `npm run test:eval`: passed, score 1, 14/14, research fixture passed.

## Not Applicable

```bash
node scripts/architecture-artifact-validate.mjs --mode meta_harness_design --path docs/public/roadmaps/meta-harness-strategy-validation-2026-07-03 --json
```

The current validator help lists only `greenfield_prd` and `brownfield_codebase` as supported modes, so it is not an authority for this `meta_harness_design` package.
