# Wave B12 — Final Prompt and Regression Evidence

기준일: `2026-09-05`  
대상: Phase B Kernel Decomplexification의 마지막 work unit

B12는 모델이 작업을 수행하는 데 필요한 업무 표면만 전달하도록 Host projection을 고정한다.

## Model-visible surface

`buildModelVisiblePromptView()`의 top-level allowlist는 다음 여섯 필드로 고정된다.

`objective`, `acceptance`, `constraints`, `currentWork`, `relevantProjectKnowledge`, `requiredEvidence`

route score, provider/model 선택, cache, lease, CAS, Git, stagnation algorithm과 같은 제어 메타데이터는 projection에 포함되지 않는다. 빈 Host 입력이 들어와도 capsule에 이미 있는 acceptance, constraints, knowledge, evidence를 보존하도록 fallback한다.

## Codex route matrix

| executionClass | expected model | expected effort |
| --- | --- | --- |
| `planning` | `gpt-6-astra` | `high` |
| `complex_implementation` | `gpt-6-astra` | `high` |
| `review` | `gpt-6-astra` | `high` |
| `standard` | `gpt-5.6-luna` | `max` |

The negative matrix is equally explicit: planning, complex implementation, and review do not resolve to Luna; standard does not resolve to Astra. Risk, retry, and repeated-failure signals do not change the default class mapping. Manual invocation overrides remain an explicit, attributable exception rather than an inferred escalation.

## Current reduction measurements

| Metric | B12 evidence |
| --- | ---: |
| Workload classes | 4 |
| Codex model mappings | 2 |
| Default Astra escalation in the Codex class policy | 0 |
| Model-visible top-level fields | 6 |
| Control metadata fields in the B12 projection | 0 |
| Required route mismatch cases | 4 |

Repository-wide production file/LOC counts remain recorded separately because the preceding waves add explicit authority and Host-boundary evidence; B12 does not claim that raw physical LOC alone is a quality metric.

Verification surfaces: `tests/kernel-decomplexification-characterization.test.mjs`, `tests/kernel-codex-model-policy.test.mjs`, `tests/kernel-host-model-dispatch.test.mjs`, `tests/kernel-runtime-boundary-static.test.mjs`, `tests/kernel-model-capsule-view.test.mjs`, and prompt-envelope tests.

The final Kernel report is the authority for fresh full-regression evidence and protected review completion.
