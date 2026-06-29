# Containerized Harness Lab Loop v1

작성 기준일: 2026-06-24

> Status: source draft superseded by executable plan package.
>
> Execution-ready package: `docs/implementation/containerized-harness-lab-loop-2026-06-24/00-master-plan-v1.md`
>
> This root-level file is retained as the original concept draft. The runnable Moonshot plan-writer package now lives under `docs/implementation/containerized-harness-lab-loop-2026-06-24/` with master plan, phase docs, surface classification, policy sources, evidence slots, and independent review loop artifacts.

## 1. Purpose

현재 프로젝트는 하네스 자체를 개발하는 프로젝트다. 따라서 개선 작업의 완료 판정은 변경된 하네스가 스스로 낸 점수만으로 결정하면 안 된다. 안정된 baseline 하네스 상태와 변경된 candidate 하네스 상태를 같은 task suite에서 실행하고, 외부 비교 결과로 개선/회귀/승격 여부를 판단해야 한다.

목표는 다음이다.

- 최초 1회는 baseline 컨테이너와 candidate 컨테이너를 모두 실행해 기준선을 만든다.
- 이후 루프에서는 저장된 baseline run artifact와 새 candidate run artifact를 비교한다.
- candidate가 승격 조건을 만족하면 candidate artifact와 image/ref를 다음 baseline으로 promote한다.
- 실패 시 candidate workspace/container/output을 폐기하거나 보관만 하고 baseline pointer는 유지한다.

## 2. Evidence Basis

| Source | Relevant Evidence | Harness-Lab Implication |
|---|---|---|
| Arize, "What is an evaluation harness?" | evaluation harness는 무엇을 평가할지, 어떻게 채점할지, 점수 후 무엇을 할지 정의하는 3-stage pipeline이며 CI/CD quality gate로 regression dataset을 돌려 merge를 막는 패턴을 설명한다. <https://arize.com/blog/what-is-an-evaluation-harness/> | 작업문서는 input, scoring, action을 분리해야 한다. candidate pass/fail 후 promote/block 액션이 필요하다. |
| Inspect AI Tutorial | Inspect eval은 dataset, solver, scorer를 결합한 Task로 정의된다. <https://inspect.aisi.org.uk/tutorial.html> | suite/task schema는 fixture dataset, harness command solver, grader/scorer를 명시해야 한다. |
| SWE-bench Harness Reference | SWE-bench harness는 Docker container로 재현 가능한 환경을 만들고 setup, patch application, test execution, grading, reporting 단계를 수행한다. <https://www.swebench.com/SWE-bench/reference/harness/> | baseline/candidate는 컨테이너 실행 단위로 격리하고, image/cache/output/report를 분리해야 한다. |
| SWE-bench Evaluation Guide | prediction JSONL, run_id, Docker 기반 평가, 결과 artifact를 명시한다. <https://www.swebench.com/SWE-bench/guides/evaluation/> | harness-lab run에는 run_id, candidate ref, suite result JSONL, artifact directory가 필요하다. |
| Promptfoo CI/CD Guide | prompt/model 변경을 CI에서 평가하고 quality gate, cost tracking, tags를 사용한다. <https://www.promptfoo.dev/docs/integrations/ci-cd/> | run metadata에는 git sha, variant, cost/runtime, suite tag가 들어가야 한다. |
| harness-evals README | 모든 metric은 normalized score 0.0-1.0을 만들고 threshold로 pass/fail을 결정한다고 설명한다. <https://github.com/harness/harness-evals> | 각 grader는 원점수 외에 normalized score와 threshold verdict를 내야 한다. |

## 3. Operating Model

### Initial calibration loop

```txt
baseline_0 = 작업 이전 하네스 image/ref
candidate_1 = 현재 개선 하네스 image/ref

run baseline_0 against suite
run candidate_1 against same suite
compare candidate_1 vs baseline_0
if pass: promote candidate_1 -> baseline_1
```

