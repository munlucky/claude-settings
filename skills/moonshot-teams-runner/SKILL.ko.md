---
name: moonshot-teams-runner
description: "Agent Teams 기반 병렬 팀 실행. 리뷰, 연구, 검증, 구현 등의 독립적인 작업을 병렬로 수행합니다."
triggers:
  - "teams run"
  - "parallel team"
  - "팀 실행"
---

# Moonshot Teams Runner

## 역할

런타임 적응형 조율 방식으로 독립 작업을 병렬 팀으로 실행합니다.
Claude 런타임에서는 Agent Teams를, Codex 런타임에서는 동등한 격리 조율 의미를 유지하는 경로를 사용합니다.

이 스킬은 phase completion loop의 owner가 아닙니다. phase 기반 구현에서는 `moonshot-phase-runner`가 public entrypoint로 남아 plan-directory completion, return-boundary checks, automatic phase-wave parallelization을 소유합니다. teams-runner는 phase runner loop의 대체물이 아니라 analysis/review/verification helper로 사용합니다.

## 런타임 실행 모드

- `claude-code` 모드:
  - fork 기반 `team-leader-agent` + Claude Code Agent Teams 사용
  - Claude Code v2.1.32+ 및 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 필요
- `codex` 모드:
  - 특히 읽기 전용 review/verification 작업에서는 fresh forked `team-leader-agent`와 격리된 member attempt를 우선합니다.
  - 현재 Codex 세션은 coordinator로만 유지하고 구조화된 summary만 병합합니다.
  - 어떤 member가 격리를 유지할 수 없으면 degraded path를 notes 또는 workflow evidence에 명시적으로 남깁니다.
  - Claude Agent Teams 플래그나 `mcp__codex__codex` 의존은 없습니다.

## Team Leader Agent 정책 (Bias for Action)

`team-leader-agent` 프롬프트에는 아래 지침을 항상 포함합니다.

1. **계획 후 즉시 실행**: 실행 가능한 최소 계획이 나오면 즉시 구현/검증을 시작합니다.
2. **계획 루프 제한**: 계획 재작성은 최대 1회까지만 허용합니다. 2회차부터는 실행 단계로 강제 전환합니다.
3. **블로킹 처리**: 실제 차단 이슈에서만 사용자 질문 1회로 정리하고, 그 외에는 합리적 기본값으로 진행합니다.
4. **실행 단위 명확화**: 팀원 할당마다 파일 범위, 실행 명령, 검증 명령을 명시합니다.
5. **리뷰어 문맥 정리**: review/verification 할당은 전체 세션 이력이 아니라 artifact 기반 입력만 사용합니다.

## 사용법

```bash
# 리뷰 팀 실행
/moonshot-teams-runner review-team

# 또는 pattern 기준으로 먼저 선택
/moonshot-teams-runner --pattern fanout-fanin

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

오케스트레이션된 실행에서는 pattern-first selection을 우선합니다.
직접 팀 이름을 주는 방식은 수동 override나 디버깅 용도로 유지합니다.

## 사용 가능한 팀

### 1. review-team (병렬 리뷰)

Pattern: `fanout-fanin`

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

Pattern: `fanout-fanin`

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

Pattern: `producer-reviewer`

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

Pattern: `fanout-fanin`

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

**활용 시점**: `/moonshot-plan-writer` 실행 후 또는 오케스트레이터 planning 단계에서 계획 검증이 필요할 때

### 5. quality-team (품질 검증)

Pattern: `fanout-fanin`

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

Pattern: `fanout-fanin`

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

Pattern: `supervisor`

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

Pattern: `hierarchical-delegation`

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

Pattern: `hierarchical-delegation`

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

Pattern: `producer-reviewer`

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

## 핵심 기능

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

## 워크플로우

```
/moonshot-teams-runner <team-name>
    │
    ├─ 1. 팀 컨텍스트 준비
    │      ├─ 팀 설정 검증
    │      └─ 리더에 전달할 최소 컨텍스트 추출
    │
    ├─ 2. 팀 조율 실행
    │      ├─ Claude 런타임: Task 도구 (fork) → team-leader-agent
    │      │   (리더가 팀원 생성/조율/결과 취합)
    │      └─ Codex 런타임: 현재 세션에서 네이티브 조율 경로 실행
    │          (동일 팀 설정, 동일 보고 스키마)
    │
    └─ 3. 결과 병합
           └─ 리더가 반환한 teamReport → analysisContext.notes에 병합
