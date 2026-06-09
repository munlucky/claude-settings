# C4 Context

## System Boundary

Moonshot Relay is a local workflow harness used by Claude and Codex to plan, execute, verify, package, and close out software work.

```mermaid
flowchart LR
  User[User] --> PublicSkills[Public Runtime Skills]
  PublicSkills --> Source[Moonshot Relay Source Checkout]
  Source --> Package[Package and Installer]
  Package --> Claude[Claude Account Profile]
  Package --> Codex[Codex Account Profile]
  Package --> Home[MOONSHOT_RELAY_HOME]
  PublicSkills --> RuntimeState[Runtime State DB]
  PublicSkills --> Verification[Verification Plane]
  PublicSkills --> Knowledge[Project Knowledge Plane]
```

Requirement links: REQ-101, REQ-102, REQ-103, REQ-104, REQ-105, REQ-106, REQ-107.
