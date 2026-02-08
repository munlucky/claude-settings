---
name: moonshot-teams-runner
description: "Agent Teams 기반 병렬 팀 실행. 리뷰, 연구, 검증 등의 독립적인 작업을 병렬로 수행합니다."
triggers:
  - "teams run"
  - "parallel team"
  - "팀 실행"
---

# Moonshot Teams Runner

## 역할

Claude Code의 Agent Teams 기능을 활용하여 독립적인 작업들을 병렬 팀으로 실행합니다.

> **사전 요구사항**:
> - Claude Code v2.1.32+
> - `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 설정 필요

## 사용법

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

# 사용 가능한 팀 목록
/moonshot-teams-runner --list
```

## 사용 가능한 팀

### 1. review-team (병렬 리뷰)

```yaml
members:
  - code-reviewer: 코드 품질 및 구조 리뷰
  - security-reviewer: 보안 취약점 검토
  - react-reviewer: React/Next.js 최적화 (조건부)
timeout: 300s
```
**활용 시점**: 구현 완료 후 코드 리뷰 단계

### 2. research-team (병렬 연구)

```yaml
members:
  - requirements-analyst: 요구사항 분석
  - context-builder: 기존 코드베이스 분석
timeout: 180s
```
**활용 시점**: 복잡한 기능 구현 전 분석 단계

### 3. verify-team (이의 제기 검증)

```yaml
members:
  - implementer: 구현 내용 설명
  - critic: 잠재적 문제점 지적 (이의 제기)
  - resolver: 의견 종합 및 해결책 제시
timeout: 240s
```
**활용 시점**: 중요 기능 완료 후 품질 검증

### 4. planning-team (계획 검증) 🆕

```yaml
members:
  - requirements-analyzer: 요구사항 추출 및 검증
  - context-builder: 기존 코드베이스 분석
  - plan-validator: 계획 논리 검증, 의존성 체크
timeout: 240s
```
**활용 시점**: `/moonshot-plan-writer` 실행 후

### 5. quality-team (품질 검증) 🆕

```yaml
members:
  - completion-verifier: 테스트 기반 완료 검증
  - memory-reviewer: 프로젝트 규칙/스펙 위반 검증
  - build-checker: 빌드 오류 사전 탐지
timeout: 300s
```
**활용 시점**: 테스트 완료 후

### 6. analysis-team (PM 분석 병렬화) 🆕

```yaml
members:
  - classifier: 작업 유형 분류
  - complexity-analyzer: 복잡도 평가, 예상 작업량
  - uncertainty-detector: 불확실성 검출, 질문 도출
timeout: 180s
```
**활용 시점**: 오케스트레이터 2.1~2.3 단계

### 7. fix-team (문제 해결) 🆕

```yaml
members:
  - build-resolver: 빌드/컴파일 에러 해결
  - security-fixer: 보안 취약점 수정
timeout: 300s
condition: buildFailed || securityConcern
```
**활용 시점**: 빌드 실패 또는 보안 문제 발생 시

## 토큰 사용량 주의

> [!CAUTION]
> Agent Teams는 각 팀원이 별도의 Claude 인스턴스를 사용합니다.
> - 2명 팀: ~13,000 토큰 (전체 용량의 ~29%)
> - 3명 팀: ~20,000 토큰
> - 중요한 상황에서만 사용 권장

## 참조

- `/moonshot-orchestrator`: 오케스트레이터 통합
- `.claude/templates/agent-teams-config.yaml`: 팀 설정 템플릿
