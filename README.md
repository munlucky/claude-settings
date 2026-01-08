# Claude Settings

> Claude Code를 위한 프로젝트 설정 및 워크플로우 관리 시스템

## 개요

이 프로젝트는 Claude Code에서 사용할 수 있는 설정 파일, 에이전트, 스킬, 템플릿을 중앙 집중식으로 관리하는 저장소입니다. 다양한 프로젝트에서 재사용 가능한 개발 워크플로우와 가이드라인을 제공합니다.

## 주요 기능

- **전역 규칙 관리**: 모든 프로젝트에서 공통으로 적용되는 개발 지침
- **프로젝트별 템플릿**: 프로젝트마다 커스터마이징 가능한 설정 템플릿
- **에이전트 시스템**: 요구사항 분석, 구현, 검증, 문서화를 위한 전문화된 에이전트
- **스킬 라이브러리**: 반복 작업을 자동화하는 재사용 가능한 스킬
- **문서 템플릿**: 일관된 문서화를 위한 표준 템플릿

## 디렉터리 구조

```
claude-settings/
├── .claude/
│   ├── CLAUDE.md              # 전역 개발 지침
│   ├── PROJECT.md             # 프로젝트별 설정 템플릿
│   ├── AGENT.md               # 에이전트 정규 형식
│   ├── README.md              # PM Agent v2 시스템 설명
│   ├── settings.local.json    # 로컬 설정
│   │
│   ├── agents/                # 전문화된 에이전트 정의
│   │   ├── pm-agent.md
│   │   ├── requirements-analyzer.md
│   │   ├── context-builder.md
│   │   ├── implementation-agent.md
│   │   ├── verification-agent.md
│   │   └── documentation-agent.md
│   │
│   ├── skills/                # 재사용 가능한 스킬
│   │   ├── pre-flight-check/
│   │   ├── session-logger/
│   │   ├── doc-sync/
│   │   ├── efficiency-tracker/
│   │   ├── claude-codex-guardrail-loop/
│   │   ├── design-asset-parser/
│   │   └── receiving-code-review/
│   │
│   ├── docs/                  # 가이드라인 및 문서
│   │   ├── guidelines/
│   │   │   ├── analysis-guide.md
│   │   │   ├── parallel-execution.md
│   │   │   ├── question-templates.md
│   │   │   └── requirements-check.md
│   │   └── tasks/             # 작업 문서 보관소
│   │
│   └── templates/             # 문서 템플릿
│       ├── pm-output.json
│       ├── pm-output.md
│       ├── session-log-template.md
│       ├── context-template.md
│       └── agreement-template.md
│
└── .history/                  # 파일 변경 히스토리
```

## 핵심 구성 요소

### 1. 규칙 문서

#### CLAUDE.md (전역 규칙)
모든 프로젝트에 공통으로 적용되는 기본 원칙과 작업 방식을 정의합니다.

- 기본 응답 언어: 한국어
- 역할: 시니어 풀스택 엔지니어/분석가
- 우선순위: 정확성 > 간결성 > 완전성
- 작업 진행: 계획 → 구현 → 검증 → 요약

#### PROJECT.md (프로젝트별 템플릿)
각 프로젝트에 맞게 커스터마이징할 수 있는 템플릿입니다.

- 프로젝트 개요 (서비스, 스택)
- 핵심 규칙
- 디렉터리 구조
- API/데이터 통신 패턴
- 검증 명령
- 환경 변수

#### AGENT.md (에이전트 규칙)
에이전트 시스템의 표준 형식과 워크플로우를 정의합니다.

### 2. 에이전트 시스템

전문화된 에이전트들이 개발 프로세스의 각 단계를 담당합니다.

| 에이전트 | 역할 | 주요 작업 |
|---------|------|----------|
| **PM Agent** | 프로젝트 매니저 | 작업 타입/복잡도 분석, 에이전트 조율 |
| **Requirements Analyzer** | 요구사항 분석 | 사전 합의서 작성, 요구사항 명확화 |
| **Context Builder** | 구현 계획 수립 | context.md 작성, 단계별 계획 수립 |
| **Implementation Agent** | 코드 구현 | 실제 코드 작성, 패턴 준수 |
| **Verification Agent** | 검증 실행 | typecheck, build, lint 실행 |
| **Documentation Agent** | 문서화 | 세션 로그, 최종 문서화, 효율성 리포트 |

### 3. 스킬 라이브러리

반복 작업을 자동화하는 재사용 가능한 스킬입니다.

| 스킬 | 목적 |
|------|------|
| **pre-flight-check** | 작업 시작 전 필수 정보 확인 |
| **session-logger** | 개발 세션 실시간 기록 |
| **doc-sync** | 에이전트 간 문서 동기화 |
| **efficiency-tracker** | 워크플로우 효율성 추적 |
| **claude-codex-guardrail-loop** | 계획/구현 품질 검증 |
| **design-asset-parser** | 디자인 에셋(Figma, PDF) 파싱 |
| **receiving-code-review** | 코드 리뷰 피드백 수집 및 정리 |

