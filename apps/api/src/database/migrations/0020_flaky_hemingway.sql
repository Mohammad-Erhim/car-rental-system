-- A plain UNIQUE(organization_id, code) never actually blocked a second `(NULL, code)` row —
-- standard SQL treats NULL <> NULL, so re-running the seed script against a database that
-- already had roles silently inserted a duplicate `role` row per system role instead of updating
-- the existing one (caught live: the ops roles list showed every system role twice). Nothing
-- references `role.id` as a foreign key — staff assignment stores `role_codes` (an array of the
-- code string) — so collapsing duplicate code+null-org rows down to the oldest one is safe: keep
-- the first-created row per (code, organization_id) pair, delete the rest.
DELETE FROM "role" a USING "role" b
  WHERE a.code = b.code
    AND a.organization_id IS NOT DISTINCT FROM b.organization_id
    AND (a.created_at, a.id) > (b.created_at, b.id);
--> statement-breakpoint
DROP INDEX IF EXISTS "role_org_code_unq";--> statement-breakpoint
ALTER TABLE "role" ADD CONSTRAINT "role_org_code_unq" UNIQUE NULLS NOT DISTINCT("organization_id","code");