# Skill Readiness Policy

Canonical source guideline for skill consultation evidence.

Read task-relevant skills before execution when the task profile depends on those skills. Do not read every skill by default. Record which required skills were detected, consulted, missing, or advisory.

## Evidence Shape

```yaml
skillReadiness:
  detectedTaskProfiles:
    - code
    - docs
  requiredSkills:
    - moonshot-phase-runner
  consultedSkills:
    - path: "skills/moonshot-phase-runner/SKILL.md"
      sha: ""
  missingSkills: []
  gate:
    status: pass | blocked | advisory
```

Skill readiness is evidence about preparation. It is not a public runtime surface change and it is not completion authority.
