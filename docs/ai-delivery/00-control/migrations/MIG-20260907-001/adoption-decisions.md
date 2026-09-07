# Adoption Decisions (Phase 8) — MIG-20260907-001

## Is there unfinished legacy work to adopt into the new session model?

**No partially-implemented product work exists to adopt.** Phase 2 discovery (see `legacy-artifact-inventory.md`) confirmed:

- Stages 1, 3, 5 are each `COMPLETED` with a single accepted, non-conflicting output document — nothing partial or ambiguous to reconcile.
- Stages 2 and 4 are `SKIPPED_BY_USER` with durable evidence — not "unfinished," a recorded terminal decision for that cycle.
- Stage 6 is `NOT_STARTED` — there is no partial implementation, no in-progress branch, no stale checkpoint, and no uncommitted work of any kind to import. "Nothing started" is not the same as "unfinished work exists"; Phase 8 only requires opening a successor session when there is unfinished work to protect from loss. Here, the correct action is simply to **open a fresh Stage 6 session**, which the successor-session mechanism below does.
- Stage 7 was never available in the legacy pack and has never run.

## Successor session decision

Opened `SESSION-20260907-184230-STAGE-06` under `sessions/active/`, status `RECOVERY_REQUIRED` (per instruction: mark it `RECOVERY_REQUIRED` until the Stage 6 prompt itself verifies the imported state on first use — even though there is no in-progress code to verify, the prompt should still confirm the baseline documents and repository state itself before beginning work, rather than trusting this migration's summary blindly).

The successor session's `input-manifest.md` carries forward:
- Canonical input paths/versions/hashes for FR v1.0, UI/UX v1.0, SRS v1.0.
- The repository revision at hand-off.
- The explicit note that implemented/partial/unverified scope is **none** — completed IDs: none; remaining IDs: all of them (full FR/SCREEN/SRS ID space, per the SRS's own traceability sections).
- Open items: G1 (informational, non-blocking) from `alignment-gap-register.md`.
- Affected dependencies: none stale (nothing has been implemented yet, so nothing can be stale relative to it).
- Last safe commands/results: this migration's file installation and verification steps (see `checkpoint.md` in the migration session).
- Exact next safe action and exact prompt to use: `docs/ai-delivery/prompt-library/current/06_IMPLEMENT_SYSTEM.md`, command `RESUME` or `START STAGE 6`.

`00-control/active-session.md` was set to point at this successor session, satisfying the requirement that a new chat running the Stage 6 prompt will detect the unfinished (here: not-yet-begun-but-registered) session and follow the standard continue/restart question defined in `00_README.md`'s "New-chat startup behavior."

## Why not mark Stage 6 session itself `COMPLETED` or leave `ACTIVE_SESSION: NONE`

`ACTIVE_SESSION: NONE` would be technically defensible (no work has literally started), but the migration prompt directs registering a successor session whenever there is a clearly recommended next stage, so that the next chat is guided directly into it rather than having to re-derive "what's next" from scratch. `RECOVERY_REQUIRED` was chosen over `ACTIVE` because this migration is not itself qualified to certify that the Stage 6 prompt's own preconditions (e.g., any environment/tooling assumptions in the SRS) are satisfied — that verification belongs to the Stage 6 prompt's own startup protocol, run by whichever session actually begins implementation work.