### Normal improvement loop

```txt
baseline_n = latest promoted baseline artifact
candidate_n+1 = current changed harness

run candidate_n+1 only
compare candidate_n+1 result with stored baseline_n result
if pass: promote candidate_n+1 -> baseline_n+1
if fail: keep baseline_n
```

### Calibration rerun loop

Baseline도 재실행해야 하는 경우:

- LLM judge, external API, model version, clock-sensitive data가 포함된 suite
- host Docker/runtime/env가 바뀐 경우
- baseline artifact가 오래되어 current resource limit과 비교가 불공정한 경우
- candidate가 margin threshold 근처에서 통과/실패한 경우

```txt
rerun baseline_n
run candidate_n+1
compare rerun baseline with candidate
```

## 4. Container Topology

```txt
host
  docker compose run baseline-harness   # initial/calibration only
  docker compose run candidate-harness  # every improvement loop
  node scripts/harness-lab/compare.mjs
  node scripts/harness-lab/promote.mjs

volumes
  harness-lab-fixtures: readonly
  harness-lab-baseline-runs: read/write by baseline container
  harness-lab-candidate-runs: read/write by candidate container
  harness-lab-compare: read/write by host comparator
```

Hard boundaries:

- Fixtures are read-only for both containers.
- Baseline output and candidate output are separate.
- Candidate cannot read baseline output during task execution.
- Comparator may read both after execution.
- Promotion updates only the baseline pointer and copied artifacts; it must not mutate source fixtures.

## 5. Directory Contract

```txt
.harness-lab/
  baselines/
    current.json
    baseline-0001/
      manifest.json
      suite-results.json
      task-results.jsonl
      artifacts/
  runs/
    candidate-0002/
      manifest.json
      suite-results.json
      task-results.jsonl
      artifacts/
  compare/
    candidate-0002-vs-baseline-0001.json
    candidate-0002-vs-baseline-0001.md
  suites/
    smoke.json
    regression.json
    product-cheonha.json
  fixtures/
    scene-first-bad/
    memory-basic/
    cheonha-launch-window/
```

## 6. Suite Schema

```json
{
  "suite_id": "regression",
  "version": 1,
  "description": "Stable regression tasks for harness changes",
  "resource_limits": {
    "timeout_ms": 120000,
    "memory_mb": 4096,
    "cpus": 2
  },
  "tasks": [
    {
      "task_id": "SFG-001",
      "fixture": "fixtures/scene-first-bad",
      "command": ["npm", "test", "--", "tests/core/scene-first-prose-gates.test.ts"],
      "graders": ["exit_code", "artifact_schema", "forbidden_mutation"],
      "success_threshold": 1.0,
      "critical": true
    }
  ]
}
```

## 7. Run Manifest Schema

```json
{
  "run_id": "candidate-0002",
  "role": "candidate",
  "created_at": "2026-06-24T00:00:00Z",
  "harness_ref": {
    "kind": "git_worktree",
    "git_sha": "",
    "dirty": true,
    "image": "webnovel-harness:candidate-0002"
  },
  "suite_id": "regression",
  "suite_version": 1,
  "resource_limits": {
    "timeout_ms": 120000,
    "memory_mb": 4096,
    "cpus": 2
  },
  "env_fingerprint": {
    "node": "",
    "python": "",
    "os": "",
    "model_config_hash": ""
  }
}
```

## 8. Task Result Schema

```json
{
  "task_id": "SFG-001",
  "status": "pass",
  "exit_code": 0,
  "duration_ms": 5312,
  "scores": [
    {
      "grader": "exit_code",
      "score": 1.0,
      "threshold": 1.0,
      "status": "pass",
      "evidence": "command exited 0"
    }
  ],
  "artifacts": [
    "artifacts/SFG-001/stdout.log",
    "artifacts/SFG-001/stderr.log",
    "artifacts/SFG-001/file-diff.json"
  ],
  "forbidden_mutations": [],
  "errors": []
}
```

