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

장기 memory 쓰기 전에는 runtime ledger 입력이 필수입니다.

```bash
node scripts/runtime-state.mjs record-memory-promotion \
  --run-id "{runId}" \
  --goal-id "{goalId}" \
  --memory-id "{memoryId}" \
  --status promoted \
  --evidence-json "{...fresh evidence...}" \
  --reviewer-json "{...approved review...}" \
  --replay-json "{...passed replay...}" \
  --rollback-json "{...rollback plan...}" \
  --scope-owner "{owner}" \
  --json
```

evidence, review, replay, rollback, scope owner 중 하나라도 없으면 rejected ledger decision을 남기고 승격을 중단합니다.

harness self-improvement meta-project contract:

```yaml
projectId: moonshot-relay
knowledgeRoot: "${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/state/projects/moonshot-relay/knowledge"
improvementRoot: "${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/state/projects/moonshot-relay/improvement"
candidateReleaseRoot: "${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/state/harness/releases/candidate"
stableReleaseRoot: "${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/state/harness/releases/stable"
```

## Required Flow

1. `moonshot-relay` repository root에서 실행합니다.
2. proposal과 evidence manifest를 로드합니다.
3. `knowledge-improvement-lifecycle.mjs`로 proposal을 검증합니다.
4. transcript-only, imported-only, secret-like, untrusted external candidate는 durable reason으로 거부합니다.
5. `global-candidate`는 promotion 전에 independent review와 replay evidence를 요구합니다.
6. `harness-meta-project` candidate promotion은 independent review, replay, targeted self-test evidence를 요구합니다.
7. `harness-meta-project` stable promotion은 independent review, affected-project replay, targeted self-test, rollback, release manifest evidence를 요구합니다.
8. MemoryGraph 쓰기 전에 runtime ledger decision을 기록합니다.
9. lifecycle helper가 `approved_for_promotion`을 반환하고 ledger decision이 `promoted`인 경우에만 compact promoted fact를 씁니다.

## Hard Rules

- project-local fact는 기본적으로 승격하지 않습니다.
- source project에서 harness graph로 직접 쓰지 않습니다.
- raw project graph dump, raw log, raw transcript를 승격하지 않습니다.
- memory, project knowledge, promotion ledger decision을 completion authority로 취급하지 않습니다.
- denial은 durable evidence이며 denial code와 reason을 포함해야 합니다.
- unsafe promotion denial은 무관한 workflow를 막지 않습니다.
- controlled rollout approval 전에는 planning/staged modernization phase에서 live MemoryGraph 또는 account-root promotion을 수행하지 않습니다.
- MemoryGraph가 unavailable이면 promotion write skip 또는 failure로 보고하고, 성공으로 취급하지 않습니다.
- source project, proposal id, review id, replay id, release manifest id 등 provenance tag를 보존합니다.
- rollback은 `node scripts/runtime-state.mjs rollback-memory-promotion ...`으로 기록하고 기존 audit row를 보존합니다.
