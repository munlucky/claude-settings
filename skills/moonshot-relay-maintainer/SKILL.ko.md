---
name: moonshot-relay-maintainer
description: Moonshot 하네스와 downstream .claude 설치본을 유지합니다. 외부 skill 또는 harness 패턴 채택, moonshot-orchestrator 또는 moonshot-phase-runner 정책 개선, runtime parity 또는 completion-gate fixture 수정, commit-memory 기본값 조정, shared .claude asset 동기화에 사용하며 PROJECT.md, memory, settings, logs, task docs 같은 project-local 파일은 보존합니다.
---

# Moonshot Relay Maintainer

## 목적

재사용 가능한 Moonshot 하네스 개선을 적용하되, 기본 public skill surface를 넓히지 않습니다. 오케스트레이션 정책, 런타임 계약, downstream 설치본, 검증 증거를 정렬된 상태로 유지합니다.

## 운영 규칙

- 새 public skill보다 패턴 전이를 우선합니다. 새 skill은 별도 trigger, 별도 출력 계약, 오케스트레이션 결정 변경이 모두 있을 때만 추가합니다.
- `moonshot-orchestrator`, `product-orchestrator`, `moonshot-phase-runner`를 안정적인 진입점으로 유지합니다.
- 외부 skill 채택 기준은 `.claude/docs/guidelines/external-skill-pattern-transfer.md`에 두고 orchestrator policy에서 링크합니다.
- completion gate는 엄격하게 유지합니다. gate logic을 완화하기 전에 stale fixture, prompt, artifact를 먼저 고칩니다.
- 모든 하네스 동작 수정은 TDD로 처리합니다. incident class를 재현하는 deterministic regression test 또는 fixture를 먼저 추가/선택하고, RED 또는 old-behavior proof를 남긴 뒤 최소 변경으로 GREEN을 만들어야 합니다. source-only evidence로 하네스 incident를 닫지 않습니다.
- regression test가 실제로 불가능하면 bypass reason, 가장 가까운 executable check, 남은 재발 위험을 handoff/report에 기록합니다.
- `.claude/memory.json`, `.claude/memorygraph/`, `PROJECT.md`, `.mcp.json`, `settings.local.json`, logs, runtime artifacts, downstream task docs는 사용자가 명시하지 않는 한 project-local로 취급합니다.
- phase source plan이 project-owned CLI 또는 npm/node command를 호출했는데 command surface가 없거나 plan 요구보다 좁으면 source-plan command surface incident로 분류합니다. target repo에서 project-owned CLI를 고치고 테스트하며, moonshot-relay에는 제품 CLI 구현이 아니라 재사용 가능한 contract/skill 교훈만 동기화합니다.
- commit workflow에서는 local policy가 요구할 때 memory를 refresh하되, 사용자가 명시적으로 포함하라고 하지 않는 한 memory artifact는 stage하지 않습니다.

## 워크플로우

1. 현재 하네스 계약을 점검합니다.
   - `.claude/skills/moonshot-orchestrator/SKILL.md`
   - `.claude/skills/moonshot-phase-runner/SKILL.md`
   - `archive/scripts/legacy-phase-adapters/verify-phase-runtime-parity-shell-core.sh`
   - `archive/scripts/legacy-phase-adapters/agent-loop-phase-plan-lib.mjs`
   - `.claude/verification.contract.yaml`
2. 변경 유형을 분류합니다.
   - external pattern transfer
   - compact system prompt 또는 `Claude.md` workflow pattern transfer
   - orchestrator 또는 phase-runner policy update
   - runtime parity 또는 completion-gate fixture update
   - downstream `.claude` synchronization
   - commit 또는 memory policy update
