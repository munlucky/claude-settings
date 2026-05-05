# Harness Reliability Retro - 2026-05-05

## 목적

`C:\dev\replay-lens`의 Moonshot phase-runner 실행에서 12시간 가까운 wall-clock 시간이 발생한 원인을 `C:\dev\claude-settings` 하네스 개선 작업의 입력으로 보존한다.

이번 문서는 구현 결과물이 아니라 하네스 개선을 위한 운영 증거 묶음이다. 제품 phase 작업과 하네스 개선 작업의 truth source를 분리하기 위해 `claude-settings/docs/implementation` 아래에 둔다.

## 문서 목록

- `WORK_LOG.md`: replay-lens 실행 작업내역과 시간 분해
- `ISSUE_REGISTER.md`: 이번 실행에서 드러난 전체 이슈 목록과 개선 대상
- `CURRENT_FINDINGS.md`: 현재 판단, root cause, 개선 방향

## 기준 실행

- Source project: `C:\dev\replay-lens`
- Harness owner project: `C:\dev\claude-settings`
- Plan root: `docs/implementation`
- Runner entrypoint: `moonshot-phase-runner docs/implementation`
- Execution mode: `delegated-terminal`
- Active runtime target: `codex`
- 최종 상태: Phase 1-6 closeout 완료, Phase 7은 `docker compose up --wait`에서 Docker daemon 부재로 blocker 유지

## 핵심 결론

12시간 전체가 순수 구현 시간은 아니었다. 로그 기준 delegated runner active 시간은 약 4시간 40분이고, 전체 wall-clock은 약 11시간 52분이었다. 나머지는 runtime mismatch, verifier retry, host fallback 수동 검증, closeout artifact 정합화, Docker daemon blocker 확인 비용이었다.
