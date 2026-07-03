---
name: moonshot-retro
description: 작업 회고 수집, 일일 패턴 분석, 하네스 개선 proposal 또는 local issue draft 생성을 advisory 단계로 수행할 때 사용합니다.
triggers:
  - "retro collect"
  - "daily retro"
  - "회고"
  - "하네스 개선 후보"
---

# Moonshot Retro

## Role

작업 closeout 요약을 compact하게 수집하고, account-root retro inbox로 가져온 뒤, 일일 반복 패턴과 advisory harness improvement proposal 또는 local issue draft를 만든다.

이 skill은 verification, score, closeout, promotion, installed profile, runtime DB authority를 바꾸지 않는다.

## Commands

```bash
moonshot-relay retro collect --project <id> --task-id <taskId> --task-root <dir> --date <YYYY-MM-DD> --out .moonshot-relay/retro-outbox/<YYYY-MM-DD> --json
moonshot-relay retro import --project <id> --from .moonshot-relay/retro-outbox/<YYYY-MM-DD> --date <YYYY-MM-DD> --json
moonshot-relay retro daily --project <id> --date <YYYY-MM-DD> --json
moonshot-relay retro propose --project <id> --date <YYYY-MM-DD> --json
moonshot-relay retro issue-draft --project <id> --date <YYYY-MM-DD> --json
```

## Hard Stops

- raw log, prompt, transcript, browser scrape, MemoryGraph dump, KG dump, ontology dump, secret-like string을 retro record에 복사하지 않는다.
- retro output을 completion authority로 취급하지 않는다.
- 초기 workflow에서는 remote GitHub issue를 생성하지 않는다.
- retro finding만으로 `.claude/**`, `.codex/**`, account-root profile, source file을 자동 변경하지 않는다.

## Required Evidence

- 생성 JSON과 proposal artifact는 `promotionAuthority: false`를 가져야 한다.
- schema, redaction, aggregation, proposal, issue draft, CLI routing focused test가 있어야 한다.
- source implementation 완료 주장은 `npm test` 이후에만 한다.

