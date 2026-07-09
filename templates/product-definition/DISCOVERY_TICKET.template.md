# Discovery Ticket

schema: schemas/discovery-map.schema.json#/defs/ticket

## Fields

```yaml
id: ""
title: ""
type: "research | prototype | grilling | task"
humanInLoop: false
status: "open | claimed | resolved | blocked | out_of_scope"
dependsOn: []
question: ""
owner: ""
humanDecisionRequired: false
decisionOwner: ""
factEvidence: []
acceptedInto: []
outOfScopeReason: ""
linkedEvidence: []
resolutionSummary: ""
graduatedFromFog: ""
```

## Resolution Rule

Facts may resolve from evidence. Human decisions require user/operator approval, accepted ADR, accepted architecture handoff, or another explicit decision record. A ticket cannot promote into `SPEC`, `PLAN`, phase metadata, or ADR while the required human decision is unresolved.
