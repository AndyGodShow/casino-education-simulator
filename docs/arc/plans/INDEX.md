# Arc Implementation Plan Index

| Plan | Title | Priority | Effort | Depends on | Status | Last touched | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `2026-07-13-world-cup-reliability-data-remediation-implementation.md` | Harden World Cup reliability and data lifecycle | P1 | L | — | IN PROGRESS | 2026-07-15 | Tasks 1–11 pass; task 12 is at AUTH_GATE because production is not on the candidate and administrative/restore evidence is unavailable. |
| `2026-07-13-frontend-runtime-remediation-implementation.md` | Repair frontend loading and refresh behavior | P1 | L | World Cup tasks 1–11 | DONE | 2026-07-14 | Tasks 1–8 pass completion review and all local quality gates. |
| `2026-07-13-accessibility-test-maintenance-remediation-implementation.md` | Complete accessibility and test maintenance remediation | P1 | L | Frontend runtime tasks 1–8 | DONE | 2026-07-14 | Tasks 1–17 pass completion review and all repository gates. |
| `2026-07-13-dead-code-export-remediation-implementation.md` | Eliminate dead-code export noise | P1 | M | Accessibility/test-maintenance tasks 1–17 | DONE | 2026-07-15 | Tasks 1–13 pass completion review; Knip reports zero issues and all repository gates pass. |
| `2026-07-15-test-type-contract-remediation-implementation.md` | Enforce strict test type contracts | P1 | M | Dead-code export remediation tasks 1–13 | IN PROGRESS | 2026-07-15 | Repair the review finding: 45 strict TypeScript errors across 19 test files. |

## Recommended order

1. World Cup reliability/data tasks 1–11.
2. Frontend runtime tasks 1–8, with a drift check on shared World Cup files.
3. Accessibility/test-maintenance tasks 1–17.
4. Dead-code export remediation tasks 1–13.
5. World Cup reliability/data task 12 production control-plane verification.
6. Test type-contract remediation before merge.

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
