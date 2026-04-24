---
name: doc-auto-sync
description: 코드 변경을 감지하여 관련 문서(PROJECT.md, README, CHANGELOG, 생성 문서)를 자동 업데이트하고, 프로젝트 문서 구조를 부트스트랩합니다.
surfaceStatus: optional_bundle_member
---

# Doc Auto-Sync 스킬

## 공개 범위

이 스킬은 doc-ops helper입니다.
보통은 구현/검증 뒤에서 doc-ops 또는 finish bundle을 통해 실행하는 편이 맞습니다.
기본 workflow 진입점으로 제시하지 않습니다.

> **목적**: 코드 변경 감지 → 영향 문서 식별 → 업데이트 또는 부트스트랩
> **시점**: implementation-runner 이후, codex-review-code 이전

---

## 입력
- `analysisContext.repo.changedFiles` — 변경된 파일 목록
- `analysisContext.request.taskType` — feature/bugfix/refactor
- `analysisContext.artifacts.tasksRoot` — 태스크 문서 루트
- 프로젝트 기준 문서: `workflow/README.md`, `docs/design/README.md`, `docs/glossary/README.md`, `docs/daily/README.md`, `TEST_GUIDE.md`, `docs/analysis/README.md`

## 워크플로우

### 1. 변경 감지 → 문서 매핑

변경된 파일을 영향받는 문서에 매핑:

```yaml
docMapping:
  "src/api/**":
    - "docs/generated/api-reference.md"
    - "README.md#api"
    - ".claude/PROJECT.md#api-data-patterns"
    - "docs/glossary/README.md#api-terms"
  "src/components/**":
    - "ARCHITECTURE.md#components"
    - "docs/design/README.md#component-rules"
  "prisma/schema.prisma|drizzle/*":
    - "docs/generated/db-schema.md"
    - ".claude/PROJECT.md#type-domain-patterns"
    - "docs/glossary/README.md#term-table"
  "package.json":
    - "README.md#installation"
    - ".claude/PROJECT.md#stack"
    - "TEST_GUIDE.md#command-matrix"
  ".env*":
    - "README.md#configuration"
    - ".claude/PROJECT.md#environment-variables"
  "*.config.*":
    - ".claude/PROJECT.md#verification-commands"
    - "TEST_GUIDE.md#command-matrix"
  ".claude/scripts/**|workflow/**":
    - "workflow/README.md#standard-entry-points"
  "src/**|apps/**|packages/**":
    - "docs/analysis/README.md"
```

### 2. PROJECT.md 자동 동기화

변경 감지 시 관련 PROJECT.md 섹션 업데이트:

| 트리거 | 섹션 |
|--------|------|
| `package.json` / `pyproject.toml` / `go.mod` 변경 | `## Stack` |
| 새 디렉토리 생성 또는 구조 변경 | `## Directory / Structure` |
| API 라우트 파일 변경 | `## API / Data Patterns` |
| 타입 정의 또는 스키마 파일 변경 | `## Type / Domain Patterns` |
| `.env*` 파일 변경 | `## Environment Variables` |
| 테스트 설정 파일 변경 (`jest.config`, `vitest.config`) | `## Testing Rules` |
| `package.json` scripts / `Makefile` 변경 | `## Verification / Commands` |

**규칙:**
- 실제 변경이 있는 섹션만 업데이트 (diff 기반)
- **중요: 사용자 작성 내용 보존 최우선.**
  - 리스트(예: Stack)의 경우 새 항목을 '추가'만 하고 기존 항목 삭제 금지.
  - 설명 텍스트는 누락된 정보만 덧붙임.
  - 사용자 커스텀 노트나 주석 절대 덮어쓰기 금지.
- 업데이트된 섹션에 `<!-- auto-synced: YYYY-MM-DD -->` 주석 추가

### 3. 문서 부트스트랩 (신규 프로젝트)

핵심 문서가 없으면 생성 권장:

