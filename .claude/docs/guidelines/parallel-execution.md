# 병렬 실행 가이드라인 (Parallel Execution Guidelines)

## 트리거 조건 (Trigger Conditions)
- **Context Builder** 완료 후.
- **complexity: complex**일 때만.
- **Planning Phase**의 마지막 단계.

## 전략 (Strategy)
**Codex Validator** (계획 검증)와 **Implementation Agent** (코딩)를 병렬로 실행합니다.
- Validator는 엣지 케이스 등 계획을 검토합니다.
- Implementation은 즉시 코딩을 시작합니다.
- 동기화(Sync)는 Validator가 완료된 후 수행됩니다.

## 실행 스크립트 로직 (Execution Script Logic)
```bash
# Context Builder 완료 후
echo "✅ Context Builder 완료"
echo "🔀 병렬 실행 시작: Codex Validator || Implementation Agent"

# 병렬 호출
codex-validator-agent --feature {feature_name} &
VALIDATOR_PID=$!

implementation-agent --feature {feature_name} &
IMPL_PID=$!

# Validator 대기 (읽기 전용이라 빠름)
wait $VALIDATOR_PID
echo "✅ Codex Validator 완료"

# Validator 피드백을 Context에 동기화
doc-sync-skill \
  --feature {feature_name} \
  --updates validator-output.json
echo "✅ Doc Sync 완료: context.md 업데이트됨"

# Implementation 대기
wait $IMPL_PID
echo "✅ Implementation Agent 완료"

# 구현 중 계획 변경 여부 확인
if [[ context.md updated after implementation start ]]; then
  echo "⚠️ Validator가 계획을 수정했습니다."
  echo "📝 Implementation Agent가 변경사항을 반영했는지 확인 중..."
  # 중요한 변경사항이 누락되었다면 다음 페이즈에서 패치 스케줄링
fi
```

## 동기화 지점 (Synchronization Points)
| 시점 | 이벤트 | 액션 |
|---|---|---|
| Context Builder 완료 | 병렬 실행 시작 | Validator와 Implementation 동시 시작 |
| Validator 완료 | Doc Sync | `context.md`에 피드백 업데이트 |
| Implementation 완료 | Context 확인 | Validator의 피드백 반영 여부 검증 |
| 둘 다 완료 | Type Safety 시작 | 다음 순차 단계로 진행 |

```