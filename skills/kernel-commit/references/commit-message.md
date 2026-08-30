# Commit Message Format

The Kernel commit utility records enough context for a later `git log` review to identify why a change was made and what was verified.

## Message Rules

- `--message` is optional once the mutation has passed Kernel admission.
- The first non-empty line is the subject, capped at 96 characters.
- Remaining user-provided lines are preserved under `요청 메시지:`.
- Without `--message`, the subject is `feat(kernel): <작업 목표>`.
- Kernel-generated labels are Korean. Objective text, acceptance statements, paths, run IDs, and machine identifiers retain their recorded values.
- The full message is bounded at 12,000 characters. Long acceptance text and path lists are truncated or capped deterministically.

## Generated Context

The body may include:

- 작업 목표, 실행 ID, 프로젝트, 계획/변경 리비전
- 증명/근거 등급, 완료 판정, 지식 마감, Git 마감
- 인수조건 범위 또는 충족 항목과 검증 결과
- 커밋 대상 경로와 deny-list 또는 보호 경로로 제외된 개수

Raw evidence payloads and provider-owned runtime data are intentionally excluded. The commit receipt keeps the exact generated message alongside the commit hash.

Example:

```text
feat(kernel): 커밋 스킬의 작업 문맥 강화

요청 메시지:
작업 목적과 검증 결과를 커밋에서 확인할 수 있게 한다.

Kernel 작업:
- 작업 목표: 커밋 스킬의 작업 문맥 강화
- 실행 ID: run-example
- 프로젝트: moonshot-relay
- 완료 판정: 승인됨
- 지식 마감: 요청하지 않음
- Git 마감: 커밋
- 검증: unit-test=통과

변경 경로 (1):
- scripts/kernel/git/commit-message.mjs
```
