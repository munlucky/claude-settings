# Domain Model

## Ubiquitous Language

| Term | Meaning |
|---|---|
| Approval Request | A pending business request with amount and justification. |
| Reviewer Decision | Approval or rejection with an audit note. |

## Boundary Decisions

- Approval submission and review decision belong to one initial bounded context.
- Notification delivery is deferred until after the request and decision contracts are stable.