3. TDD regression contract를 정의합니다.
   - 이전 incident 또는 failure mode를 한 문장으로 명명합니다.
   - old behavior에서는 실패하고 fix 이후에는 통과하는 가장 작은 test/fixture를 추가하거나 선택합니다.
   - 가능하면 구현 변경 전에 RED evidence를 캡처합니다. old behavior가 prior workspace 또는 prior commit에만 있으면 old-behavior proof를 기록하고 조용히 RED를 생략하지 않습니다.
   - private implementation assertion보다 public harness entrypoint를 우선합니다: CLI command, completion-gate output, runner metadata, workflow-enforcement scope, projection file, package materialization output.
   - gate를 완화했다면 양쪽을 모두 커버합니다: 더 이상 막으면 안 되는 false positive와 여전히 loop를 멈춰야 하는 true blocker.
   - source-owned regression input은 `tests/fixtures/`에 둡니다. generated logs, verdicts, runtime state는 explicit fixture가 아닌 한 source에 넣지 않습니다.
4. 가장 작은 지속 변경을 적용합니다.
   - stage-owner SKILL.md update
   - guideline/reference update
   - template 또는 fixture update
   - script update
   - deferred pilot entry
5. downstream `.claude`를 sync할 때 project-local state를 보존합니다.
6. validation을 실행하고, 특히 사용할 수 없는 real runtime은 정확히 skip으로 보고합니다.

## TDD Incident Regression Contract

모든 하네스 버그, anomaly, retry-loop failure, stale-state issue, projection mismatch, runtime parity failure, completion-gate 변경에는 다음 계약을 적용합니다.

1. 수정 전에 failure boundary를 재구성합니다.
   - 관련 state authority: `STATE.md`, `current-run.json`, `latest-dispatch.json`, verdict JSON, scorecard, phase status
   - 잘못된 결정을 만든 writer 또는 reader
   - fix 이후 기대하는 public signal
2. production harness code를 바꾸기 전에 executable regression check를 최소 하나 추가하거나 선택합니다.
   - pure classifier/parser 변경은 unit test
   - state/projection/gate 동작은 fixture-backed CLI test
   - self-test는 실제 public decision path를 실행할 때만 허용
   - source/profile sync 버그는 package/materialization hash check
   - source-plan command surface incident는 계획에 적힌 인자를 그대로 쓰는 public command regression을 요구하며, 나쁜 target content에 대한 true blocker signal을 보존해야 합니다.
3. 선택한 check를 RED로 실행하거나 old-behavior proof를 문서화합니다.
   - 권장: 현재 checkout에서 fix 전 failing test output
   - 허용: source workspace, prior commit, fixture replay의 failing output
   - bypass: 재현 불가능한 runtime incident에만 허용하며 explicit temporary-mitigation label을 붙입니다.
4. active test를 통과시키는 데 필요한 최소 code 또는 contract 변경만 합니다.
5. GREEN과 가장 가까운 기존 suite를 실행한 뒤에만 fix 완료를 주장합니다.
6. test는 좁게 유지합니다. 하나의 fixture로 계약을 고정할 수 있으면 broad scenario runner를 만들지 않습니다.
7. 새 test name, command, RED/GREEN evidence, 보호하는 incident class를 보고합니다.

MemoryGraph는 incident summary, taxonomy, test mapping, recurrence ledger를 future recall용으로 저장할 수 있지만 enforcement gate가 아닙니다. 재발 방지의 authoritative guard는 executable regression과 completion-gate evidence입니다.

구조적 하네스 fix에서 이 계약은 필수입니다. TDD regression contract 없이 증상만 개선한 변경은 report에서 temporary mitigation이라고 명시하지 않는 한 incomplete입니다.

## External Pattern Transfer

다른 skill repository나 영상에서 교훈을 가져올 때:

1. 파일이 아니라 패턴을 추출합니다.
2. 각 패턴을 기존 local owner에 매핑합니다.
3. owner 또는 reference guide를 갱신합니다.
4. 기존 owner가 무관한 책임을 섞게 될 때만 public skill을 추가합니다.
5. 채택하지 않은 패턴은 왜 거절했는지 기록합니다.

상세 체크리스트는 `.claude/docs/guidelines/external-skill-pattern-transfer.md`를 읽습니다.

