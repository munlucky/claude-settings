# Phase 05 - Core Skills and Managed Upstream Registry

## Objective

Kernel의 핵심 실행 규율을 내부 capability 스킬로 구현하고, 외부 오픈소스 스킬은 pin → diff → eval → 승인 방식으로 관리한다.

## Surface Classification

- `source_only`: derived skills, registry, eval fixtures, docs.
- `external_deployment_or_service`: upstream read-only 조회만 허용.
- 자동 다운로드·자동 profile 설치·자동 적용 금지.

## Owned Paths

```text
skills/kernel-minimal-correct-change/**
skills/kernel-domain-modeling/**
skills/kernel-tracer-slicing/**
skills/kernel-tdd/**
skills/kernel-diagnosing-bugs/**
skills/kernel-verification-before-completion/**
skills/kernel-review-spec/**
skills/kernel-review-standards/**
skills/kernel-review-complexity/**
kernel/upstream-registry.yaml
scripts/kernel/upstream-check.mjs
scripts/kernel/skill-eval.mjs
schemas/kernel.upstream-source.schema.json
schemas/kernel.skill-eval.schema.json
tests/fixtures/kernel-skills/**
tests/kernel-minimal-change-skill.test.mjs
tests/kernel-core-skills.test.mjs
tests/kernel-upstream-registry.test.mjs
```

## Read-Only Paths

```text
docs/public/guidelines/external-skill-pattern-transfer.md
skills/**
tools/evals/**
catalog/**
```

## Requirements

- KRN-REQ-008, 009, 010.

## Work

1. 각 스킬이 방지하려는 실패 유형과 baseline scenario를 먼저 작성한다.
2. Ponytail에서 minimality ladder, root-cause shared seam, safety exclusions만 derived 형태로 채택한다.
3. Matt Pocock Skills에서 domain glossary, tracer slices, TDD, debugging, spec/standards review 축을 재구성한다.
4. 핵심 스킬은 user-invoked가 아니라 Kernel entrypoint가 호출하는 model-invoked capability로 둔다.
5. registry에 source repo, pinned commit, license, adopted/rejected patterns, checksum, last check, eval suite를 기록한다.
6. upstream 변경은 proposal만 생성하며 source나 profile을 수정하지 않는다.
7. skill update는 기존·신규 A/B eval과 독립 검토가 통과해야 승격한다.

## Acceptance Criteria

- 스킬마다 스킬 부재 시 실패하는 RED scenario와 적용 후 GREEN scenario가 있다.
- 외부 원문의 branding·persona·불필요한 output style은 복사하지 않는다.
- upstream check가 변경을 발견해도 working tree를 수정하지 않는다.
- public Kernel catalog에는 entrypoint 하나와 명시적 utility만 노출된다.
- completion skill은 runtime authority를 대체하지 않는다.

## Spec-Test Obligations

- over-engineering, duplicate util, stdlib/native reuse, root-cause fix, trust-boundary validation 보존 시나리오.
- glossary conflict와 ADR 생성 조건 시나리오.
- upstream checksum mismatch와 unreviewed update 거부 시나리오.

## Verification

```bash
node --test tests/kernel-minimal-change-skill.test.mjs tests/kernel-core-skills.test.mjs tests/kernel-upstream-registry.test.mjs
npm run test:eval
npm test
```

## Evidence

```text
artifacts/kernel/phase-05/skill-red-green-report.json
artifacts/kernel/phase-05/upstream-registry-audit.json
artifacts/kernel/phase-05/skill-ab-eval.json
```

## Risks and Rollback

- 스킬 수가 다시 증가할 수 있다. 새 public skill은 금지하고 capability owner를 우선한다.
- upstream 최신성보다 재현성과 평가 통과를 우선한다.