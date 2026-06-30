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

Task verification classification is fail-closed. Unknown task class is `needs_classification`; frontend/UI work requires browser evidence by default, route/API integration work requires integration evidence by default, and docs-only work does not require browser evidence by default. A waiver must include a reason and approver.

Browser completion result artifacts are evidence only. They use `artifactId=BROWSER_COMPLETION_RESULT`, `completionAuthority=false`, and `authoritySource=evidence_only`; they must not be confused with H0 `lab-result.json` or treated as runtime-state completion authority. Critical scenarios cannot cleanly close from smoke-only or `flaky_pass` browser evidence.

Verification summaries expose two additive projection fields:

- `taskLocalCompletion`: profile-scoped evidence completeness for the current task type.
- `wholePlanAuthority`: evidence eligibility against the whole-plan authority planes; accepted completion still requires a runtime-state DB decision.

`compactStatus.latestVerificationEvidence` may repeat these projections in the runtime read model, but it is evidence visibility only. It must not be used as `completion_decisions.status=accepted`.

`observability.teamMetrics.requiredFields` remains as deprecated compatibility. Decision-critical consumers should use `observability.teamMetrics.decisionFields`; dashboards and reports should use `observability.teamMetrics.reportingFields`.
