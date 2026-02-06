# Output Hygiene Guidelines

터미널 출력 및 로그 관리를 통해 Claude의 컨텍스트 윈도우 오염을 방지합니다.

## 원칙

> Claude는 컨텍스트 윈도우에 모든 출력을 저장합니다.
> 불필요한 출력은 유용한 정보를 밀어내고 성능을 저하시킵니다.

## 규칙

### 1. 에러 포맷 표준화

```
ERROR: {file}:{line} - {message}
```

예시:
```
ERROR: src/auth.ts:42 - Token refresh failed
ERROR: tests/user.test.ts:15 - Expected 200, got 401
```

- `grep ERROR` 로 모든 에러 추출 가능
- 한 줄에 필요한 정보 모두 포함

### 2. 긴 출력 억제

| 상황 | 대응 |
|------|------|
| 100줄 초과 | 파일로 저장, 요약만 출력 |
| 테스트 결과 | "32/35 passed, 3 failed" 형태 |
| 빌드 로그 | 에러/경고만 표시 |

**예시 패턴:**
```bash
# BAD
npm test  # 수백 줄 출력

# GOOD
npm test > .claude/logs/test-output.log 2>&1
echo "Tests: $(grep -c PASS .claude/logs/test-output.log) passed, $(grep -c FAIL .claude/logs/test-output.log) failed"
```

### 3. 진행률 샘플링

긴 작업 시 10% 간격으로만 출력:

```bash
# 100개 파일 처리 시
[10%] Processing file 10/100...
[20%] Processing file 20/100...
...
[100%] Complete. 100 files processed.
```

### 4. 사전 계산된 요약

```yaml
# BAD: 원시 데이터 전체 출력
test_results:
  - test1: pass
  - test2: pass
  - test3: fail
  - ... (수백 개)

# GOOD: 요약 통계
test_summary:
  total: 150
  passed: 147
  failed: 3
  failed_tests: ["test3", "test45", "test89"]
```

## 스킬별 적용

### completion-verifier
- 테스트 결과는 요약만 출력
- 실패한 테스트만 상세 표시
- 전체 로그는 파일로 저장

### build-error-resolver
- 빌드 로그에서 에러만 추출
- "3 errors, 5 warnings" 형태로 요약

### 일반 스크립트 실행
- PAGER=cat 설정 (기본)
- 긴 출력은 | tail -50 로 제한
- 또는 파일로 리다이렉트