```

## 리더/코디네이터 실행 (런타임 적응형 패턴)

> **중요**: 런타임과 무관하게 메인 세션 컨텍스트 오염을 방지해야 합니다.

Claude 런타임은 project knowledge worker가 쓰는 forked-agent 격리 패턴을 따릅니다.
Codex 런타임도 같은 격리 계약(최소 입력, 요약 출력만)을 유지해야 합니다:

```yaml
# 메인 세션이 최소 입력을 전달:
teamInput:
  teamName: "{team-name}"
  teamConfig: { ... }      # agent-teams-config.yaml에서 추출
  taskContext:
    taskSummary: "..."     # 작업 요약
    taskType: "..."        # feature/bugfix/refactor
    changedFiles: [...]    # 관련 파일
    signals: { ... }       # 필요한 시그널만

# fork된 리더가 요약 결과를 반환:
teamReport:
  teamName: "{team-name}"
  status: "completed"      # completed | partial | failed
  duration: 180
  memberResults: [...]     # 팀원별 발견사항 요약
  aggregatedFindings: [...] # 높은 우선순위 항목
  actionItems: [...]       # 필요 조치사항
```

**런타임 매핑:**
- `claude-code`: `team-leader-agent` → `subagent_type: "general-purpose"` + 프롬프트 **(fork)**
- `codex`: 세션 내 동등 코디네이터 플로우 실행 + 동일 `teamReport` 계약 반환
- 참조: `agents/team-leader-agent.ko.md`

## 출력

팀 실행 완료 후 생성되는 리포트:

```markdown
# Team Report: impl-team

## 요약
- 팀원: 3명
- 소요 시간: 180초
- 상태: ✅ 모두 완료

## 계획 승인
- feature-dev-1: ✅ 승인됨
- feature-dev-2: ✅ 승인됨
- test-writer: ✅ 승인됨

## 발견 사항

### feature-dev-1
- 구현 완료: UserProfile 컴포넌트
- 파일: src/components/UserProfile.tsx
- ...

### feature-dev-2
- 구현 완료: ProfileSettings 컴포넌트
- 파일: src/components/ProfileSettings.tsx
- ...

### test-writer
- 테스트 추가: 12개
- 커버리지: 85%
- ...

## 통합 결과
1. ...
2. ...
```

## 오케스트레이터 통합

`moonshot-orchestrator`에서 자동으로 호출됩니다:

```yaml
# analysisContext.signals
useAgentTeams: true          # --use-teams로 활성화

# analysisContext.decisions
skillChain:
  - ...                      # moonshot-decide-sequence 결과
  - team-leader-agent        # 팀 모드 활성화 시 fork 실행
notes:
  - "pattern=fanout-fanin, team=review-team, trigger=after:implementation-runner"
