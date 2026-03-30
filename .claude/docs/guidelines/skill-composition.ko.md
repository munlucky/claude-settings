# Skill Composition 가이드

> bundle 조합으로 sequence 로직을 짧고 읽기 쉽게 유지합니다.

## 언제 고려할까

- 동일한 스킬 조합이 3곳 이상 반복될 때
- 전체 스킬 수가 30개를 넘길 때
- 신규 참여자가 흐름을 이해하기 어려울 때

## 활성 bundle

## 단계 모델

비사소한 구현 작업은 아래 단계 순서를 기준으로 본다.

1. Intake
2. Plan
3. Ready / Isolate
4. Execute
5. Review
6. Verify
7. Finish / Handoff

기본 원칙:
- medium, complex, phase 기반 작업은 이 단계를 눈에 보이게 통과해야 한다
- 작은 bounded work는 단계를 압축할 수 있지만, 위험도가 남아 있으면 review/verification 규율을 유지해야 한다

## 공개 진입점

기본 공개 workflow entrypoint:

- `product-orchestrator`: raw idea를 bounded product package로 바꾸는 진입점
- `moonshot-phase-runner`: large, phase-based, long-running 구현 작업의 진입점
- `moonshot-orchestrator`: phase harness 바깥의 bounded implementation 진입점

보조 공개 유틸리티 진입점:

- `session-logger`: 세션 또는 HANDOFF 기록을 사용자가 직접 남기고 싶을 때
- `commit-moonshot`: 프로젝트 메모리 현행화와 커밋을 함께 명시적으로 실행할 때

아래는 기본 사용자 진입점으로 제시하지 않습니다.

- `moonshot-phase-executor`
- 분석 마이크로스킬
- readiness gate
- 문서 운영 보조 스킬

## 조합 소유권

- 분석 마이크로스킬은 orchestrator를 보조하기 위한 것이며, 직접 호출 표면을 넓히기 위한 것이 아닙니다.
- ready/isolate helper는 숨겨진 gate가 아니라 명시적 사전 단계로 취급합니다.
- review helper는 전용 review stage 뒤에서 실행합니다.
- verification helper는 전용 verify stage 뒤에서 실행합니다.
- 문서화와 세션 기록 helper는 finish-stage bundle 뒤에서 실행합니다.
- 스택 특화 UI helper는 `frontend-design` 아래에 둡니다.
- `session-logger`는 필요 시 공개 유틸리티로 직접 호출할 수 있습니다.
- `commit-moonshot`도 필요 시 공개 유틸리티로 직접 호출할 수 있습니다.

## Skill Layer Taxonomy

스킬이 늘어날수록 아래 3개 layer로 분류해 관리합니다.

- `orchestrator`
  - sequence, verdict routing, team topology를 결정
- `agent_extending`
  - 실행 경로에 도메인 지식이나 재사용 행동을 추가
- `external_interface`
  - 외부 도구, runtime check, 서비스와의 연결 담당

신규 또는 개편 스킬은 가능한 한 아래 frontmatter 필드를 사용합니다.

```yaml
layer: orchestrator|agent_extending|external_interface
loads:
  - short context label
deepReferences:
  - path/to/reference.md
outputArtifacts:
  - artifact-name
```

권장 본문 순서:

1. summary
2. routing rules
3. execution contract
4. deep references

### analysis-bundle
```yaml
steps:
  - moonshot-classify-task
  - moonshot-evaluate-complexity
  - moonshot-detect-uncertainty
  - moonshot-decide-sequence
```

### planning-bundle
```yaml
steps:
  - requirements-analyzer
  - context-builder
  - moonshot-plan-writer (if no safe phase plan exists)
  - plan-ceo-review (PLAN 계열 artifact의 가치/범위 검토)
  - plan-eng-review (SPEC/PLAN 계열 artifact의 기술/준비성 검토)
  - task-slicer (if plan output must be decomposed into slices)
  - codex-validate-plan
```

### ready-isolate-bundle
```yaml
steps:
  - pre-flight-check
  - project-contract-gate
  - context-readiness-gate
  - verification-contract-gate
  - workspace-isolation-gate (if strict or implementation is about to start)
```

### implementation-bundle
```yaml
steps:
  - project-memory-check
  - karpathy-execution-gate
  - implementation-runner
  - code-simplifier
```

### review-bundle
```yaml
steps:
  - codex-review-code
  - security-reviewer (if hasSecurityChanges)
  - audit (if uiQualityAuditRequested)
  - web-design-guidelines (if explicit UI/UX review is requested)
```

### verification-bundle
```yaml
steps:
  - browser-verifier (if webRuntimeCheckNeeded)
  - qa-flow (if guided runtime QA is requested)
  - completion-verifier
  - verification-evidence-gate (if strict)
```

### finish-bundle
```yaml
steps:
  - doc-auto-sync
  - session-logger
  - commit-moonshot (if the user explicitly requests memory update plus commit)
```

### verification-suite
```yaml
steps:
  - review-bundle
  - verification-bundle
```

`verification-suite`는 review와 verify를 한 블록으로 다루던 이전 조합을 위한 compatibility alias입니다.

### doc-ops-bundle
```yaml
steps:
  - doc-auto-sync
  - session-logger
  - documentation-agent
```

의미 있는 파일 수정이 있는 구현 run에서는 `finish-bundle`을 기본 마감 단계로 사용합니다.
문서/세션 정리가 중심인 작업에는 `doc-ops-bundle`을 사용합니다.

### logging-bundle
```yaml
steps:
  - session-logger
```

`logging-bundle`은 이행 안전성을 위해 남겨 둔 legacy alias입니다.

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

- Tier 1 진입점이 bundle을 선택해야 하며, bundle이 공개 호출 표면을 넓히면 안 됩니다.
- `product_project`는 `ready-isolate-bundle`을 사용할 수 있습니다.
- large 또는 phase 기반 작업은 `moonshot-orchestrator`가 아니라 `moonshot-phase-runner`로 진입합니다.
- medium/complex 구현은 `ready-isolate-bundle -> implementation-bundle -> review-bundle -> verification-bundle -> finish-bundle`을 기본 경로로 삼습니다.
- 비사소한 코드 변경은 `review-bundle` 뒤에 `verification-bundle`을 둡니다.
- 구현 마감에는 `finish-bundle`, 문서/세션 전용 작업에는 `doc-ops-bundle`을 우선합니다.
- `commit-moonshot`은 자동 단계가 아니라 사용자가 명시적으로 요구할 때만 실행하는 유틸리티입니다.
- `meta_harness`는 downstream bootstrap gate를 건너뜁니다.
- strict 오버레이는 bundle 내부가 아니라 bundle 확장 후 적용합니다.
- 현재 plane에서 no-op이 된 bundle은 notes에 명시합니다.
