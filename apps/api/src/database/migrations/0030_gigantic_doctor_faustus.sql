CREATE TABLE IF NOT EXISTS "staff_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"organization_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"archived_at" timestamp with time zone,
	CONSTRAINT "staff_group_org_code_unq" UNIQUE("organization_id","code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_group_member" (
	"group_id" uuid NOT NULL,
	"staff_profile_id" uuid NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_permission_override" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"staff_profile_id" uuid NOT NULL,
	"action" text NOT NULL,
	"effect" text NOT NULL,
	"valid_until" timestamp with time zone,
	"reason" text,
	"granted_by" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "staff_role_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"staff_profile_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"valid_from" timestamp with time zone DEFAULT now() NOT NULL,
	"valid_until" timestamp with time zone,
	"granted_by" uuid,
	"reason" text
);
--> statement-breakpoint
ALTER TABLE "role" ADD COLUMN "locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "role" ADD COLUMN "conditions" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "role" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "staff_group_member_pk" ON "staff_group_member" USING btree ("group_id","staff_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "staff_permission_override_unq" ON "staff_permission_override" USING btree ("staff_profile_id","action");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_role_assignment_staff_idx" ON "staff_role_assignment" USING btree ("staff_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "staff_role_assignment_role_idx" ON "staff_role_assignment" USING btree ("role_id");--> statement-breakpoint
-- real foreign keys where the old model used free-text codes
ALTER TABLE "staff_role_assignment" ADD CONSTRAINT "staff_role_assignment_staff_fk" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profile"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "staff_role_assignment" ADD CONSTRAINT "staff_role_assignment_role_fk" FOREIGN KEY ("role_id") REFERENCES "role"("id");--> statement-breakpoint
ALTER TABLE "staff_permission_override" ADD CONSTRAINT "staff_permission_override_staff_fk" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profile"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "staff_group_member" ADD CONSTRAINT "staff_group_member_group_fk" FOREIGN KEY ("group_id") REFERENCES "staff_group"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "staff_group_member" ADD CONSTRAINT "staff_group_member_staff_fk" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profile"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "staff_permission_override" ADD CONSTRAINT "staff_permission_override_effect_chk" CHECK ("effect" IN ('allow','deny'));--> statement-breakpoint
-- system roles are read-only from now on (clone to customise)
UPDATE "role" SET "locked" = true WHERE "is_system" = true;--> statement-breakpoint
-- backfill: one assignment per (staff member, role code) from the old free-text list. An
-- org-specific role wins over a system role of the same code; unknown codes are dropped (they
-- granted nothing before either).
INSERT INTO "staff_role_assignment" ("staff_profile_id", "role_id", "valid_from", "reason")
SELECT DISTINCT ON (sp."id", rc.code) sp."id", r."id", COALESCE(sp."created_at", now()), 'migrated from staff_profile.role_codes'
FROM "staff_profile" sp
CROSS JOIN LATERAL jsonb_array_elements_text(sp."role_codes") AS rc(code)
JOIN "role" r ON r."code" = rc.code AND (r."organization_id" IS NULL OR r."organization_id" = sp."organization_id")
ORDER BY sp."id", rc.code, (r."organization_id" IS NULL);--> statement-breakpoint
ALTER TABLE "staff_profile" DROP COLUMN IF EXISTS "role_codes";--> statement-breakpoint
ALTER TABLE "staff_profile" DROP COLUMN IF EXISTS "approval_limit_minor";--> statement-breakpoint
-- two permissions that no endpoint ever checked
UPDATE "role" SET "permission_actions" = "permission_actions" - 'rental.extend.approve' - 'reservation.override';--> statement-breakpoint
DELETE FROM "permission_action" WHERE "code" IN ('rental.extend.approve', 'reservation.override');