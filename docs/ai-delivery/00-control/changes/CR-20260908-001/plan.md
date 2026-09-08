# CR-20260908-001 — plan.md

**Decision (2026-09-08):** the user gave full authorization to **build** the deferred scope items
autonomously (best practices, long-running). Not scoped out.

Propagation per item: FR/UI-UX/SRS text (or traceability status where the base requirement
already specified the behaviour) → code + migrations → API + e2e tests → doc propagation →
Stage 7 regression. One item at a time, each with its own e2e + traceability row. See
`verification.md` for the per-item tracker.

**Build order (all complete 2026-09-08):** D-1 extras/protection → S7-DEF-006 usage counts →
D-6 unified search → D-3 locations editor → write-side halves (restriction enforcement, customer
merge, template event-rules). **Next:** CR-20260907-001 reconciliation + D-7 (user) → Phase 4
full regression + Stage 7 close.

**Done (2026-09-08):** D-1 (extras/protection vertical slice), D-2 (read + write: eligibility
restrictions + reversible merge), D-3 (locations editor), D-4 (content + event-rules), D-5
(outbox), D-6 (unified search), S7-DEF-006 (usage counts). Migrations `0007`–`0011`. openapi 134
paths, i18n 968 keys/locale. See `verification.md` for the per-item evidence + deferred depth.
