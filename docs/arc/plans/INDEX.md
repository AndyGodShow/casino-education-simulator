# Arc Implementation Plan Index

| Plan | Title | Priority | Effort | Depends on | Status | Last touched | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `2026-07-13-world-cup-reliability-data-remediation-implementation.md` | Harden World Cup reliability and data lifecycle | P1 | L | — | IN PROGRESS | 2026-07-13 | Execute tasks 1–11 first; hold task 12 for final production closure. |
| `2026-07-13-frontend-runtime-remediation-implementation.md` | Repair frontend loading and refresh behavior | P1 | L | World Cup tasks 1–11 | TODO | 2026-07-13 | Preserve staged optional-cloud publication during coordinator extraction. |
| `2026-07-13-accessibility-test-maintenance-remediation-implementation.md` | Complete accessibility and test maintenance remediation | P1 | L | Frontend runtime tasks 1–8 | TODO | 2026-07-13 | Task 15 establishes the exact Knip inventory; task 17 closes the C-plan gate. |
| `2026-07-13-dead-code-export-remediation-implementation.md` | Eliminate dead-code export noise | P1 | M | Accessibility/test-maintenance tasks 1–17 | TODO | 2026-07-13 | Execute all 12 tasks (11 cleanup batches plus the final gate) before production closure. |

## Recommended order

1. World Cup reliability/data tasks 1–11.
2. Frontend runtime tasks 1–8, with a drift check on shared World Cup files.
3. Accessibility/test-maintenance tasks 1–17.
4. Dead-code export remediation tasks 1–12.
5. World Cup reliability/data task 12 production control-plane verification.

## Dependency notes

- Frontend refresh extraction depends on staged cloud loading and the provenance contract from the World Cup reliability plan.
- Accessibility and maintenance remediation runs after frontend runtime work so its E2E baselines observe the final loading/retry behavior.
- Dead-code cleanup depends on the exact Knip inventory generated and gated by the accessibility/test-maintenance plan.
- Production verification depends on every repository plan and full quality gate being complete.

## Considered and rejected

- Serverless in-memory rate limiting: rejected because instances do not share a reliable request budget.
- Ignoring arbitrary public GET query parameters: rejected because each variant creates a distinct CDN cache key.

## Deferred findings

None.
