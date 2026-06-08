# Verification Contract

Canonical source guideline for verification contract expectations and evidence.

Verification contracts define required checks, optional checks, scope matching, and acceptable fallback behavior.
Fresh evidence must come from commands or artifacts produced after the relevant change unless prior evidence is explicitly justified.
Skipped checks need a reason, risk, and nearest replacement check before closeout.
Verdict artifacts should identify run id, command, status, required checks executed, missing checks, and generated evidence paths.

Verification profiles separate task-scope summary evidence from final completion authority:

| Profile | `profileRequiredPlanes` |
| --- | --- |
| `prompt_only` | `quality` |
| `docs_only` | `package`, `quality` |
| `script_change` | `unit`, `quality` |
| `workflow_core` | `unit`, `package`, `installer`, `security`, `quality` |
| `runtime_adapter` | `unit`, `package`, `installer`, `browser`, `security`, `quality` |

`completionAuthorityRequiredPlanes` remains `unit`, `package`, `installer`, `browser`, `security`, and `quality` for accepted completion. A `--required-planes-json` override may make the profile summary pass, but it must not make `assess-completion` return accepted without the authority planes.

Verification summaries expose two additive projection fields:

- `taskLocalCompletion`: profile-scoped evidence completeness for the current task type.
- `wholePlanAuthority`: evidence eligibility against the whole-plan authority planes; accepted completion still requires a runtime-state DB decision.

`compactStatus.latestVerificationEvidence` may repeat these projections in the runtime read model, but it is evidence visibility only. It must not be used as `completion_decisions.status=accepted`.

`observability.teamMetrics.requiredFields` remains as deprecated compatibility. Decision-critical consumers should use `observability.teamMetrics.decisionFields`; dashboards and reports should use `observability.teamMetrics.reportingFields`.
