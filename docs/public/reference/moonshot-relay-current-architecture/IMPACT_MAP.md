# Impact Map

## Change Type

Documentation-only Brownfield architecture package. No runtime behavior, package materialization, installer, profile-local, or account-root mutation is included.

| Area | Impact | Compatibility | Migration | Rollback |
|---|---|---|---|---|
| Source documentation | Adds `docs/public/reference/moonshot-relay-current-architecture/**`. | Compatible with existing `docs/public/**` and roadmap layout. | No runtime migration. | Remove the package or revert the docs-only commit. |
| Architecture validator | Uses existing Brownfield contract. | Compatible with `scripts/architecture-artifact-validate.mjs`. | No script migration. | Fix docs until validator passes or revert package. |
| Runtime profiles | No direct impact. | `.claude/**` and `.codex/**` remain untouched. | Controlled adoption required for any future runtime changes. | Not applicable. |
| Account-root state | No direct impact. | `MOONSHOT_RELAY_HOME` state remains untouched. | No account-root sync implied. | Not applicable. |
| Future implementation | Handoff package can seed `moonshot-plan-writer` or `moonshot-phase-runner`. | Compatible if future plans preserve source/runtime boundary. | Future phase plan must own specific source paths and verification gates. | Follow phase-runner rollback and runtime-state closeout policy. |

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Package becomes stale after source changes. | Medium | Medium | Refresh package with current checkout truth before using it as implementation input. |
| Documentation-only package is mistaken for runtime parity. | Low | High | `ARCHITECTURE_REVIEW.md` and handoff state explicitly say no runtime/profile mutation occurred. |
| Full harness lab is skipped for a later behavior change. | Medium | High | Traceability requires lab/eval gates for runtime-impacting work. |
