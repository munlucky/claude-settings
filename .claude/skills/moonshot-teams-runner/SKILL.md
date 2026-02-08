---
name: moonshot-teams-runner
description: "Agent Teams 기반 병렬 팀 실행. 리뷰, 연구, 검증, 구현 등의 독립적인 작업을 병렬로 수행합니다."
triggers:
  - "teams run"
  - "parallel team"
  - "팀 실행"
---

# Moonshot Teams Runner

## Role

Claude Code의 Agent Teams 기능을 활용하여 독립적인 작업들을 병렬 팀으로 실행합니다.

> **Prerequisites**:
> - Claude Code v2.1.32+
> - `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in settings.local.json

## Usage

```bash
# 리뷰 팀 실행
/moonshot-teams-runner review-team

# 연구 팀 실행
/moonshot-teams-runner research-team

# 검증 팀 실행
/moonshot-teams-runner verify-team

# 계획 검증 팀 실행
/moonshot-teams-runner planning-team

# 품질 검증 팀 실행
/moonshot-teams-runner quality-team

# PM 분석 병렬화 팀 실행
/moonshot-teams-runner analysis-team

# 문제 해결 팀 실행
/moonshot-teams-runner fix-team

# 🆕 병렬 구현 팀 실행
/moonshot-teams-runner impl-team

# 🆕 교차 계층 팀 실행
/moonshot-teams-runner cross-layer-team

# 🆕 디버깅 팀 실행
/moonshot-teams-runner debug-team

# 사용 가능한 팀 목록
/moonshot-teams-runner --list
```

## Available Teams

### 1. review-team (병렬 리뷰)

병렬로 코드 리뷰 수행:

```yaml
members:
  - code-reviewer: 코드 품질 및 구조 리뷰
  - security-reviewer: 보안 취약점 검토
  - react-reviewer: React/Next.js 최적화 (조건부)
timeout: 300s
delegationMode: true
communication: enabled
```

**활용 시점**: 구현 완료 후 코드 리뷰 단계

### 2. research-team (병렬 연구)

병렬로 분석 및 연구 수행:

```yaml
members:
  - requirements-analyst: 요구사항 분석
  - context-builder: 기존 코드베이스 분석
timeout: 180s
delegationMode: true
communication: enabled
```

**활용 시점**: 복잡한 기능 구현 전 분석 단계

### 3. verify-team (이의 제기 검증)

구현 결과를 다각도로 검증:

```yaml
members:
  - implementer: 구현 내용 설명
  - critic: 잠재적 문제점 지적 (이의 제기)
  - resolver: 의견 종합 및 해결책 제시
timeout: 240s
communication: enabled (debateRounds: 2)
```

**활용 시점**: 중요 기능 완료 후 품질 검증

### 4. planning-team (계획 검증)

계획 단계에서 병렬 검증:

```yaml
members:
  - requirements-analyzer: 요구사항 추출 및 검증
  - context-builder: 기존 코드베이스 분석
  - plan-validator: 계획 논리 검증, 의존성 체크
timeout: 240s
delegationMode: true
communication: enabled
```

**활용 시점**: `/moonshot-plan-writer` 실행 후

### 5. quality-team (품질 검증)

구현 후 품질 검증:

```yaml
members:
  - completion-verifier: 테스트 기반 완료 검증
  - memory-reviewer: 프로젝트 규칙/스펙 위반 검증
  - build-checker: 빌드 오류 사전 탐지
timeout: 300s
delegationMode: true
communication: enabled
```

**활용 시점**: 테스트 완료 후

### 6. analysis-team (PM 분석 병렬화)

오케스트레이터 초기 분석 병렬화:

```yaml
members:
  - classifier: 작업 유형 분류
  - complexity-analyzer: 복잡도 평가, 예상 작업량
  - uncertainty-detector: 불확실성 검출, 질문 도출
timeout: 180s
delegationMode: true
communication: enabled
```

**활용 시점**: 오케스트레이터 2.1~2.3 단계

### 7. fix-team (문제 해결)

에러 발생 시 병렬 해결:

```yaml
members:
  - build-resolver: 빌드/컴파일 에러 해결
  - security-fixer: 보안 취약점 수정