```

팀 트리거 가이드(오케스트레이터 스키마 정렬):
1. `analysis-team`/`research-team`/`planning-team`: PM 분석 단계(2.1~2.5)에서 사용합니다.
2. `impl-team`/`cross-layer-team`: 복잡한 구현 단계에서 사용합니다.
3. `review-team`/`quality-team`/`verify-team`/`fix-team`: 구현 이후 또는 실패 이벤트 발생 시 사용합니다.

패턴 선택 가이드:
1. 병렬 분석, 리뷰, 검증에는 `fanout-fanin`
2. 이의 제기 검증이나 경쟁 가설 디버깅에는 `producer-reviewer`
3. 실패 복구 조율에는 `supervisor`
4. 소유권이 분리된 병렬 구현에는 `hierarchical-delegation`
5. 구체 팀 이름을 직접 받으면 수동 override로 취급하되, 해당 팀의 추론된 pattern도 함께 기록합니다.

## 토큰 사용량 주의

> [!CAUTION]
> 토큰 프로파일은 런타임에 따라 다릅니다.
> - `claude-code`: 팀원이 별도 Claude 인스턴스로 실행됩니다.
>   - 2명 팀: ~13,000 토큰 (전체 용량의 ~29%)
>   - 3명 팀: ~20,000 토큰
> - `codex`: 단일 Codex 세션에서 실행되지만 병렬 워크스트림 요약으로 컨텍스트 사용량은 증가합니다.
> - 중요한 상황에서만 사용 권장.

## 모범 사례

1. **팀원에게 충분한 컨텍스트 제공**: 생성 프롬프트에 작업 세부사항 포함
2. **작업 크기 적절히 조정**: 너무 작으면 오버헤드, 너무 크면 낭비 위험
3. **파일 충돌 피하기**: 각 팀원이 다른 파일 소유하도록 분해
4. **연구/검토로 시작**: Agent Teams 처음이면 코드 작성 없는 작업부터

## 진행 상태 출력 규칙

팀 실행 중 진행 상태를 명확히 출력합니다.

### 팀 초기화 시
```
🚀 Agent Teams 시작: {team-name}
═══════════════════════════════════════════════════════════════
  팀 구성: {member-count}명
  타임아웃: {timeout}초
  모드: {delegationMode ? '위임' : '직접'}
═══════════════════════════════════════════════════════════════
```

### 팀원 생성 및 진행 상태
```
👥 팀원 진행 상태
├─ [feature-dev-1] 🔄 구현 중... (계획 승인됨)
├─ [feature-dev-2] ⏳ 계획 승인 대기
├─ [test-writer]   ✅ 완료 (테스트 12개 작성)
└─ 전체 진행률: 33% (1/3)
```

### 상태 아이콘
- ✅ 완료
- 🔄 실행 중
- ⏳ 대기
- 📝 계획 작성 중
- ✔️ 계획 승인됨
- ❌ 실패
- ⏱️ 타임아웃

### 계획 승인 단계 (requirePlanApproval 활성화 시)
```
📋 계획 승인 상태
├─ [feature-dev-1] ✔️ 승인됨 ─ UserProfile 구현
├─ [feature-dev-2] 📝 검토 중 ─ ProfileSettings 구현
└─ [test-writer]   ⏳ 대기
```

### 팀 완료 시
```
═══════════════════════════════════════════════════════════════
  ✅ {team-name} 완료
═══════════════════════════════════════════════════════════════
  소요 시간: {duration}초
  성공: {success-count}명 / 실패: {fail-count}명
───────────────────────────────────────────────────────────────
```

## 제한 사항

- 세션당 하나의 팀만 가능
- 중첩된 팀 불가 (팀원이 팀 생성 불가)
- Claude 런타임 분할 창에는 tmux 또는 iTerm2가 필요할 수 있음
- Claude 런타임은 fork 리더 세션을 사용하며, Codex 런타임도 동일한 `teamInput`/`teamReport` 격리 계약을 유지해야 함

## 참조

- `/moonshot-orchestrator`: 오케스트레이터 통합
- `agents/team-leader-agent.ko.md`: 팀 리더 fork 에이전트 정의
- `<MOONSHOT_RELAY_HOME>/templates/agent-teams-config.yaml`: 팀 설정 템플릿
- [Claude Code Agent Teams 공식 문서](https://code.claude.com/docs/ko/agent-teams) (Claude 런타임)
