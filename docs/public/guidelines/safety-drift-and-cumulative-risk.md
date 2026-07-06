# Safety Drift And Cumulative Risk

Canonical source guideline for long-running risk evidence.

Long-running phase work must consider aggregate direction, not only individual turns. If a conversation or plan starts to converge on risky dual-use, exploit-enabling, sensitive-data, or prompt-injection behavior, record that as evidence and route to the appropriate reviewer or blocker.

## Evidence Shape

```yaml
cumulativeRisk:
  dualUse: none | low | elevated | blocked
  cyberUplift: none | defensive | exploit_enabling | blocked
  sensitiveDataExposure: none | possible | confirmed
  promptInjectionSeen: false
  priorRefusalOrBlocker:
    present: false
    reason: ""
  carryForwardAction:
    - restrict_to_defensive_summary
```

Start with runtime event or verification evidence payloads. Add database migration only when an implementation phase proves persistence requirements that cannot be met by existing runtime events.