source가 이미지나 compact prompt라면 통째로 복사하지 않습니다. 재사용 가능한 workflow mechanics만 추출하고, 이미 커버된 항목을 분류한 뒤 gap만 기존 stage owner에 전이합니다.

## Runtime Parity Fixes

`verify-phase-runtime-parity.sh` 실패 시:

- 먼저 생성 fixture를 현재 completion contract와 비교합니다.
- artifact가 stale이면 `seed_fixture()` 또는 runtime smoke phase docs를 갱신합니다.
- 계약 자체가 틀린 경우가 아니면 completion gate source는 엄격하게 유지합니다.
- 기대 alignment에는 fresh verification evidence, review completion, plan conformance pass, `OBJ-CONFORM`, `Verdict: done`, `Current task status: FULL`, completed `phase-status.yaml`이 포함됩니다.

권장 확인:

```bash
bash -n archive/scripts/legacy-phase-adapters/verify-phase-runtime-parity-shell-core.sh
node --check archive/scripts/legacy-phase-adapters/agent-loop-phase-plan-lib.mjs
bash archive/scripts/legacy-phase-adapters/verify-phase-runner-boundary.sh
PHASE_RUNTIME_PARITY_KEEP_TMP=true bash archive/scripts/legacy-phase-adapters/verify-phase-runtime-parity.sh .claude/docs/runtime-parity-reference-plan
```

## Downstream Sync

보수적인 `.claude` 동기화에는 `scripts/sync_downstream_claude.py`를 사용합니다.

```bash
python3 .claude/skills/moonshot-relay-maintainer/scripts/sync_downstream_claude.py \
  --source .claude \
  --dry-run \
  /path/to/project-a /path/to/project-b
```

대상을 확인한 뒤 `--dry-run` 없이 실행합니다.

이 스크립트는 shared harness 파일과 디렉터리만 동기화합니다. project-local files, local settings, memory, logs, verification artifacts, project task docs는 의도적으로 보존합니다.

## Validation

변경에 비례해 확인합니다.

```bash
bash archive/scripts/legacy-phase-adapters/knowledge-repo-audit.sh
bash archive/scripts/legacy-phase-adapters/verify-code-policy.sh
bash archive/scripts/legacy-phase-adapters/workflow-enforcement.sh verify
bash archive/scripts/legacy-phase-adapters/verify-phase-runner-boundary.sh
git diff --check
```

하네스 동작 수정에서는 새로 추가하거나 선택한 incident regression command와 가장 가까운 기존 test suite도 실행합니다. report에는 어떤 command가 RED/GREEN evidence인지 명시해야 합니다. 예:

```bash
node archive/scripts/legacy-phase-adapters/agent-loop-phase-state.mjs self-test
node --test archive/scripts/legacy-phase-adapters/agent-loop-phase-state.test.mjs
node --test archive/scripts/legacy-phase-adapters/agent-loop-phase-runner.test.mjs
node --test archive/scripts/legacy-phase-adapters/lib/terminal-blocker-publisher.test.mjs
```

downstream project를 sync했다면 추가로 실행합니다.

```bash
HARNESS_KNOWLEDGE_AUDIT_FILE=/tmp/<project>-knowledge-audit.json bash archive/scripts/legacy-phase-adapters/knowledge-repo-audit.sh
bash -n archive/scripts/legacy-phase-adapters/knowledge-repo-audit.sh
bash -n archive/scripts/legacy-phase-adapters/verify-code-policy.sh
bash -n archive/scripts/legacy-phase-adapters/workflow-enforcement.sh
node --check archive/scripts/legacy-phase-adapters/agent-loop-phase-plan-lib.mjs
```

## 보고

- source harness와 target projects
- `PROJECT.md`, memory, settings, logs, task docs 보존 여부
- 변경된 핵심 파일 또는 owner
- 추가/선택한 incident regression, RED/GREEN evidence, 증명 command
- validation command와 pass/fail/skip 상태
- 건드리지 않은 기존 dirty worktree 변경
