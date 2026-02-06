---
description: 무감독 에이전트 루프 실행 및 병렬 에이전트 조정
---

# Agent Loop Workflow

자율 실행 에이전트 루프를 시작하고 관리하는 방법입니다.

## Prerequisites

1. Claude Code CLI 설치 및 인증 완료
2. `.claude/scripts/agent-loop.sh` 실행 권한 부여

```bash
chmod +x .claude/scripts/agent-loop.sh
```

## Usage

### 기본 실행 (무한 루프)

```bash
# // turbo
cd /path/to/project
./.claude/scripts/agent-loop.sh
```

### 제한된 반복 횟수

```bash
# 10회 반복 후 종료
./.claude/scripts/agent-loop.sh --iterations 10
```

### Dry Run (실제 실행 없이 확인)

```bash
./.claude/scripts/agent-loop.sh --dry-run
```

## Parallel Agents (같은 프로젝트에서)

### 방법 1: 다른 터미널에서 실행

```bash
# Terminal 1
AGENT_ID=agent-1 ./.claude/scripts/agent-loop.sh

# Terminal 2
AGENT_ID=agent-2 ./.claude/scripts/agent-loop.sh
```

> [!WARNING]
> 같은 디렉토리에서 병렬 실행 시 flock 기반 lock이 충돌을 방지하지만,
> 동시에 같은 파일을 수정하면 머지 충돌이 발생할 수 있습니다.

### 방법 2: 태스크 분리 (권장)

각 에이전트에게 다른 phase를 할당:

```bash
# Terminal 1 - Phase 3 담당
# AGENT_PROMPT.md에 "Phase 3만 작업" 명시

# Terminal 2 - Phase 4 담당  
# AGENT_PROMPT.md에 "Phase 4만 작업" 명시
```

## Lock 메커니즘

### Lock 파일 위치

```
.claude/current_tasks/
├── fix-auth-bug.lock      # Agent A 작업 중
└── add-logging.lock       # Agent B 작업 중
```

### Lock 파일 형식

```yaml
# .claude/current_tasks/{task-name}.lock
agent_id: "agent-1"
started_at: "2026-02-06T10:00:00Z"
task_description: "Fix authentication bug"
```

### 수동 Lock 해제

에이전트가 비정상 종료된 경우:

```bash
rm .claude/current_tasks/*.lock
```

## Logs

모든 세션 로그는 `agent_logs/` 디렉토리에 저장됩니다:

```
agent_logs/
├── agent_20260206_100000_a1b2c3.log
├── agent_20260206_103000_d4e5f6.log
└── ...
```

## Troubleshooting

### "AGENT_PROMPT.md not found"

```bash
cp .claude/scripts/AGENT_PROMPT.md ./AGENT_PROMPT.md
# 프로젝트에 맞게 수정
```

### "Claude CLI not found"

```bash
# Claude Code 설치 확인
which claude
```

### Session keeps failing

1. `agent_logs/` 에서 최신 로그 확인
2. `.claude/docs/blockers.md` 에서 기록된 이슈 확인
3. 필요 시 수동으로 문제 해결 후 재시작
