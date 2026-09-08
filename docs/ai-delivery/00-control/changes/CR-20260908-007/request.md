# CR-20260908-007 — request.md

**Title:** Notification-rule scheduler (deferred from `CR-20260908-001` / D-4).

**Source/date:** Stage 7, 2026-09-08. **Status:** `PROPOSED`.

**Scope:** a worker that actually executes `notification_rule` timing — `delayMinutes`,
`quietHours`, `retryBackoffMinutes`, `escalateAfterAttempts` — rather than only recording them.

**Why deferred:** `CR-20260908-001` D-4 delivered the rule model + editor (`RuleCard`) + the
`notify.send()` **enable gate** (a disabled event → `deliveryState: 'suppressed'`,
`lastError: 'rule_disabled'`) + sender-identity stamping, with `config.publish` RBAC and API +
e2e coverage. The scheduler that enforces delay/quiet-hours/escalation is separable execution.

**Acceptance intent:** SRS + FR propagation + API + e2e, or a scoped-out amendment.