### 4. 문서 템플릿

일관된 문서화를 위한 표준 템플릿을 제공합니다.

- **agreement-template.md**: 사전 합의서
- **context-template.md**: 구현 계획
- **session-log-template.md**: 세션 로그
- **pm-output.json/md**: PM Agent 출력 형식

## 사용 방법

### 1. 새 프로젝트에 적용

```bash
# 1. .claude 폴더 복사
cp -r claude-settings/.claude /your-project/

# 2. PROJECT.md 커스터마이징
# 프로젝트 개요, 스택, 규칙 등을 프로젝트에 맞게 수정

# 3. settings.local.json 설정
# 프로젝트별 설정 조정
```

### 2. 기존 프로젝트에 부분 적용

필요한 에이전트나 스킬만 선택적으로 복사할 수 있습니다.

```bash
# 특정 에이전트만 복사
cp claude-settings/.claude/agents/pm-agent.md /your-project/.claude/agents/

# 특정 스킬만 복사
cp -r claude-settings/.claude/skills/doc-sync /your-project/.claude/skills/
```

### 3. 워크플로우 실행

PM Agent가 자동으로 작업을 분석하고 적절한 에이전트를 호출합니다.

```
User: "배치 관리 기능 구현해줘"
  ↓
PM Agent: 작업 타입/복잡도 분석
  ↓
Requirements Analyzer: 사전 합의서 작성
  ↓
Context Builder: 구현 계획 수립
  ↓
Parallel 실행:
  ├─ Codex Validator → Doc Sync
  └─ Implementation Agent
  ↓
Verification Agent: typecheck, build, lint
  ↓
PM Agent: 요구사항 완료 체크
  ↓
Documentation Agent: 최종 문서화
```

## PM Agent 시스템 v2

최신 버전의 PM Agent 시스템은 다음과 같은 개선 사항을 포함합니다:

- **병렬 실행**: Codex Validator와 Implementation을 동시 실행 (20% 시간 단축)
- **실시간 피드백 루프**: Doc Sync 스킬을 통한 문서 자동 동기화
- **요구사항 완료 보장**: Completion Check로 누락 방지 100%
- **효율성 리포트**: 작업 시간, 재작업 비율, 생산성 자동 측정

자세한 내용은 [.claude/README.md](.claude/README.md)를 참조하세요.

## 문서 경로 규칙

프로젝트에서 생성되는 문서는 다음 경로를 따릅니다:

```
.claude/docs/
├── agreements/
│   └── {feature-name}-agreement.md          # 사전 합의서
├── tasks/
│   └── {feature-name}/
│       ├── context.md                        # 구현 계획
│       ├── design-spec.md                    # 디자인 스펙
│       ├── pending-questions.md              # 미해결 질문
│       └── session-logs/
│           └── day-{YYYY-MM-DD}.md           # 세션 로그
```

## 기대 효과

### 정량적 효과 (complex 작업 기준)

| 지표 | 개선 효과 |
|------|-----------|
| 작업 시간 | 20% 단축 |
| 재작업 비율 | 0% 유지 |
| 요구사항 누락 | 100% 방지 |
| 문서 불일치 | 100% 개선 |
| 전체 생산성 | 96% |

### 정성적 효과

- **실시간 피드백 루프**: 에이전트 간 즉시 정보 공유
- **문서 일관성 보장**: 모든 에이전트가 최신 문서 참조
- **요구사항 완료 보장**: 누락 항목 자동 감지 및 재실행
- **효율성 가시화**: 자동 생성되는 효율성 리포트

## 설정 커스터마이징

### settings.local.json

프로젝트별 설정을 조정할 수 있습니다.

```json
{
  "defaultLanguage": "ko",
  "agentSettings": {
    "pmAgent": {
      "enableParallelExecution": true,
      "enableCompletionCheck": true
    }
  },
  "skillSettings": {
    "docSync": {
      "autoUpdate": true
    }
  }
}
```

## 마이그레이션 가이드

기존 프로젝트에서 v2 시스템으로 업그레이드하려면:

1. Doc Sync Skill 추가
2. PM Agent 프롬프트 업데이트 (5단계, 6단계)
3. Documentation Agent 프롬프트 업데이트 (Finalize Mode)

자세한 내용은 [.claude/README.md](.claude/README.md)의 마이그레이션 가이드를 참조하세요.

## 버전 관리

- `.history/` 폴더에 파일 변경 히스토리 자동 저장
- 주요 설정 파일의 이전 버전 추적 가능

## 라이선스

이 프로젝트는 개인 및 상업적 용도로 자유롭게 사용할 수 있습니다.

## 기여

개선 사항이나 버그 리포트는 이슈를 통해 제출해주세요.

---

**Claude Settings로 체계적이고 효율적인 개발 워크플로우를 구축하세요!**