```yaml
bootstrapRules:
  always:
    - CHANGELOG.md
    - workflow/README.md
    - docs/design/README.md
    - docs/glossary/README.md
    - docs/daily/README.md
    - TEST_GUIDE.md
    - docs/analysis/README.md
  ifMissing:
    - condition: "estimatedLOC > 5000"
      create: "ARCHITECTURE.md (골격)"
    - condition: "API 라우트 파일 존재"
      create: "docs/generated/api-reference.md"
    - condition: "ORM 스키마 파일 존재"
      create: "docs/generated/db-schema.md"
  neverForce:
    - docs/design-docs/
```

**부트스트랩은 최초 감지 시 또는 명시적 `--init` 플래그 시에만 실행.**

### 4. 신선도 체크

문서 최종 수정일 vs 관련 소스 최종 수정일 비교:

```yaml
freshnessCheck:
  staleThreshold: "30일"
  checks:
    - "ARCHITECTURE.md vs 프로젝트 구조"
    - "docs/generated/* vs 소스 코드"
    - ".claude/PROJECT.md vs 실제 프로젝트 상태"
    - "workflow/README.md vs 실제 워크플로우 스크립트/브랜치 정책"
    - "docs/design/README.md vs UI/컴포넌트 시스템"
    - "docs/glossary/README.md vs 현재 도메인 용어"
    - "TEST_GUIDE.md vs 실제 검증 명령"
```

오래된 문서 → `staleDocs[]`에 추가하여 pre-flight-check에서 표면화.

### 5. CHANGELOG 엔트리

commit-moonshot을 위한 CHANGELOG 엔트리 생성:

```yaml
changelog:
  format: "Keep a Changelog"
  sections: [Added, Changed, Deprecated, Removed, Fixed, Security]
  source: "git diff + 커밋 메시지 + analysisContext.request.taskType"
```

---

## 출력 (patch)
```yaml
notes:
  - "doc-auto-sync: updated=[개수], bootstrapped=[개수], stale=[개수]"

docSync:
  updatedDocs:
    - path: ".claude/PROJECT.md"
      sections: ["stack", "apiPatterns"]
    - path: "docs/generated/api-reference.md"
      action: "regenerated"
  bootstrappedDocs:
    - path: "CHANGELOG.md"
      action: "created"
  staleDocs:
    - path: "ARCHITECTURE.md"
      lastModified: "2025-01-15"
      relatedCodeModified: "2025-02-10"
  changelogEntry:
    type: "Added"
    description: "쿠폰 검증이 포함된 결제 API 엔드포인트"
  projectMdChanges:
    - section: "stack"
      diff: "+stripe@14.0.0"
```

---

## 규모별 가이드

| 규모 | 자동 생성 | 수동 작성 |
|------|----------|----------|
| **소규모** (< 5K LOC) | `PROJECT.md` 동기화, `CHANGELOG.md` | `README.md` (초기 1회) |
| **중규모** (5K~50K) | + `docs/generated/*`, `README.md` 섹션 | + `ARCHITECTURE.md` |
| **대규모** (50K+) | + 전체 | + `docs/design-docs/*` |

## 권장 문서 구조

```
{project-root}/
├── ARCHITECTURE.md              # 모듈 코드맵, 경계, 불변식
├── CHANGELOG.md                 # 커밋 시 자동 생성
├── README.md                    # 섹션별 자동 업데이트
│
├── docs/
│   ├── design-docs/             # 복잡 기능 설계 문서 (수동, opt-in)
│   │   └── {feature}.md
│   └── generated/               # 코드에서 자동 추출
│       ├── api-reference.md
│       └── db-schema.md
│
└── .claude/
    ├── PROJECT.md               # 자동 동기화 섹션
    └── docs/tasks/              # 기본 tasksRoot (또는 docs/exec-plans/)
```

> **참고**: `docs/exec-plans/`는 git-tracked 태스크 문서를 위한 `.claude/docs/tasks/`의 선택적 대안입니다.
> `PROJECT.md: documentPaths.tasksRoot`로 설정합니다.
