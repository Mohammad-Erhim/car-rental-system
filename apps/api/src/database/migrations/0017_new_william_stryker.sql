ALTER TABLE "translation" ADD COLUMN "published_value" text;--> statement-breakpoint
UPDATE "translation" SET "published_value" = "value" WHERE "status" = 'published';--> statement-breakpoint
-- legacy placeholder revisions ('seed-1.0', 'lookup-edit') are not real content hashes; clear them
-- so the Translations screen treats these rows as "baseline unknown" (not "outdated") until the
-- next seed or edit stamps a real hash.
UPDATE "translation" SET "source_revision" = NULL WHERE "source_revision" IN ('seed-1.0', 'lookup-edit');
