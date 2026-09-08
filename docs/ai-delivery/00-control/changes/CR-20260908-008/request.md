# CR-20260908-008 — request.md

**Title:** Pre-prod CI gate backlog (Stage 7 environment-blocked gates).

**Source/date:** Stage 7 (`SESSION-20260907-185500-STAGE-07`), 2026-09-08. **Status:** `PROPOSED`.

**Scope:** stand up the 4 gates that need tooling absent from the Stage 7 authoring host, on a
CI runner / a host with headroom:

| Gate                                                        | Stage 7 internal-evidence substitute (green)                                                   |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Firefox + WebKit engine `verify:e2e` (`E2E_ALL_BROWSERS=1`) | Chromium `verify:e2e` on 3 viewports (laptop 40 / tablet 37 / phone 42)                        |
| k6 write-path load test                                     | `verify:perf` (autocannon; hot-read p95 <= 40 ms, 0 err)                                       |
| OWASP ZAP (DAST) + a SAST pass                              | `verify:security` adversarial suite (13) + `check:secrets` + helmet/CORS/CSRF/rate-limit gates |
| Lighthouse LCP/INP field run                                | `verify:perf` + `verify:a11y` (axe, 0 serious/critical) + `verify:seo`                         |

**Context:** at the Stage 7 close (2026-09-08) the owner **accepted** these as documented pre-prod
follow-ups ("accept them"). They are recorded `BLOCKED` (not downgraded) in
`05-system-validation/final-report.md` §7 and `baseline-alignment.md`. This CR tracks closing
them before production.

**Acceptance intent:** each gate runs green in CI, or a finding it surfaces is filed as its own
defect/CR.
