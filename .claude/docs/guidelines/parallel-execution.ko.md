# 병렬 실행 가이드라인 (Parallel Execution Guidelines)

## 핵심 원칙
- 계획 검증과 구현은 병렬 실행하지 않는다.
- `codex-validate-plan` 완료 후에만 `implementation-runner`를 실행한다.

## 트리거 조건
- 계획 산출물(`agreement.md`, `context.md`)이 확정된 상태
- `karpathy-execution-gate`가 체인에 포함된 경우 통과 상태
- 구현 이후 독립 단계가 존재할 때

## 병렬화 전략
구현 범위를 결정하지 않는 독립 단계만 병렬화한다.

허용 예시:
- `codex-review-code` + `session-logger`
- `codex-review-code` + `browser-verifier` (리뷰로 코드 변경 시 런타임 검증 재실행)
- 입력이 분리되어 있으면 구현 후 `security-reviewer` + `browser-verifier`
- 완료 판정을 확정하지 않는 범위에서는 review와 finish-stage 로깅 일부 병렬 가능
- `efficiency-tracker`는 명시적인 deprecated/과거 리포팅 용도에만 사용하고 기본 병렬 단계로 쓰지 않음

금지 예시:
- `codex-validate-plan` + `implementation-runner`
- `requirements-analyzer` + `context-builder`
- `completion-verifier` + 코드 수정 remediation
- review/verify 판정이 확정되기 전 final finish-stage closeout

## Review / Verify 조율

- 비사소한 코드 변경의 구현 직후 첫 post-implementation stage는 `review-bundle`로 본다.
- `verification-bundle`은 review 결과에 영향을 받지 않는 점검만 제한적으로 병렬 시작할 수 있다.
- review 때문에 코드가 바뀌면 영향받는 verify/runtime 체크를 다시 돌린다.
- `finish-bundle`은 review/verify 판정이 closeout 가능한 수준으로 안정된 뒤에만 시작한다.

## 토큰 중복 방지
1. 공통 스냅샷은 파일 경로와 최소 메타데이터만 포함한다.
2. 역할별 입력만 추가한다.
3. 오케스트레이션 노트에 파일 본문을 인라인하지 않는다.
4. 병렬 단계 결과는 요약만 병합하고, 코드 변경 시 필수 게이트를 재실행한다.

## 실행 스크립트 로직
```bash
# 1) 계획 게이트 (순차)
codex-validate-plan --feature {feature_name}
karpathy-execution-gate --feature {feature_name}

# 2) 구현 (순차)
implementation-runner --feature {feature_name}

# 3) 구현 후 독립 점검 (선택적 병렬)
codex-review-code --feature {feature_name} &
REVIEW_PID=$!

session-logger --feature {feature_name} &
LOG_PID=$!

wait $REVIEW_PID
wait $LOG_PID
```

## 동기화 지점
| 시점 | 이벤트 | 액션 |
|---|---|---|
| 계획 완료 | 구현 시작 | 검증 게이트 이후 순차 실행 |
| 구현 완료 | 선택적 병렬 점검 시작 | 독립 단계만 함께 실행 |
| 리뷰로 코드 변경 발생 | 게이트 재실행 | 영향받는 verify/runtime 체크 재실행 |
| 점검 완료 | 머지 결정 | fix-forward 정책으로 진행 |
