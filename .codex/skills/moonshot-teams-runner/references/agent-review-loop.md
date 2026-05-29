# Agent Review Loop

- Give each agent the goal, scope, file boundaries, and expected output.
- Tell workers they are not alone in the codebase and must not revert others' edits.
- Wait only when the parent is blocked on the result.
- Close agents when their result is integrated or rejected.
- Parent evidence must record findings, accepted changes, and rerun checks.
