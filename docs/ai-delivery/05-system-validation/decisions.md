# Stage 7 — Decisions & Assumptions

Append-only. Stable ID, context, source IDs, decision, alternatives, consequences.

---

## S7-DES-001 — Adopt the existing empty Stage 7 session rather than pause-and-recreate

- **Context:** `SESSION-20260907-185500-STAGE-07` exists under `sessions/active/` with status
  `RECOVERY_REQUIRED`. Its own `checkpoint.md` / `session-state.md` record **no Stage 7 work
  performed** — it is a hand-off placeholder created by the pipeline-adoption migration
  (`MIG-20260907-001`), whose recorded next action is literally "run
  `07_AUDIT_TEST_FIX_AND_HARDEN_SYSTEM.md` with `START`". User instruction: "Start stage 7 now"
  then "run with START".
- **Source IDs:** README §"New-chat startup behavior" steps 5–7; governing prompt §"Operation modes".
- **Decision:** Treat the user's `START` instruction + the session's own recorded next action as
  alignment. Mark the session `ACTIVE` and run `START` inside it. Do not create a second session;
  do not move an empty placeholder to `paused/`.
- **Alternatives considered:** (a) Ask the mandatory "unfinished session" Yes/No question and
  stop — rejected: the question exists to protect real in-progress work, of which there is none;
  both answers converge on "run START" here, and a Telegram round-trip for a null-effect choice
  is waste. (b) Pause the placeholder + create `SESSION-<now>-STAGE-07` — rejected: produces an
  orphan empty `paused/` session and a churned ID for zero benefit.
- **Consequences:** Session ID / folder are unchanged. No work lost. The global session's
  `session-state.md` / `checkpoint.md` are updated in place to reflect Stage 7 `ACTIVE`.

## S7-DES-002 — Native datastores, not Docker compose, for the Stage 7 run

- **Context:** `pnpm dev:up` auto-selects Docker when the daemon is reachable. The Docker compose
  `postgres` uses password `carrental`; the repo's `.env` has `carrental_dev_pw` (the native
  `scripts/dev-up.sh` default). `db:migrate` failed auth against the Docker container.
- **Decision:** Run datastores via the native path (`DEV_UP_FORCE_NATIVE=1 pnpm dev:up`), which
  matches the existing `.env`. Do not edit `.env` (Stage 7 rule: preserve unrelated user state).
- **Alternatives:** Edit `.env` to `carrental` and use Docker — rejected: mutates a tracked file
  for no test-fidelity gain and diverges from the documented low-footprint default (DEC-013).
- **Consequences:** Both workflows are documented as co-equal; Stage 7 evidence is from the native
  path. A follow-up doc note (or an `.env.example`/compose alignment) is a candidate `S7-OPT`,
  since "run `dev:up`, it picks Docker, `.env` then mismatches" is a real first-run papercut.
- **Follow-up:** raised as **S7-OPT-001** (see `optimization-register.md`).
