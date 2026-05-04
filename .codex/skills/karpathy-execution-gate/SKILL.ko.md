---
name: karpathy-execution-gate
description: 구현 직전 4원칙(코딩 전 사고, 단순함 우선, 최소 변경, 목표 중심 실행)으로 실행 품질을 점검하는 게이트.
---

# Karpathy Execution Gate 스킬

## 역할
구현 시작 직전에 짧은 규율 점검 게이트를 실행해 과설계와 스코프 이탈을 줄입니다.

## 사용 시점
- medium/complex 작업에서 첫 `implementation-runner` 실행 직전
- 계획 가정이나 스코프 경계가 바뀐 경우 재실행

## 입력
- `analysisContext.request`, `analysisContext.signals`, `analysisContext.estimates`
- 현재 계획 산출물(`context.md`, 체크리스트, 미해결 질문)

## 게이트 절차
1. **코딩 전 사고 (Think Before Coding)**
   - 목표 결과와 완료 기준을 3줄 이내로 재정의
   - 명시적 가정과 미해결 차단 이슈를 나열
2. **단순함 우선 (Simplicity First)**
   - 가장 작은 실현 가능 접근을 선택
   - 완료 기준에 필요하지 않은 구조 변경은 제외
3. **최소 변경 (Surgical Changes)**
   - 포함 파일(in-scope)과 제외 영역(out-of-scope)을 명확화
   - 첫 구현 배치를 최소·가역적으로 설계
4. **목표 중심 실행 (Goal-Driven Execution)**
   - 구현 -> 검증 -> 리뷰 순서의 짧은 마일스톤 정의
   - 각 마일스톤을 실행 커맨드/체크와 매핑
5. **TDD Handoff**
   - 관찰 가능한 동작이 바뀌는 작업이면 production code 변경 전에 `test-driven-development`로 넘깁니다.
   - test-first가 불가능하면 이유와 대체 verification path를 기록합니다.

## 차단 조건
- 완료 기준을 명확히 기술할 수 없음
- 필수 가정이 미해결 상태임
- 사용자 승인 없이 요청 범위를 넘어서는 변경이 제안됨

차단 시, 코딩으로 넘어가지 말고 planning 단계로 복귀해 이슈를 먼저 해소합니다.

## 출력 (patch)
```yaml
karpathyGate:
  status: pass|blocked
  targetOutcome: "..."
  acceptanceCriteria:
    - "..."
  assumptions:
    - "..."
  scope:
    inScopeFiles:
      - "src/..."
    outOfScope:
      - "infra/..."
  milestones:
    - "최소 구현 반영"
    - "검증 실행"
    - "리뷰 실행"
  blockers: []
notes:
  - "karpathy-gate: simplicity=pass, surgical=pass"
```

## 계약
- 이 게이트는 직접 코드를 구현하지 않습니다.
- 다음 구현 단계가 바로 실행 가능하도록 결과는 짧고 명확하게 유지합니다.