## 9. Comparator Rules

Candidate passes only when all mandatory conditions hold.

```txt
critical_task_failures == 0
regression_count == 0
candidate.aggregate.pass_rate >= baseline.aggregate.pass_rate
candidate.aggregate.normalized_score >= baseline.aggregate.normalized_score
candidate.aggregate.forbidden_mutation_count == 0
candidate.aggregate.schema_error_count == 0
candidate.aggregate.stale_source_count == 0
```

Optional thresholds:

```txt
runtime_p95_delta <= +20%
token_cost_delta <= +25%
score_delta >= 0 for regression suite
score_delta >= configured_min_improvement for capability suite
```

Regression classes:

- `new_failed_task`: baseline pass, candidate fail
- `score_drop`: candidate score below baseline by threshold
- `artifact_contract_break`: missing/invalid expected artifact
- `mutation_safety_break`: candidate mutates forbidden paths
- `stale_evidence_break`: candidate uses stale score/source snapshot
- `runtime_regression`: timeout or configured runtime delta exceeded

## 10. Promotion Rules

Promotion is an explicit operation:

```txt
harness-lab promote --candidate-run .harness-lab/runs/candidate-0002
```

Promotion writes:

```txt
.harness-lab/baselines/baseline-0002/
.harness-lab/baselines/current.json
```

`current.json` must contain:

```json
{
  "baseline_id": "baseline-0002",
  "promoted_from": "candidate-0002",
  "promoted_at": "2026-06-24T00:00:00Z",
  "compare_report": ".harness-lab/compare/candidate-0002-vs-baseline-0001.json",
  "harness_ref": {
    "image": "webnovel-harness:candidate-0002",
    "git_sha": ""
  }
}
```

Rollback is pointer-only unless images/artifacts are explicitly garbage-collected:

```txt
harness-lab rollback --to baseline-0001
```

## 11. First Implementation Scope

MVP should not attempt a UI or LLM judge first. Build the mechanical loop.

1. Add Dockerfile for harness execution.
2. Add docker-compose services `baseline-harness` and `candidate-harness`.
3. Add `scripts/harness-lab/run.mjs` to run one suite in one container role.
4. Add `scripts/harness-lab/compare.mjs` to compare stored baseline and candidate results.
5. Add `scripts/harness-lab/promote.mjs` to update baseline pointer.
6. Convert existing tests into first suite:
   - scene-first gates
   - review-only mutation
   - launch-flow
   - commercial-fun-review
   - memory retrieval/proposal
7. Require `npm test` inside candidate container as the first smoke gate.

## 12. Acceptance Criteria

| ID | Criterion | Evidence |
|---|---|---|
| HLAB-001 | Initial mode can run baseline and candidate containers against the same smoke suite. | two run manifests plus compare report |
| HLAB-002 | Normal mode can run candidate only and compare against stored baseline artifact. | candidate run plus baseline pointer |
| HLAB-003 | Candidate cannot read baseline outputs during task execution. | compose volume policy and task environment audit |
| HLAB-004 | Comparator detects baseline pass/candidate fail as regression. | fixture test with intentional failing candidate |
| HLAB-005 | Promotion updates `baselines/current.json` only after comparator pass. | promote test |
| HLAB-006 | Rollback restores prior baseline pointer without mutating fixtures. | rollback test |
| HLAB-007 | All grader scores are normalized 0.0-1.0 with threshold verdicts. | suite result schema test |
| HLAB-008 | Existing `npm test` remains green outside harness-lab. | `npm test` |

## 13. Non-Goals

- No production dashboard in v1.
- No human annotation UI in v1.
- No LLM judge as a blocking grader until deterministic graders and calibration fixtures exist.
- No destructive reset of the user's working tree.
- No baseline promotion based solely on candidate-generated scorecards.
