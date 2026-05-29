---
name: harness-memory-promoter
description: review, replay, rollback, release evidence gate를 통과한 명시 승인 project 또는 harness knowledge만 승격합니다.
triggers:
  - "promote harness memory"
  - "promote memory candidates"
  - "harness memory promotion"
---

# Harness Memory Promoter

사용자가 reusable project knowledge를 global 또는 harness memory로 승격하라고 명시적으로 요청한 경우에만 사용합니다. project-local fact는 기본적으로 승격하지 않습니다.

## Required Inputs

승격은 raw transcript나 graph dump가 아니라 durable manifest를 입력으로 사용해야 합니다.

- proposal: `improvement/proposals/<proposalId>.yaml`
- independent review: `improvement/reviews/<proposalId>-review.yaml`
- replay evidence: `improvement/replay/<proposalId>-replay.json`
- harness stable promotion rollback evidence: `improvement/rollback/<proposalId>-rollback.json`
- harness stable promotion release manifest: `improvement/releases/<proposalId>-release-manifest.json`

harness self-improvement meta-project contract:

```yaml
projectId: moonshot-harness-core
knowledgeRoot: "%USERPROFILE%/.codex/state/projects/moonshot-harness-core/knowledge"
improvementRoot: "%USERPROFILE%/.codex/state/projects/moonshot-harness-core/improvement"
candidateReleaseRoot: "%USERPROFILE%/.codex/harness/releases/candidate"
stableReleaseRoot: "%USERPROFILE%/.codex/harness/releases/stable"
```

## Required Flow

1. `claude-settings` repository root에서 실행합니다.
2. proposal과 evidence manifest를 로드합니다.
3. `knowledge-improvement-lifecycle.mjs`로 proposal을 검증합니다.
4. transcript-only, imported-only, secret-like, untrusted external candidate는 durable reason으로 거부합니다.
5. `global-candidate`는 promotion 전에 independent review와 replay evidence를 요구합니다.
6. `harness-meta-project` candidate promotion은 independent review, replay, targeted self-test evidence를 요구합니다.
7. `harness-meta-project` stable promotion은 independent review, affected-project replay, targeted self-test, rollback, release manifest evidence를 요구합니다.
8. lifecycle helper가 `approved_for_promotion`을 반환한 뒤에만 compact promoted fact를 씁니다.

## Hard Rules

- project-local fact는 기본적으로 승격하지 않습니다.
- source project에서 harness graph로 직접 쓰지 않습니다.
- raw project graph dump, raw log, raw transcript를 승격하지 않습니다.
- denial은 durable evidence이며 denial code와 reason을 포함해야 합니다.
- unsafe promotion denial은 무관한 workflow를 막지 않습니다.
- MemoryGraph가 unavailable이면 promotion write skip 또는 failure로 보고하고, 성공으로 취급하지 않습니다.
- source project, proposal id, review id, replay id, release manifest id 등 provenance tag를 보존합니다.
