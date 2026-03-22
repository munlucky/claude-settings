# Skill Composition 가이드

> bundle 조합으로 sequence 로직을 짧고 읽기 쉽게 유지합니다.

## 언제 고려할까

- 동일한 스킬 조합이 3곳 이상 반복될 때
- 전체 스킬 수가 30개를 넘길 때
- 신규 참여자가 흐름을 이해하기 어려울 때

## 활성 bundle

### planning-bundle
```yaml
steps:
  - requirements-analyzer
  - context-builder
  - codex-validate-plan
```

### readiness-bundle
```yaml
steps:
  - pre-flight-check
  - project-contract-gate
  - context-readiness-gate
  - verification-contract-gate
```

### implementation-bundle
```yaml
steps:
  - project-memory-check
  - karpathy-execution-gate
  - implementation-runner
  - code-simplifier
```

### verification-suite
```yaml
steps:
  parallel:
    - codex-review-code
    - verify-changes.sh
  then:
    - security-reviewer (if hasSecurityChanges)
    - completion-verifier (if complexity == complex)
```

### implementation-with-recovery
```yaml
steps:
  - implementation-runner
  - on_error:
      - build-error-resolver
      - retry: implementation-runner (max: 2)
```

### meta-harness-bundle
```yaml
steps:
  - pre-flight-check
  - project-memory-check
  - karpathy-execution-gate
  - implementation-runner
  - completion-verifier
```

## 규칙

- `product_project`는 `readiness-bundle`을 사용할 수 있습니다.
- `meta_harness`는 downstream bootstrap gate를 건너뜁니다.
- strict 오버레이는 bundle 내부가 아니라 bundle 확장 후 적용합니다.
- 현재 plane에서 no-op이 된 bundle은 notes에 명시합니다.