timeout: 300s
condition: buildFailed || securityConcern
delegationMode: true
communication: enabled
```

**활용 시점**: 빌드 실패 또는 보안 문제 발생 시

### 8. impl-team (병렬 구현) 🆕

새 모듈/기능을 병렬로 구현:

```yaml
members:
  - feature-dev-1: 주요 기능 구현
  - feature-dev-2: 보조 기능 구현 (파일 5개 이상시)
  - test-writer: 테스트 코드 작성
timeout: 600s
requirePlanApproval: true  # 계획 승인 후 구현
delegationMode: true
fileOwnership: exclusive   # 파일 충돌 방지
communication: enabled
```

**활용 시점**: 복잡한 기능 구현시 작업 분할 필요할 때

**핵심 기능**:
- `requirePlanApproval`: 팀원이 계획 작성 → 리더 승인 → 구현
- `fileOwnership`: 각 팀원이 다른 파일 소유, 충돌 방지

### 9. cross-layer-team (교차 계층) 🆕

프론트엔드/백엔드/테스트 병렬 구현:

```yaml
members:
  - frontend-dev: UI 컴포넌트, 페이지 구현
    ownedPaths: [src/components/, src/pages/, src/app/]
  - backend-dev: API, 서비스 로직 구현
    ownedPaths: [src/api/, src/services/, server/]
  - test-dev: 유닛/통합 테스트 작성
    ownedPaths: [tests/, **/*.test.ts]
timeout: 600s
requirePlanApproval: true
delegationMode: true
fileOwnership: exclusive
communication: enabled
```

**활용 시점**: 전체 스택에 걸친 기능 구현시

**핵심 기능**:
- 각 팀원이 레이어별 파일 소유
- 팀원간 API 스펙 논의 가능

### 10. debug-team (디버깅) 🆕

경쟁 가설로 버그 조사:

```yaml
members:
  - investigator-1: 첫 번째 가설 조사
  - investigator-2: 두 번째 가설 조사
  - investigator-3: 세 번째 가설 조사 (복잡도 high 이상)
timeout: 300s
delegationMode: true
communication: enabled (debateRounds: 3)
```

**활용 시점**: 근본 원인 불명확한 버그 디버깅시

**핵심 기능**:
- 조사자들이 서로의 가설에 도전하고 반박
- 과학적 토론처럼 가장 유력한 가설 도출

## Key Features

### 🎯 계획 승인 (requirePlanApproval)

복잡한 작업에서 팀원이 바로 구현하지 않고 계획을 먼저 작성:

```
1. 팀원이 읽기 전용 계획 모드에서 시작
2. 계획 작성 후 리더에게 승인 요청
3. 리더가 기준에 따라 승인/거부
4. 승인시 팀원이 구현 시작
```

### 🎭 위임 모드 (delegationMode)

리더가 직접 구현하지 않고 조율에만 집중:
- 팀원 생성/메시징/종료
- 작업 관리 및 할당
- 결과 종합

### 💬 팀원 통신 (communication)

팀원간 직접 메시지 교환:
- `message`: 특정 팀원에게 메시지
- `broadcast`: 모든 팀원에게 동시 전송

### 📁 파일 소유권 (fileOwnership)

구현 팀에서 파일 충돌 방지:
- `exclusive`: 각 팀원이 지정된 경로만 수정
- `ownedPaths`: 팀원별 소유 경로 지정

## Workflow

```
/moonshot-teams-runner <team-name>
    │
    ├─ 1. Validate Team Configuration
    │      └─ Check team exists and prerequisites met
    │
    ├─ 2. Spawn Team Members
    │      └─ Each member runs in parallel (Tmux/In-process)
    │
    ├─ 3. [If requirePlanApproval]
    │      ├─ Members create plans
    │      └─ Leader approves/rejects plans
    │
    ├─ 4. Monitor Progress
    │      └─ Wait for all members or timeout
    │
    └─ 5. Aggregate Results
           └─ Merge findings into unified report
```

## Output

팀 실행 완료 후 생성되는 리포트:

```markdown
# Team Report: impl-team

## Summary
- Members: 3
- Duration: 180s
- Status: ✅ All completed

## Plan Approvals
- feature-dev-1: ✅ Approved
- feature-dev-2: ✅ Approved
- test-writer: ✅ Approved

## Findings

### feature-dev-1
- Implemented: UserProfile component
- Files: src/components/UserProfile.tsx
- ...

### feature-dev-2
- Implemented: ProfileSettings component
- Files: src/components/ProfileSettings.tsx
- ...

### test-writer
- Tests added: 12
- Coverage: 85%
- ...

## Aggregated Results
1. ...
2. ...
```

## Integration with Orchestrator

`moonshot-orchestrator`에서 자동 호출:

```yaml
# analysisContext.decisions
parallelGroups:
  - group: "impl-team"
    mode: "agent-teams"
    trigger: "after:moonshot-plan-writer"
    condition: "signals.useParallelImpl && estimatedFiles > 3"
  - group: "cross-layer-team"
    mode: "agent-teams"
    trigger: "after:moonshot-plan-writer"
    condition: "signals.crossLayerChange"
  - group: "review-team"
    mode: "agent-teams"
    trigger: "after:implementation-runner"
```

## Token Usage Warning

> [!CAUTION]
> Agent Teams는 각 팀원이 별도의 Claude 인스턴스를 사용합니다.
> - 2명 팀: ~13,000 토큰 (전체 용량의 ~29%)
> - 3명 팀: ~20,000 토큰
> - 리뷰 팀 등 중요한 상황에서만 사용 권장

## Best Practices

1. **팀원에게 충분한 컨텍스트 제공**: 생성 프롬프트에 작업 세부사항 포함
2. **작업 크기 적절히 조정**: 너무 작으면 오버헤드, 너무 크면 낭비 위험
3. **파일 충돌 피하기**: 각 팀원이 다른 파일 소유하도록 분해
4. **연구/검토로 시작**: Agent Teams 처음이면 코드 작성 없는 작업부터

## Progress Status Output Rules

Output clear progress status during team execution.

### Team Initialization
```
🚀 Agent Teams Starting: {team-name}
═══════════════════════════════════════════════════════════════
  Members: {member-count}
  Timeout: {timeout}s
  Mode: {delegationMode ? 'Delegation' : 'Direct'}
═══════════════════════════════════════════════════════════════
```

### Member Progress Status
```
👥 Team Member Progress
├─ [feature-dev-1] 🔄 Implementing... (plan approved)
├─ [feature-dev-2] ⏳ Awaiting plan approval
├─ [test-writer]   ✅ Done (12 tests written)
└─ Overall: 33% (1/3)
```

### Status Icons
- ✅ Completed
- 🔄 Running
- ⏳ Pending
- 📝 Writing plan
- ✔️ Plan approved
- ❌ Failed
- ⏱️ Timeout

### Plan Approval Phase (when requirePlanApproval enabled)
```
📋 Plan Approval Status
├─ [feature-dev-1] ✔️ Approved ─ UserProfile impl
├─ [feature-dev-2] 📝 Under review ─ ProfileSettings impl
└─ [test-writer]   ⏳ Pending
```

### Team Completion
```
═══════════════════════════════════════════════════════════════
  ✅ {team-name} Complete
═══════════════════════════════════════════════════════════════
  Duration: {duration}s
  Success: {success-count} / Failed: {fail-count}
───────────────────────────────────────────────────────────────
```

## Limitations

- 세션당 하나의 팀만 가능
- 중첩된 팀 불가 (팀원이 팀 생성 불가)
- 분할 창에는 tmux 또는 iTerm2 필요

## References

- `/moonshot-orchestrator`: 오케스트레이터 통합
- `.claude/templates/agent-teams-config.yaml`: 팀 설정 템플릿
- [Claude Code Agent Teams 공식 문서](https://code.claude.com/docs/ko/agent-teams)
