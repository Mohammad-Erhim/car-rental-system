# Work Queue — SESSION-20260907-185500-STAGE-07

Not yet started — Stage 7 builds its own dependency-aware work queue during Phase 0/1/2 of
`07_AUDIT_TEST_FIX_AND_HARDEN_SYSTEM.md`. Seed items carried in from this migration's
`alignment-gap-register.md`, for Stage 7 to fold into its own queue rather than treat as already
resolved:

| ID | Item | Status |
|---|---|---|
| SEED-1 | Reconcile/close `CR-20260907-001` (FR/Design/SRS documentation drift vs. Enhancement Program) | `NOT_STARTED` |
| SEED-2 | Port legacy customer-flow e2e specs to `apps/site`; get `verify:e2e` green | `NOT_STARTED` |
| SEED-3 | Run `verify:seo` / `verify:perf` against `apps/site` | `NOT_STARTED` |
| SEED-4 | Authenticated `apps/site` flows (auth/account/trips/checkout) | `NOT_STARTED` |
| SEED-5 | Widen `/ops` QA-matrix coverage to all reworked screens | `NOT_STARTED` |
| SEED-6 | Derive `04-implementation/traceability-matrix.md` (not previously maintained) | `NOT_STARTED` |
